import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('./packages/election-core/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@mesa/election-core': core } },
        test: {
          name: 'core',
          root: './packages/election-core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@mesa/election-core': core } },
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // The election database is a single writer by design; tests that exercise
          // concurrency spawn their own worker threads rather than relying on the runner.
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
      {
        resolve: {
          alias: {
            '@mesa/election-core': core,
            '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
          },
        },
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
