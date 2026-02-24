import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to serve markdown files from docs directory and route /docs to docs.html
function docsMarkdownPlugin() {
  return {
    name: "docs-markdown",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Check if this is a fetch/XHR request (from React app) vs browser navigation
        const acceptHeader = req.headers.accept || "";
        const isFetchRequest =
          acceptHeader.includes("text/markdown") ||
          acceptHeader.includes("application/json") ||
          req.headers["x-requested-with"] === "XMLHttpRequest";

        // Handle markdown file requests - only serve directly if it's a fetch request
        if (req.url && req.url.match(/^\/docs\/.*\.md$/)) {
          if (isFetchRequest) {
            // This is a fetch request from the React app - serve the markdown file
            const filePath = path.join(__dirname, req.url);
            const resolvedPath = path.resolve(filePath);
            const docsResolved = path.resolve(path.join(__dirname, "docs"));

            // Security check: ensure file is within docs directory
            if (!resolvedPath.startsWith(docsResolved)) {
              res.statusCode = 403;
              res.end("Forbidden");
              return;
            }

            // Check if file exists
            if (!fs.existsSync(resolvedPath)) {
              res.statusCode = 404;
              res.end("Documentation file not found");
              return;
            }

            // Serve markdown as plain text
            res.setHeader("Content-Type", "text/markdown; charset=utf-8");
            const content = fs.readFileSync(resolvedPath, "utf-8");
            res.end(content);
            return;
          } else {
            // This is a browser navigation - serve docs.html so React app can handle it
            req.url = "/docs.html";
          }
        }

        // Route all other /docs requests to docs.html (but not static assets)
        if (
          req.url &&
          req.url.startsWith("/docs") &&
          !req.url.match(/\.(js|css|json|png|jpg|svg|ico|woff|woff2|ttf|eot)$/)
        ) {
          // Check if it's a request for docs.html or should be routed to it
          if (req.url === "/docs" || req.url === "/docs/") {
            req.url = "/docs.html";
          } else if (!req.url.includes(".") || req.url.endsWith("/")) {
            // SPA route within docs - serve docs.html
            req.url = "/docs.html";
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), docsMarkdownPlugin()],
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
        docs: path.resolve(__dirname, "frontend/docs.html"),
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
      "/health": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/openapi.yaml": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/server-info": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/mcp": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/auth": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/me": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/entities": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/sources": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/observations": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/relationships": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/timeline": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/schemas": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/interpretations": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/stats": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/store": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/get_file_url": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/get_entity_snapshot": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/list_observations": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/get_field_provenance": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/create_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/list_relationships": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/record_comparison": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/generate_embedding": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/retrieve_entity_by_identifier": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/retrieve_related_entities": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/retrieve_graph_neighborhood": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/delete_entity": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/restore_entity": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/delete_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/restore_relationship": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/analyze_schema_candidates": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/get_schema_recommendations": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/update_schema_incremental": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/register_schema": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/reinterpret": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/interpret-uninterpreted": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/correct": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/get_authenticated_user": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
      "/health_check_snapshots": { target: `http://localhost:${process.env.HTTP_PORT || "8080"}`, changeOrigin: true, secure: false },
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
