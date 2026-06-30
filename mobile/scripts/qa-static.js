const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const config = read('src/config.js');
const appConfig = read('app.json');
const auth = read('src/context/AuthContext.js');
const socket = read('src/api/socket.js');

if (!config.includes('EXPO_PUBLIC_API_BASE_URL')) failures.push('API URL cannot be configured per build environment.');
if (!config.includes('https://hris.astreablue.com/api')) failures.push('Production API is not the release default.');
if (/YOUR_[A-Z0-9_]+_HERE/.test(appConfig)) failures.push('Placeholder native configuration remains in app.json.');
if (!appConfig.includes('"blockedPermissions"') || !appConfig.includes('android.permission.RECORD_AUDIO')) {
  failures.push('Unused microphone permission is not explicitly blocked.');
}
if (!auth.includes("api.get('/session')")) failures.push('Saved mobile sessions are not verified with the server.');
if (!socket.includes('session_cookie') || !socket.includes('extraHeaders')) failures.push('Socket.IO does not send the authenticated session cookie.');

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log('Mobile static QA checks passed.');
