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
      'playwright/**',
    ],
  },
});



