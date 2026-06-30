const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const server = read('server.js');
if (!server.includes("app.use('/api', apiSecurity)")) failures.push('Global API security middleware is missing.');
if (server.includes("process.env.SESSION_SECRET || 'payroll_secret_key'")) failures.push('Unsafe production session-secret fallback is present.');
if (!server.includes('MySqlSessionStore')) failures.push('Persistent session store is missing.');

const frontendFiles = walk(path.join(root, 'frontend-react', 'src')).filter((file) => /\.(jsx|js)$/.test(file));
for (const file of frontendFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\b(?:window\.)?alert\s*\(/.test(source)) failures.push(`Browser alert remains in ${path.relative(root, file)}.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log('Static QA checks passed.');
