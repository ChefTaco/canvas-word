import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@tests': fileURLToPath(new URL('./test/upstream', import.meta.url)),
          },
        },
        test: {
          name: 'upstream',
          include: ['test/upstream/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['./test/upstream/setup.ts'],
          css: false,
        },
      },
    ],
  },
});
