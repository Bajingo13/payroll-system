// ── Switch between environments here ──────────────────────
//
// LOCAL (WiFi, same network as PC):
//   'http://192.168.68.122:12687/api'
//
// PRODUCTION (Railway — works on any internet connection):
//   'https://hris.astreablue.com/api'
//
// Change ACTIVE_ENV below to switch.

const ENV = {
  local:      'http://192.168.68.136:12687/api',
  production: 'https://hris.astreablue.com/api',
};

// Set to 'production' before building the APK
const ACTIVE_ENV = 'production';

export const API_BASE_URL = ENV[ACTIVE_ENV];
