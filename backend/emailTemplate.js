'use strict';

// ── HTML escape ───────────────────────────────────────────────────────────────
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Status badge ──────────────────────────────────────────────────────────────
function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  let bg = '#f1f5f9', color = '#475569';
  if (s === 'approved')               { bg = '#dcfce7'; color = '#15803d'; }
  else if (s === 'rejected')          { bg = '#fee2e2'; color = '#b91c1c'; }
  else if (s === 'for review' || s === 'pending') { bg = '#fef9c3'; color = '#854d0e'; }
  return `<span style="display:inline-block;padding:4px 14px;border-radius:20px;background:${bg};color:${color};font-size:12px;font-weight:700;letter-spacing:0.5px;">${esc(status)}</span>`;
}

// ── Detail row ────────────────────────────────────────────────────────────────
function detailRow(label, value, idx, isStatus = false) {
  const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
  const valueCell = isStatus ? value : `<span style="color:#0f172a;font-size:14px;">${esc(value)}</span>`;
  return `
    <tr style="background:${bg};">
      <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#64748b;white-space:nowrap;border-bottom:1px solid #f1f5f9;width:38%;">${esc(label)}</td>
      <td style="padding:11px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #f1f5f9;">${valueCell}</td>
    </tr>`;
}

// ── CTA button ────────────────────────────────────────────────────────────────
function ctaButton(label, url) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:#1d4ed8;border-radius:10px;">
          <a href="${esc(url)}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">${esc(label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Or copy this link: <a href="${esc(url)}" style="color:#3b82f6;word-break:break-all;">${esc(url)}</a></p>`;
}

// ── Warning box (for rejection reason) ───────────────────────────────────────
function warningBox(label, message) {
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border-radius:10px;overflow:hidden;border:1px solid #fecaca;background:#fff5f5;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;">${esc(message)}</p>
        </td>
      </tr>
    </table>`;
}

// ── Main template builder ─────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}   opts.title          - Short label shown in the header bar (e.g. "Leave Request — Approved")
 * @param {string}   opts.recipientName  - Employee first/full name
 * @param {string}   opts.intro          - Opening paragraph
 * @param {Array}    opts.rows           - [{ label, value, isStatus? }]
 * @param {string}  [opts.rejectionReason] - If present, renders a red warning box
 * @param {string}   opts.closing        - Closing paragraph
 * @param {object}  [opts.cta]           - { label, url } renders a button
 * @param {string}  [opts.companyName]   - Defaults to "AstreaBlue Intelligence Inc."
 */
function buildEmail(opts) {
  const {
    title         = '',
    recipientName = 'there',
    intro         = '',
    rows          = [],
    rejectionReason,
    closing       = '',
    cta,
    companyName   = 'AstreaBlue Intelligence Inc.',
  } = opts;

  const rowsHtml = rows.map((r, i) =>
    detailRow(r.label, r.value, i, r.isStatus)
  ).join('');

  const rejectionHtml = rejectionReason
    ? warningBox('Rejection Reason', rejectionReason)
    : '';

  const ctaHtml = cta ? ctaButton(cta.label, cta.url) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 32px rgba(15,23,42,0.10);">

          <!-- ── Header ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:30px 32px 24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
                <span style="color:#ffffff;">Astrea</span><span style="color:#7dd3fc;">Blue</span>
              </p>
              <p style="margin:0;font-size:10px;font-weight:700;color:#93c5fd;letter-spacing:2.5px;text-transform:uppercase;">
                HRIS &amp; Payroll System
              </p>
            </td>
          </tr>

          <!-- ── Title bar ── -->
          <tr>
            <td style="background:#1e40af;padding:10px 32px;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#bfdbfe;letter-spacing:1.5px;text-transform:uppercase;">
                ${esc(title)}
              </p>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:32px 32px 24px;">

              <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">
                Hi ${esc(recipientName)},
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.75;">
                ${esc(intro)}
              </p>

              <!-- Details table -->
              ${rows.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
                ${rowsHtml}
              </table>` : ''}

              ${rejectionHtml}
              ${ctaHtml}

              <p style="margin:${cta ? '20px' : '0'} 0 0;font-size:14px;color:#475569;line-height:1.75;">
                ${esc(closing)}
              </p>

            </td>
          </tr>

          <!-- ── Divider ── -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#e2e8f0;"></div>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e3a8a;">
                ${esc(companyName)}
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
                This is an automated message from the HRIS &amp; Payroll System.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
          &copy; ${new Date().getFullYear()} ${esc(companyName)}. All rights reserved.
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { buildEmail, statusBadge, esc };
