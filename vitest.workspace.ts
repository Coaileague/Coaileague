import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      environment: 'node',
      testTimeout: 60000,
      hookTimeout: 60000,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: [
        'tests/api/**/*.test.ts',
        'tests/regression/**/*.test.ts',
      ],
      // tests/integration/platform.test.ts is a stand-alone static-analysis
      // script (calls process.exit) — run separately via `tsx`, not vitest.
      environment: 'node',
      testTimeout: 30000,
      hookTimeout: 30000,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'security',
      include: ['tests/security/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      environment: 'node',
      testTimeout: 30000,
      hookTimeout: 30000,
    },
  },
]);
