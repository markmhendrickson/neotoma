import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite config for prototype mode
export default defineConfig({
  plugins: [
    react(),
    {
      name: "prototype-index",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Serve prototype.html for root path
          if (req.url === "/" || req.url === "/index.html") {
            req.url = "/prototype.html";
          }
          next();
        });
      },
    },
  ],
  root: "frontend",
  publicDir: "public",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "frontend/prototype.html"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    strictPort: false,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5174,
    },
    fs: {
      allow: [".."],
    },
  },
  cacheDir: "frontend/.vite-prototype", // Use separate cache for prototype
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
    force: true, // Force re-optimization to bypass cache issues
  },
});

