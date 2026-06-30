// ── Switch between environments here ──────────────────────
//
// LOCAL (WiFi, same network as PC):
//   'http://192.168.68.122:12687/api'
//
// PRODUCTION (Railway — works on any internet connection):
//   'https://hris.astreablue.com/api'
//
// Change ACTIVE_ENV below to switch.

const PRODUCTION_API_URL = 'https://hris.astreablue.com/api';

// Release builds use production by default. For local development, set:
// EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:12687/api
export const API_BASE_URL = String(
  process.env.EXPO_PUBLIC_API_BASE_URL || PRODUCTION_API_URL
).replace(/\/$/, '');
