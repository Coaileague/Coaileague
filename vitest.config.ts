import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Split unit vs api/regression so each lane gets the right setup
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/unit/setup.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/api/**/*.test.ts', 'tests/regression/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
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
    reporter: ['verbose'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@server': path.resolve(__dirname, 'server'),
    },
  },
});
