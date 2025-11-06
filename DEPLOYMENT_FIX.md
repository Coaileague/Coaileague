# Deployment Build Fix - Path Alias Resolution

## Problem
The deployment was failing because esbuild wasn't resolving TypeScript path aliases (`@shared/*`) during the production build, resulting in:
```
Invalid module "@shared" is not a valid package name imported from dist/index.js
```

## Solution
Created custom build scripts that properly handle TypeScript path alias resolution:

### Files Created:
1. **`build.mjs`** - ESBuild configuration with path alias mapping
2. **`deploy-build.sh`** - Shell script that runs both frontend and backend builds

## How to Configure Deployment

### Option 1: Using the Replit UI (Recommended)

1. **Open the Publishing workspace tool** (left sidebar or search bar)
2. **Select "Autoscale" deployment option**
3. **In the "Build command" field**, enter:
   ```bash
   ./deploy-build.sh
   ```
4. **In the "Run command" field**, ensure it's:
   ```bash
   npm run start
   ```
5. **Save and deploy**

### Option 2: Manual Build Test

You can test the build locally anytime:
```bash
./deploy-build.sh
```

This will:
- ✅ Build the frontend with Vite
- ✅ Build the backend with proper path alias resolution
- ✅ Output to `dist/` directory ready for production

## What Was Fixed

**Before:** 
- Build used inline esbuild command that ignored tsconfig path mappings
- `@shared/*` imports remained unresolved in production bundle

**After:**
- Custom esbuild configuration maps `@shared` → `./shared` directory
- All imports properly resolved during bundling
- Production bundle ready for deployment

## Technical Details

The `build.mjs` script uses esbuild's `alias` option:
```javascript
alias: {
  '@shared': path.resolve(__dirname, 'shared'),
}
```

This ensures all `import ... from '@shared/...'` statements are correctly resolved to their actual file paths during the bundle process.
