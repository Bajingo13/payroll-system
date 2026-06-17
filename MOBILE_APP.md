# Astrea Employee Mobile App

This project now includes native mobile app projects using Capacitor:

- Android: `android/`
- iOS: `ios/`

The mobile app uses the same React employee UI and the same payroll-system backend APIs.

## Backend URL

Phones cannot call your computer's `localhost`. Before building for a physical phone, set the API URL that the phone can reach:

```env
VITE_API_BASE_URL=http://YOUR_SERVER_OR_LAN_IP:12687/api
```

Example:

```env
VITE_API_BASE_URL=http://192.168.68.135:12687/api
```

For production iOS/Android releases, use HTTPS when possible.

## Build Web Assets And Sync Native Projects

```bash
npm run mobile:build
```

This runs the React build and copies it into the Android and iOS projects.

## Android APK

Requirements:

- Android Studio
- Android SDK
- JDK installed and `JAVA_HOME` set

Open the Android project:

```bash
npm run mobile:android
```

Then build/run from Android Studio.

For a command-line debug APK on Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The debug APK will be generated under:

```text
android/app/build/outputs/apk/debug/
```

## iOS App

Requirements:

- macOS
- Xcode
- Apple Developer signing account for device/App Store distribution

Open the iOS project on a Mac:

```bash
npm run mobile:ios
```

Then use Xcode to sign, run, archive, and export the app.

## After Code Changes

Every time the React app changes:

```bash
npm run mobile:build
```

Then rebuild from Android Studio or Xcode.
