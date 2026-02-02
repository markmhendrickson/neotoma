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
    "import.meta.env.VITE_WS_PORT": JSON.stringify(process.env.WS_PORT || "8081"),
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
      "/api": {
        target: `http://localhost:${process.env.HTTP_PORT || "8080"}`,
        changeOrigin: true,
        secure: false,
        // Don't rewrite - backend routes include /api prefix
        // All /api/* requests are forwarded to backend as-is
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
