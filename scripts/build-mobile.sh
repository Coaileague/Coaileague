#!/bin/bash

echo "==================================="
echo "CoAIleague Mobile App Build Script"
echo "==================================="

npm run build

if [ ! -d "android" ]; then
  echo "Initializing Android project..."
  npx cap add android
fi

if [ ! -d "ios" ]; then
  echo "Initializing iOS project..."
  npx cap add ios
fi

echo "Syncing web assets to native projects..."
npx cap sync

echo ""
echo "==================================="
echo "Build Complete!"
echo "==================================="
echo ""
echo "To build Android APK:"
echo "  cd android && ./gradlew assembleDebug"
echo "  APK will be at: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To build iOS (requires Mac with Xcode):"
echo "  npx cap open ios"
echo "  Then build from Xcode"
echo ""
echo "To run on device:"
echo "  npx cap run android"
echo "  npx cap run ios"
echo ""
