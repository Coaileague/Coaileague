import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const devOnlyPackages = [
  'vite',
  '@vitejs/plugin-react',
  '@replit/vite-plugin-runtime-error-modal',
  '@replit/vite-plugin-cartographer',
  '@replit/vite-plugin-dev-banner',
];

const stubDevPackagesPlugin = {
  name: 'stub-dev-packages',
  setup(build) {
    const filter = new RegExp(
      '^(' + devOnlyPackages.map(p => p.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|') + ')$'
    );
    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: 'dev-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'dev-stub' }, () => ({
      contents: `
        const noop = () => {};
        const noopObj = new Proxy({}, { get: () => noop });
        export default noop;
        export const defineConfig = (c) => c;
        export const createServer = noop;
        export const createLogger = () => noopObj;
      `,
      loader: 'js',
    }));
  },
};

const fixJsdomWorkerPlugin = {
  name: 'fix-jsdom-worker',
  setup(build) {
    build.onLoad({ filter: /XMLHttpRequest-impl\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');
      contents = contents.replace(
        /require\.resolve\(\s*["']\.\/xhr-sync-worker\.js["']\s*\)/g,
        'require("path").resolve(__dirname, "xhr-sync-worker.js")'
      );
      return { contents, loader: 'js' };
    });
  },
};

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outdir: 'dist',
      banner: {
        js: [
          `import { createRequire as __createRequire } from 'module';`,
          `import { fileURLToPath as __fileURLToPath } from 'url';`,
          `import __path from 'path';`,
          `const require = __createRequire(import.meta.url);`,
          `const __filename = __fileURLToPath(import.meta.url);`,
          `const __dirname = __path.dirname(__filename);`,
        ].join('\n'),
      },
      external: [
        'better-sqlite3',
        'pg-native',
        'sqlite3',
        'mysql2',
        'oracledb',
        'tedious',
        'sharp',
        'bcrypt',
        'fsevents',
        'typescript',
      ],
      alias: {
        '@shared': path.resolve(__dirname, 'shared'),
      },
      plugins: [stubDevPackagesPlugin, fixJsdomWorkerPlugin],
    });

    const workerSrc = path.resolve(__dirname, 'node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js');
    const workerDst = path.resolve(__dirname, 'dist/xhr-sync-worker.js');
    if (fs.existsSync(workerSrc)) {
      fs.copyFileSync(workerSrc, workerDst);
      console.log('✅ Copied xhr-sync-worker.js to dist/');
    }

    console.log('✅ Server build complete');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
