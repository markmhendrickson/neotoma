import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  define: {
    "import.meta.env.VITE_WS_PORT": JSON.stringify(
      process.env.WS_PORT || "8081"
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: false, // Keep sandbox directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "frontend/index.html"),
      },
      output: {
        // Output configuration
      },
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: parseInt(process.env.VITE_PORT || process.env.PORT || "5173", 10),
    host: "0.0.0.0", // Accept connections from proxy
    strictPort: true, // Fail if port is taken instead of auto-incrementing (ensures HMR port matches)
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: parseInt(process.env.VITE_PORT || process.env.PORT || "5173", 10),
    },
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.HTTP_PORT || "8080"}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
    headers: undefined,
    fs: {
      allow: [".."],
    },
  },
  cacheDir: ".vite", // Use project-local cache instead of node_modules/.vite
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
    // Force re-optimization when dependencies change
    force: process.env.VITE_FORCE_OPTIMIZE === "true",
  },
});
