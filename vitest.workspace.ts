import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
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
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['tests/api/**/*.test.ts', 'tests/regression/**/*.test.ts'],
      environment: 'node',
      testTimeout: 30000,
      hookTimeout: 30000,
    },
  },
]);
