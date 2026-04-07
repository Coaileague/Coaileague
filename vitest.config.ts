import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/api/**/*.test.ts',
      'tests/regression/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'test-results/coverage',
      include: ['server/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        'server/index.ts',
        'node_modules/**',
        'tests/**',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    reporter: ['verbose'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@server': path.resolve(__dirname, 'server'),
    },
  },
});
