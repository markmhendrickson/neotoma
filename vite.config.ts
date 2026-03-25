import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  define: {
    "import.meta.env.VITE_WS_PORT": JSON.stringify(process.env.WS_PORT || "8280"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
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
      // Exact match only: "/health" would also match SPA routes like /healthcare
      "^/health$": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/openapi.yaml": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/server-info": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/mcp": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/auth": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "^/me$": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/entities": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/sources": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/observations": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/relationships": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/timeline": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/schemas": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/interpretations": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/stats": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/store": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/get_file_url": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/get_entity_snapshot": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/list_observations": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/get_field_provenance": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/create_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/list_relationships": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/record_comparison": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/generate_embedding": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/retrieve_entity_by_identifier": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/retrieve_related_entities": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/retrieve_graph_neighborhood": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/delete_entity": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/restore_entity": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/delete_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/restore_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/analyze_schema_candidates": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/get_schema_recommendations": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/update_schema_incremental": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/register_schema": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/reinterpret": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/interpret-uninterpreted": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/correct": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/get_authenticated_user": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
      "/health_check_snapshots": { target: `http://localhost:${process.env.HTTP_PORT || "3080"}`, changeOrigin: true, secure: false },
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
