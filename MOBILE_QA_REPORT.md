# Mobile App QA Report

Date: 2026-06-30

## Result

The Android/Expo application passes configuration validation, Expo dependency diagnostics, static release checks, and Android JavaScript bundling. It is **not yet ready for a usable release APK** because the configured production API currently returns HTTP 502.

## Passed checks

- Expo Doctor: 17/17 checks passed.
- Android production bundle: generated successfully (1,038 modules).
- Expo application configuration resolves successfully.
- Preview EAS profile produces an APK (`android.buildType: apk`).
- Production EAS profile produces an Android App Bundle.
- Camera, foreground location, notifications, image selection, document selection, and file sharing dependencies are installed.
- Release API defaults to `https://hris.astreablue.com/api`.
- Local API development can be enabled with `EXPO_PUBLIC_API_BASE_URL`.
- Restored logins are verified with `/api/session`; expired sessions are cleared.
- Authenticated Socket.IO connections now send the saved session cookie.
- The unused microphone permission and unused placeholder Google Maps key were removed.

## Release blocker

`https://hris.astreablue.com/api/health` returned HTTP `502` during the final QA check. The startup path has since been hardened so a missing `SESSION_SECRET` or session-table initialization failure no longer terminates the Railway process. A redeploy and health check are still required before release.

Required before release:

1. Restore the production backend and database deployment.
2. Confirm `/api/health` returns `200`.
3. Build the preview APK again and complete the physical-device checks below.

## Automated command

From the `mobile` directory:

```bash
npm run qa
```

For dependency diagnostics (requires internet access):

```bash
npm run qa:doctor
```

## Remaining device checks

These require an Android device or emulator and cannot be fully certified through static QA:

- Login and OTP delivery with a real account.
- Camera capture and foreground location accuracy for attendance.
- Android 13+ notification permission and push delivery.
- Document/image picker, payslip saving, and external document opening.
- Background/resume behavior and session expiry.
- Layout checks across small and large Android screens.

## Google Play production note

The project currently uses Expo SDK 51, which compiles against Android API 34. Internal APK distribution remains possible, but a new Google Play submission must target API 35 or later. Upgrade to a current Expo SDK and repeat physical-device regression testing before publishing the production App Bundle.
