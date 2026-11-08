import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/__tests__/**/*.test.ts', 'test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
