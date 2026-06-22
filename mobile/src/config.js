// ── Switch between environments here ──────────────────────
//
// LOCAL (WiFi, same network as PC):
//   'http://192.168.68.128:12687/api'
//
// PRODUCTION (Railway — works on any internet connection):
//   'https://YOUR-APP.up.railway.app/api'
//
// Change ACTIVE_ENV below to switch.

const ENV = {
  local:      'http://192.168.68.128:12687/api',
  production: 'https://payroll-system-production-6f3a.up.railway.app/api',
};

// Set to 'production' before building the APK
const ACTIVE_ENV = 'production';

export const API_BASE_URL = ENV[ACTIVE_ENV];
