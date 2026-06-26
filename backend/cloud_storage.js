'use strict';

const crypto = require('crypto');
const path = require('path');

const R2_PREFIX = 'r2:';

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function getConfig() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.R2_BUCKET;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = (process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  const prefix = trimSlashes(process.env.CLOUDFLARE_R2_PREFIX || process.env.R2_PREFIX || 'payroll-system');

  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint, publicUrl, prefix };
}

function isConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey && cfg.endpoint);
}

function isCloudRef(value) {
  return String(value || '').startsWith(R2_PREFIX);
}

function toCloudRef(key) {
  return `${R2_PREFIX}${trimSlashes(key)}`;
}

function fromCloudRef(value) {
  const text = String(value || '');
  return isCloudRef(text) ? text.slice(R2_PREFIX.length) : text;
}

function publicUrlForKey(key) {
  const cfg = getConfig();
  if (!cfg.publicUrl) return null;
  return `${cfg.publicUrl}/${encodePath(key)}`;
}

function getFileUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (isCloudRef(text)) {
    const publicUrl = publicUrlForKey(fromCloudRef(text));
    return publicUrl || `/api/cloud-file?ref=${encodeURIComponent(text)}`;
  }
  return text;
}

function safeExt(originalName, fallback = '.bin') {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return /^[.][a-z0-9]{1,12}$/.test(ext) ? ext : fallback;
}

function safeName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';
}

function buildObjectKey(folder, filename) {
  const cfg = getConfig();
  return [cfg.prefix, trimSlashes(folder), safeName(filename)].filter(Boolean).join('/');
}

function encodePath(key) {
  return String(key || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function signingKey(secret, dateStamp) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function signedHeaders(method, key, bodyHash, contentType = '') {
  const cfg = getConfig();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(cfg.endpoint).host;
  const encodedKey = encodePath(key);
  const canonicalUri = `/${cfg.bucket}/${encodedKey}`;

  const headers = {
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaderNames = sortedNames.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaderNames,
    bodyHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, dateStamp), stringToSign, 'hex');

  return {
    url: `${cfg.endpoint}${canonicalUri}`,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    },
  };
}

async function uploadBuffer({ key, buffer, contentType }) {
  if (!isConfigured()) throw new Error('Cloudflare R2 storage is not configured.');
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const bodyHash = sha256(body);
  const signed = signedHeaders('PUT', key, bodyHash, contentType || 'application/octet-stream');

  const response = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`R2 upload failed (${response.status}): ${detail || response.statusText}`);
  }

  return toCloudRef(key);
}

async function getObjectBuffer(refOrKey) {
  if (!isConfigured()) throw new Error('Cloudflare R2 storage is not configured.');
  const key = fromCloudRef(refOrKey);
  const signed = signedHeaders('GET', key, 'UNSIGNED-PAYLOAD');
  const response = await fetch(signed.url, { method: 'GET', headers: signed.headers });
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function deleteObject(refOrKey) {
  if (!isConfigured()) return false;
  const key = fromCloudRef(refOrKey);
  if (!key) return false;
  const signed = signedHeaders('DELETE', key, 'UNSIGNED-PAYLOAD');
  const response = await fetch(signed.url, { method: 'DELETE', headers: signed.headers });
  return response.ok || response.status === 404;
}

async function sendObjectToResponse(refOrKey, res, fallbackName = 'file') {
  const publicUrl = isCloudRef(refOrKey) ? publicUrlForKey(fromCloudRef(refOrKey)) : null;
  if (publicUrl) return res.redirect(302, publicUrl);

  const object = await getObjectBuffer(refOrKey);
  if (!object) return res.status(404).send('File not found.');

  res.setHeader('Content-Type', object.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName(fallbackName)}"`);
  res.setHeader('Content-Length', object.buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(object.buffer);
}

module.exports = {
  buildObjectKey,
  deleteObject,
  fromCloudRef,
  getFileUrl,
  isCloudRef,
  isConfigured,
  safeExt,
  safeName,
  sendObjectToResponse,
  toCloudRef,
  uploadBuffer,
};
