import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

function getDefaultApiUrl(): string {
  if (process.env.VITE_NEOTOMA_API_URL) {
    return process.env.VITE_NEOTOMA_API_URL;
  }
  return process.env.VITE_NEOTOMA_ENV === "prod" ? "http://localhost:3180" : "http://localhost:3080";
}

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

/** Redirect e.g. `/inspector` → `/inspector/` so Vite's non-root base does not show the HTML hint page. */
function basePathTrailingSlashRedirectPlugin(base: string): Plugin | null {
  if (base === "/" || !base.endsWith("/")) return null;
  const withoutSlash = base.replace(/\/$/, "");
  return {
    name: "neotoma-inspector-base-trailing-slash-redirect",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const url = req.url ?? "";
        const pathOnly = url.split("?")[0] ?? "";
        if (pathOnly !== withoutSlash) return next();
        const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
        res.statusCode = 308;
        res.setHeader("Location", `${base.replace(/\/$/, "")}/${qs}`);
        res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const apiUrl = getDefaultApiUrl();
  // Default `/` serves the SPA at the server root. Override with
  // `VITE_PUBLIC_BASE_PATH=/inspector/` to restore the legacy sub-path mount.
  const explicitBase = process.env.VITE_PUBLIC_BASE_PATH?.trim();
  const base = normalizeBasePath(explicitBase ?? "/");
  /** When set (e.g. `../dist/inspector`), `vite build --watch` updates the tree the API serves first. */
  const outDirFromEnv = process.env.NEOTOMA_INSPECTOR_OUT_DIR?.trim();
  const buildOutDir = outDirFromEnv
    ? path.resolve(__dirname, outDirFromEnv)
    : path.resolve(__dirname, "dist");
  const outDirOutsideRoot =
    path.relative(__dirname, buildOutDir).startsWith("..") ||
    path.relative(__dirname, buildOutDir).includes("..");
  /** `vite build --watch` + emptyOutDir clears the whole tree each rebuild — races the API static mount. */
  const isBuildWatch = process.argv.includes("--watch");
  /**
   * When emitting into the repo `dist/inspector` (NEOTOMA_INSPECTOR_OUT_DIR=../dist/inspector), native
   * FS watchers often miss edits under LaunchAgents / IDE saves. Use chokidar polling unless opted out.
   * Set NEOTOMA_INSPECTOR_BUILD_WATCH_POLL=0 to force native watching only.
   */
  const pollInspectorBuildWatch =
    isBuildWatch &&
    outDirOutsideRoot &&
    process.env.NEOTOMA_INSPECTOR_BUILD_WATCH_POLL !== "0";

  const inspectorSourceBuild =
    mode === "development" ||
    outDirOutsideRoot ||
    ["1", "true", "yes"].includes(
      (process.env.VITE_INSPECTOR_SOURCE_BUILD ?? "").trim().toLowerCase(),
    );

  const devPortRaw =
    process.env.VITE_INSPECTOR_DEV_PORT?.trim() ||
    process.env.INSPECTOR_DEV_PORT?.trim() ||
    "5175";
  const devPort = Number.parseInt(devPortRaw, 10);
  const inspectorDevPort = Number.isFinite(devPort) && devPort > 0 ? devPort : 5175;
  const slashRedirect = basePathTrailingSlashRedirectPlugin(base);

  return {
    base,
    clearScreen: false,
    define: {
      "import.meta.env.VITE_INSPECTOR_SOURCE_BUILD": JSON.stringify(
        inspectorSourceBuild ? "1" : "",
      ),
    },
    plugins: [...(slashRedirect ? [slashRedirect] : []), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: buildOutDir,
      emptyOutDir: outDirOutsideRoot ? !isBuildWatch : undefined,
      ...(pollInspectorBuildWatch
        ? {
            watch: {
              chokidar: {
                usePolling: true,
                interval: Number(
                  process.env.NEOTOMA_INSPECTOR_BUILD_WATCH_POLL_INTERVAL_MS ?? "1000",
                ),
              },
            },
          }
        : {}),
    },
    server: {
      port: inspectorDevPort,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
