#!/bin/bash
set -e

echo "=== Installing dependencies ==="
npm ci

echo "=== Cleaning previous build ==="
rm -rf dist

echo "=== Building frontend ==="
npx vite build

echo "=== Building server (bundled) ==="
node build.mjs

echo "=== Verifying bundle is self-contained ==="
if grep -q 'from "drizzle-orm"' dist/index.js; then
  echo "FATAL: drizzle-orm is still external! Bundle failed."
  exit 1
fi

if grep -q 'from "express"' dist/index.js; then
  echo "FATAL: express is still external! Bundle failed."
  exit 1
fi

BUNDLE_SIZE=$(stat -c%s dist/index.js 2>/dev/null || stat -f%z dist/index.js 2>/dev/null)
if [ "$BUNDLE_SIZE" -lt 20000000 ]; then
  echo "FATAL: Bundle too small (${BUNDLE_SIZE} bytes). Dependencies likely not bundled."
  exit 1
fi

echo "=== Build complete (bundle: ${BUNDLE_SIZE} bytes) ==="
