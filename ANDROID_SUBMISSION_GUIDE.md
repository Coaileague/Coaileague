# CoAIleague Android Submission Guide

This guide walks you through submitting CoAIleague to the Google Play Store.

## Prerequisites

1. **Google Play Developer Account** - $25 one-time fee at [play.google.com/console](https://play.google.com/console)
2. **GitHub Repository** - Push this code to GitHub for automated builds

## Step 1: Create Your Signing Keystore

On your local computer with Java installed, run:

```bash
keytool -genkey -v -keystore coaileague.keystore -alias coaileague -keyalg RSA -keysize 2048 -validity 10000
```

**IMPORTANT:** Store this keystore file safely! You need the same keystore for ALL future updates.

Save these values:
- Keystore password
- Key alias: `coaileague`
- Key password

## Step 2: Configure GitHub Secrets

1. Go to your GitHub repo > Settings > Secrets and variables > Actions
2. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `KEYSTORE_BASE64` | Run `base64 -i coaileague.keystore` and paste the output |
| `KEYSTORE_PASSWORD` | Your keystore password |
| `KEY_ALIAS` | `coaileague` |
| `KEY_PASSWORD` | Your key password |

## Step 3: Push to GitHub & Build

```bash
git add .
git commit -m "Add Android build configuration"
git push origin main
```

The GitHub Action will automatically:
1. Build the web app
2. Sync with Capacitor
3. Build debug APK (always)
4. Build signed release AAB and APK (if secrets are configured)

## Step 4: Download Your Build

1. Go to GitHub repo > Actions > Latest workflow run
2. Download the `coaileague-release-aab` artifact
3. Extract to get `app-release.aab`

## Step 5: Submit to Google Play

### First-Time Setup (Required)

1. Go to [Google Play Console](https://play.google.com/console)
2. Click "Create app"
3. Fill in:
   - App name: **CoAIleague**
   - Default language: **English (United States)**
   - App or game: **App**
   - Free or paid: **Free** (or Paid)
4. Complete the declarations

### Upload Your App

1. Go to Release > Production (or Internal testing first)
2. Click "Create new release"
3. Upload `app-release.aab`
4. Add release notes
5. Review and roll out

### Required Store Listing

- **App icon**: 512x512 PNG
- **Feature graphic**: 1024x500 PNG
- **Screenshots**: At least 2 phone screenshots
- **Short description**: Up to 80 characters
- **Full description**: Up to 4000 characters
- **Privacy policy URL**: Required

## App Configuration

| Field | Value |
|-------|-------|
| Package Name | `com.coaileague.app` |
| App Name | CoAIleague |
| Version Code | 1 |
| Version Name | 1.0 |

## Updating Your App

1. Update `versionCode` and `versionName` in `android/app/build.gradle`
2. Push to GitHub
3. Download new AAB from GitHub Actions
4. Upload to Google Play Console

## Files Modified

- `android/app/build.gradle` - Signing configuration
- `.github/workflows/android-build.yml` - CI/CD pipeline
- `capacitor.config.ts` - App configuration

**Note:** This project uses Capacitor (not Expo), so EAS Build is not applicable. The `eas.json` file is included for reference but GitHub Actions is the recommended build method.

## Troubleshooting

### "App not installed" error
- Make sure you're installing the signed APK, not debug
- Check device allows unknown sources

### Build fails on GitHub
- Verify all secrets are correctly set
- Check the workflow logs for specific errors

### Google Play rejects the app
- Ensure privacy policy is accessible
- Complete all store listing requirements
- Check content rating questionnaire

## Support

For issues with the Android build process, check:
- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
