import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWorktreeSuffix } from './worktreeSuffix.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worktreeSuffix = getWorktreeSuffix(__dirname);
if (worktreeSuffix) {
  process.env.VITE_WORKTREE_SUFFIX = worktreeSuffix;
} else {
  delete process.env.VITE_WORKTREE_SUFFIX;
}
// Enable COOP/COEP headers by default for OPFS support (can be disabled via env var)
const enableDevCrossOriginIsolation =
  process.env.VITE_ENABLE_CROSS_ORIGIN_ISOLATION !== 'false';
const proxyRewriteApi = process.env.VITE_PROXY_REWRITE_API !== 'false';

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: false, // Keep sandbox directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'frontend/index.html'),
      },
      output: {
        // Ensure workers are built correctly
        worker: {
          format: 'es',
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: parseInt(process.env.VITE_PORT || process.env.PORT || '5173', 10),
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: parseInt(process.env.VITE_PORT || process.env.PORT || '5173', 10),
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.HTTP_PORT || '8080'}`,
        changeOrigin: true,
        rewrite: proxyRewriteApi ? (path) => path.replace(/^\/api/, '') : undefined,
      },
    },
    headers: enableDevCrossOriginIsolation
      ? {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        }
      : undefined,
    fs: {
      allow: ['..'],
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});

