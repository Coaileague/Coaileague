import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
    reporter: ['verbose'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@server': path.resolve(__dirname, 'server'),
    },
  },
});
