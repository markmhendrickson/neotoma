import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.HTTP_PORT || '8080'}`,
        changeOrigin: true,
      },
    },
  },
});

