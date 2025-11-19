// vite.config.ts
import { defineConfig } from "file:///Users/markmhendrickson/Projects/neotoma/node_modules/vite/dist/node/index.js";
import react from "file:///Users/markmhendrickson/Projects/neotoma/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///Users/markmhendrickson/Projects/neotoma/vite.config.ts";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var enableDevCrossOriginIsolation = process.env.VITE_ENABLE_CROSS_ORIGIN_ISOLATION === "true";
var vite_config_default = defineConfig({
  plugins: [react()],
  root: "frontend",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src")
    }
  },
  build: {
    outDir: "../public",
    emptyOutDir: false,
    // Keep sandbox directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "frontend/index.html")
      },
      output: {
        // Ensure workers are built correctly
        worker: {
          format: "es"
        }
      }
    }
  },
  worker: {
    format: "es"
  },
  server: {
    port: parseInt(process.env.VITE_PORT || process.env.PORT || "5173", 10),
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: parseInt(process.env.VITE_PORT || process.env.PORT || "5173", 10)
    },
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.HTTP_PORT || "8080"}`,
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api/, "")
      }
    },
    headers: enableDevCrossOriginIsolation ? {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    } : void 0,
    fs: {
      allow: [".."]
    }
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWFya21oZW5kcmlja3Nvbi9Qcm9qZWN0cy9uZW90b21hXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvbWFya21oZW5kcmlja3Nvbi9Qcm9qZWN0cy9uZW90b21hL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9tYXJrbWhlbmRyaWNrc29uL1Byb2plY3RzL25lb3RvbWEvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcbmNvbnN0IGVuYWJsZURldkNyb3NzT3JpZ2luSXNvbGF0aW9uID1cbiAgcHJvY2Vzcy5lbnYuVklURV9FTkFCTEVfQ1JPU1NfT1JJR0lOX0lTT0xBVElPTiA9PT0gJ3RydWUnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIHJvb3Q6ICdmcm9udGVuZCcsXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9mcm9udGVuZC9zcmMnKSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJy4uL3B1YmxpYycsXG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLCAvLyBLZWVwIHNhbmRib3ggZGlyZWN0b3J5XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbWFpbjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ2Zyb250ZW5kL2luZGV4Lmh0bWwnKSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgLy8gRW5zdXJlIHdvcmtlcnMgYXJlIGJ1aWx0IGNvcnJlY3RseVxuICAgICAgICB3b3JrZXI6IHtcbiAgICAgICAgICBmb3JtYXQ6ICdlcycsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHdvcmtlcjoge1xuICAgIGZvcm1hdDogJ2VzJyxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuVklURV9QT1JUIHx8IHByb2Nlc3MuZW52LlBPUlQgfHwgJzUxNzMnLCAxMCksXG4gICAgaG1yOiB7XG4gICAgICBwcm90b2NvbDogJ3dzJyxcbiAgICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxuICAgICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuVklURV9QT1JUIHx8IHByb2Nlc3MuZW52LlBPUlQgfHwgJzUxNzMnLCAxMCksXG4gICAgfSxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiB7XG4gICAgICAgIHRhcmdldDogYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwcm9jZXNzLmVudi5IVFRQX1BPUlQgfHwgJzgwODAnfWAsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2FwaS8sICcnKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBoZWFkZXJzOiBlbmFibGVEZXZDcm9zc09yaWdpbklzb2xhdGlvblxuICAgICAgPyB7XG4gICAgICAgICAgJ0Nyb3NzLU9yaWdpbi1FbWJlZGRlci1Qb2xpY3knOiAncmVxdWlyZS1jb3JwJyxcbiAgICAgICAgICAnQ3Jvc3MtT3JpZ2luLU9wZW5lci1Qb2xpY3knOiAnc2FtZS1vcmlnaW4nLFxuICAgICAgICB9XG4gICAgICA6IHVuZGVmaW5lZCxcbiAgICBmczoge1xuICAgICAgYWxsb3c6IFsnLi4nXSxcbiAgICB9LFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ0BzcWxpdGUub3JnL3NxbGl0ZS13YXNtJ10sXG4gIH0sXG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwUyxTQUFTLG9CQUFvQjtBQUN2VSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMscUJBQXFCO0FBSDBKLElBQU0sMkNBQTJDO0FBS3pPLElBQU0sWUFBWSxLQUFLLFFBQVEsY0FBYyx3Q0FBZSxDQUFDO0FBQzdELElBQU0sZ0NBQ0osUUFBUSxJQUFJLHVDQUF1QztBQUVyRCxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsV0FBVyxnQkFBZ0I7QUFBQSxJQUMvQztBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGFBQWE7QUFBQTtBQUFBLElBQ2IsZUFBZTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ0wsTUFBTSxLQUFLLFFBQVEsV0FBVyxxQkFBcUI7QUFBQSxNQUNyRDtBQUFBLE1BQ0EsUUFBUTtBQUFBO0FBQUEsUUFFTixRQUFRO0FBQUEsVUFDTixRQUFRO0FBQUEsUUFDVjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sUUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU0sU0FBUyxRQUFRLElBQUksYUFBYSxRQUFRLElBQUksUUFBUSxRQUFRLEVBQUU7QUFBQSxJQUN0RSxLQUFLO0FBQUEsTUFDSCxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsTUFDTixNQUFNLFNBQVMsUUFBUSxJQUFJLGFBQWEsUUFBUSxJQUFJLFFBQVEsUUFBUSxFQUFFO0FBQUEsSUFDeEU7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVEsb0JBQW9CLFFBQVEsSUFBSSxhQUFhLE1BQU07QUFBQSxRQUMzRCxjQUFjO0FBQUEsUUFDZCxTQUFTLENBQUNBLFVBQVNBLE1BQUssUUFBUSxVQUFVLEVBQUU7QUFBQSxNQUM5QztBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVMsZ0NBQ0w7QUFBQSxNQUNFLGdDQUFnQztBQUFBLE1BQ2hDLDhCQUE4QjtBQUFBLElBQ2hDLElBQ0E7QUFBQSxJQUNKLElBQUk7QUFBQSxNQUNGLE9BQU8sQ0FBQyxJQUFJO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyx5QkFBeUI7QUFBQSxFQUNyQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInBhdGgiXQp9Cg==
