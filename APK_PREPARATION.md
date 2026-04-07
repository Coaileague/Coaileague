# WorkforceOS - APK Preparation Guide

## Mobile App Conversion Checklist

This document organizes all necessary information to convert WorkforceOS into a mobile APK without missing any features.

---

## Mobile-Ready Features

### Already Implemented
- **Mobile Chat Interface** (`/mobile-chat`) - DC360.5 glassmorphic design
- **Desktop Chat Interface** (`/live-chat`) - DC360 IRC/MSN style
- **Responsive Layouts** - All pages adapt to mobile screens
- **WorkforceOS Logo** - Visible and organized across all pages
- **Loading Transitions** - Branded overlay system with animated logo
- **Touch-Optimized UI** - Buttons, forms, and interactions sized for mobile
- **Auto-Mobile Detection** - Redirects mobile users automatically

### Branding & Visual Identity
- **Logo Component**: `client/src/components/workforceos-logo.tsx`
  - WorkforceOSLogo (animated neon "W" with "OS" superscript)
  - WFLogoCompact (compact version for mobile headers)
- **Color Scheme**: Corporate blue gradients (#1d4ed8 → #0ea5e9)
- **Loading Screen**: Universal transition overlay with animated logo

---

## Required Configuration for APK

### 1. **Environment Variables**
Ensure these are set in your build environment:

```bash
# Backend API URL (point to your deployed server)
VITE_API_URL=https://your-api-domain.com

# Stripe Public Key (if using payments)
VITE_STRIPE_PUBLIC_KEY=pk_live_xxxxx

# WebSocket URL (for live chat)
VITE_WS_URL=wss://your-api-domain.com
```

### 2. **Mobile Entry Points**
Main routes for mobile app:

- **Landing**: `/` (auto-redirects mobile to `/mobile-chat`)
- **Mobile Chat**: `/mobile-chat` (primary mobile interface)
- **Login**: `/login`
- **Register**: `/register`
- **Dashboard**: `/dashboard`

### 3. **PWA Configuration** (if using PWA → APK)
File: `public/manifest.json` (create if missing)

```json
{
  "name": "WorkforceOS",
  "short_name": "WorkforceOS",
  "description": "Workforce Management Operating System",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1d4ed8",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 4. **Mobile-Specific Pages**
These pages are optimized for mobile:

| Page | Path | Mobile Features |
|------|------|-----------------|
| Mobile Chat | `/mobile-chat` | Touch controls, bottom sheet UI, tap commands |
| Landing | `/` | Auto-redirect, responsive hero |
| Dashboard | `/dashboard` | Responsive cards, mobile metrics |
| Employees | `/employees` | Scrollable list, mobile forms |
| Onboarding | `/onboarding/*` | Multi-step mobile wizard |

---

## Build Instructions

### Option A: Capacitor (Recommended)

1. **Install Capacitor**:
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android
npx cap init WorkforceOS com.workforceos.app
```

2. **Build Frontend**:
```bash
npm run build
```

3. **Add Android Platform**:
```bash
npx cap add android
npx cap sync
```

4. **Configure AndroidManifest.xml**:
Add permissions in `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

5. **Build APK**:
```bash
cd android
./gradlew assembleDebug
# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

### Option B: Cordova

1. **Install Cordova**:
```bash
npm install -g cordova
cordova create workforceos com.workforceos.app WorkforceOS
```

2. **Add Platform**:
```bash
cordova platform add android
```

3. **Build**:
```bash
cordova build android
```

---

## Mobile Feature Checklist

### Core Functionality
- [x] User Authentication
- [x] Session Management
- [x] Role-Based Access Control
- [x] Real-time WebSocket Chat
- [x] Form Submissions
- [x] File Uploads (camera/gallery)
- [x] E-Signatures
- [x] Push Notifications (via WebSocket)

### UI/UX
- [x] Responsive Text (wraps/truncates properly)
- [x] Touch-Friendly Buttons (min 44px tap targets)
- [x] Mobile Navigation (bottom sheets, hamburger menus)
- [x] Loading States (branded transitions)
- [x] Logo Visibility (all pages)
- [x] Keyboard Handling (auto-scroll on input focus)

### Performance
- [x] Lazy Loading (images, routes)
- [x] Code Splitting (Vite automatic)
- [x] Optimized Assets (compressed images)
- [x] Efficient API Calls (TanStack Query caching)

---

## Testing Requirements

### Pre-APK Testing
1. **Mobile Browser Testing**:
   - Test on Chrome Mobile (Android)
   - Test on Safari Mobile (iOS)
   - Verify responsive breakpoints

2. **Feature Testing**:
   - Login/Logout flow
   - Chat functionality
   - Form submissions
   - File uploads
   - Camera access (for document capture)

3. **Network Testing**:
   - Test offline behavior
   - Test slow network (throttle 3G)
   - Verify WebSocket reconnection

### Post-APK Testing
1. Install APK on physical Android device
2. Test all critical user journeys
3. Verify camera/storage permissions
4. Check WebSocket connections
5. Test background/foreground transitions

---

## Assets Required

### Icons (Auto-generated from coaileague-logo.png):
- `client/public/icons/icon-192x192.png` (192x192px)
- `client/public/icons/icon-512x512.png` (512x512px)
- All sizes in `client/public/icons/` folder
- `android/app/src/main/res/mipmap-*/ic_launcher.png` (various sizes)

### Splash Screen:
- Logo: WorkforceOS neon "W" 
- Background: Dark gradient (slate-950 → indigo-950)
- Colors: Blue (#1d4ed8) and Cyan (#0ea5e9)

---

## Security Considerations

1. **API Security**:
   - Use HTTPS for all API calls
   - Implement token refresh logic
   - Store tokens securely (never in localStorage)

2. **WebSocket Security**:
   - Use WSS (secure WebSocket)
   - Validate all incoming messages
   - Implement heartbeat/ping-pong

3. **Android Permissions**:
   - Request only necessary permissions
   - Explain permission usage to users
   - Handle permission denials gracefully

---

## Post-Build Configuration

### Play Store Preparation:
1. **App Name**: WorkforceOS
2. **Package Name**: com.workforceos.app
3. **Version Code**: Start at 1, increment for each release
4. **Min SDK**: 24 (Android 7.0)
5. **Target SDK**: 34 (Android 14)

### App Signing:
```bash
# Generate keystore
keytool -genkey -v -keystore workforceos-release.keystore -alias workforceos -keyalg RSA -keysize 2048 -validity 10000

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore workforceos-release.keystore app-release-unsigned.apk workforceos
```

---

## Common Issues & Solutions

### Issue: White screen on app launch
**Solution**: Check VITE_API_URL is set correctly, verify CORS headers

### Issue: WebSocket not connecting
**Solution**: Update WebSocket URL to use WSS, check network permissions

### Issue: Camera not working
**Solution**: Add CAMERA permission to AndroidManifest.xml

### Issue: Text overflow on mobile
**Solution**: All text elements use `break-words`, `truncate`, or `flex-wrap`

---

## Support & Documentation

- **Main Documentation**: See `replit.md` for system architecture
- **Design Guidelines**: See `design_guidelines.md` for UI/UX standards
- **API Documentation**: See `server/routes.ts` for endpoint reference

---

## Final Pre-Build Checklist

Before building APK:
- [ ] All environment variables configured
- [ ] Logo/icons created (192px, 512px)
- [ ] Splash screen configured
- [ ] API URL points to production server
- [ ] WebSocket URL configured (WSS)
- [ ] All features tested on mobile browser
- [ ] Android permissions added to manifest
- [ ] App signing keystore generated
- [ ] Version code/name set correctly

---

**Ready to Build!**

Once this checklist is complete, run the build commands above to generate your APK. Test thoroughly on physical devices before publishing to the Play Store.
