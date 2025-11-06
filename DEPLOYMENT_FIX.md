# Deployment Build Fix - Path Alias Resolution & Import Issues

## Problems Fixed

### 1. Invalid Path Aliases
The deployment was failing because esbuild wasn't resolving TypeScript path aliases (`@shared/*`) during the production build, resulting in:
```
Invalid module "@shared" is not a valid package name imported from dist/index.js
```

### 2. Duplicate Import Declarations
The build created duplicate `dirname` imports causing syntax errors:
```
Duplicate 'dirname' import in dist/index.js causing SyntaxError
```

### 3. Invalid `@db` Import
The `server/encryption.ts` file had an invalid import alias `@db` that doesn't exist in the configuration.

## Solutions Applied

### Files Created:
1. **`build.mjs`** - ESBuild configuration with path alias mapping (no banner to avoid duplicates)
2. **`deploy-build.sh`** - Shell script that cleans, builds frontend, and builds backend

### Files Fixed:
- **`server/encryption.ts`** - Changed `import { db } from '@db'` to `import { db } from './db'`

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
- ESBuild banner created duplicate imports for `dirname`
- Invalid `@db` import alias in encryption module

**After:**
- ✅ Custom esbuild configuration maps `@shared` → `./shared` directory
- ✅ Removed problematic banner to prevent duplicate imports
- ✅ Added `rm -rf dist` to clean stale files before building
- ✅ Fixed invalid `@db` import to use relative path `./db`
- ✅ All imports properly resolved during bundling
- ✅ Production bundle ready for deployment

## Technical Details

### 1. Path Alias Resolution
The `build.mjs` script uses esbuild's `alias` option:
```javascript
alias: {
  '@shared': path.resolve(__dirname, 'shared'),
}
```

### 2. Clean Build Process
The `deploy-build.sh` script:
```bash
rm -rf dist                 # Clean previous build
npx vite build             # Build frontend
node build.mjs             # Build backend with aliases
```

### 3. Import Fixes
Changed server/encryption.ts:
```typescript
// Before (invalid)
import { db } from '@db';

// After (correct)
import { db } from './db';
```
