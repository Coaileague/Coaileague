#!/bin/bash
set -e

echo "🧹 Cleaning previous build..."
rm -rf dist

echo "🏗️  Building frontend..."
npx vite build

echo "🏗️  Building backend with path alias resolution..."
node build.mjs

echo "✅ Build complete!"
