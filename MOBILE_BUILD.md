# CoAIleague Mobile App Build Guide

This guide explains how to build CoAIleague as a native mobile app for Android and iOS using Capacitor.

## Prerequisites

### For Android APK:
- Node.js 18+
- Android Studio (for building APK)
- Java JDK 17+

### For iOS:
- Mac computer with Xcode 15+
- Apple Developer Account (for distribution)

## Quick Start

### 1. Build the Web App
```bash
npm run build
```

### 2. Initialize Capacitor (First Time Only)
```bash
# Add Android platform
npx cap add android

# Add iOS platform (Mac only)
npx cap add ios
```

### 3. Sync Web Assets to Native Projects
```bash
npx cap sync
```

### 4. Build Android APK

#### Option A: Using Android Studio
```bash
npx cap open android
```
Then in Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)

#### Option B: Command Line
```bash
cd android
./gradlew assembleDebug
```
APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Build iOS (Mac Only)
```bash
npx cap open ios
```
Then build from Xcode.

## Useful Commands

| Command | Description |
|---------|-------------|
| `npx cap sync` | Sync web assets to native projects |
| `npx cap run android` | Run on connected Android device |
| `npx cap run ios` | Run on iOS simulator |
| `npx cap open android` | Open in Android Studio |
| `npx cap open ios` | Open in Xcode |
| `npm run build:icons` | Regenerate app icons |

## App Configuration

The Capacitor configuration is in `capacitor.config.ts`:

- **App ID**: `com.coaileague.app`
- **App Name**: CoAIleague
- **Theme**: Dark (#0f172a)

## Icon Sizes Generated

- 16x16, 32x32 (favicon)
- 72x72, 96x96, 128x128, 144x144, 152x152 (Android/iOS)
- 192x192, 384x384, 512x512 (PWA/high-res)

## Release Build

For production APK with signing:

1. Generate a keystore:
```bash
keytool -genkey -v -keystore coaileague.keystore -alias coaileague -keyalg RSA -keysize 2048 -validity 10000
```

2. Update `android/app/build.gradle` with signing config

3. Build release:
```bash
cd android
./gradlew assembleRelease
```

## Troubleshooting

### "JAVA_HOME not set"
Install JDK 17 and set JAVA_HOME environment variable.

### "Android SDK not found"
Install Android Studio and configure SDK path in `local.properties`.

### iOS build fails
Ensure you have Xcode Command Line Tools installed:
```bash
xcode-select --install
```
