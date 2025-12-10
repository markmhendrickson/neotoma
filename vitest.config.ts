import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['frontend/src/**/*.test.tsx', 'jsdom'],
      ['frontend/src/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
    exclude: [
      ...configDefaults.exclude,
      'playwright/tests/**/*',
    ],
    testTimeout: 60000, // Increased timeout for integration tests
    hookTimeout: 30000,
    // Run integration tests sequentially to avoid database conflicts
    // Use threads pool with single thread for sequential execution
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1, // Force single thread for sequential execution
      },
    },
    // Sequential execution for integration tests
    sequence: {
      concurrent: false, // Disable concurrent test execution
      shuffle: false, // Maintain test order
    },
  },
});



