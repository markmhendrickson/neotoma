import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Enable COOP/COEP headers by default for OPFS support (can be disabled via env var)
const enableDevCrossOriginIsolation =
  process.env.VITE_ENABLE_CROSS_ORIGIN_ISOLATION !== 'false';

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  define: {
    'import.meta.env.VITE_WS_PORT': JSON.stringify(process.env.WS_PORT || '8081'),
  },
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
        target: `http://localhost:${process.env.HTTP_PORT || '8080'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
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

