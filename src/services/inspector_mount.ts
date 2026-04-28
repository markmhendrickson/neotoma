/**
 * Centralized Inspector SPA mount resolver and installer.
 *
 * Single source of truth for "where is the Inspector for this server":
 *   DISABLE > PUBLIC_INSPECTOR_URL > STATIC_DIR > bundled fallback
 *
 * Used by actions.ts (Express mount) and root_landing (landing-page link).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import expressStatic from "express";

const DEFAULT_BASE_PATH = "/inspector";

export interface InspectorMountConfig {
  kind: "disabled" | "external" | "local";
  basePath: string;
  /** Absolute URL for external Inspector; undefined for local/disabled. */
  externalUrl?: string;
  /** Filesystem directory to serve; undefined for external/disabled. */
  staticDir?: string;
}

/**
 * Resolve the package root by walking up from this file's directory until we
 * find a directory containing package.json. Works for source checkouts,
 * npm-installed packages, and Docker.
 */
function resolvePackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/**
 * Resolve the bundled Inspector dist directory. Returns null when the
 * bundled dist is not present (e.g. submodule not built, or SKIP_INSPECTOR_BUILD).
 */
export function resolveBundledInspectorDir(): string | null {
  const root = resolvePackageRoot();
  const distDir = path.join(root, "dist", "inspector");
  if (fs.existsSync(path.join(distDir, "index.html"))) return distDir;

  // Source-checkout fallback: inspector/dist when the submodule is built.
  const submoduleDistDir = path.join(root, "inspector", "dist");
  if (fs.existsSync(path.join(submoduleDistDir, "index.html")))
    return submoduleDistDir;

  return null;
}

/**
 * Determine the Inspector configuration from environment variables.
 *
 * Precedence: DISABLE > PUBLIC_INSPECTOR_URL > STATIC_DIR > bundled fallback.
 */
export function resolveInspectorMount(
  env: NodeJS.ProcessEnv = process.env,
): InspectorMountConfig {
  const basePath = (
    (env.NEOTOMA_INSPECTOR_BASE_PATH || DEFAULT_BASE_PATH).trim() ||
    DEFAULT_BASE_PATH
  ).replace(/\/$/, "");
  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;

  if (env.NEOTOMA_INSPECTOR_DISABLE === "1") {
    return { kind: "disabled", basePath: normalizedBase };
  }

  const publicUrl = (env.NEOTOMA_PUBLIC_INSPECTOR_URL || "").trim();
  if (publicUrl) {
    return { kind: "external", basePath: normalizedBase, externalUrl: publicUrl };
  }

  const staticDir = (env.NEOTOMA_INSPECTOR_STATIC_DIR || "").trim();
  if (staticDir) {
    return { kind: "local", basePath: normalizedBase, staticDir };
  }

  if (env.NEOTOMA_INSPECTOR_BUNDLED_DISABLE === "1") {
    return { kind: "disabled", basePath: normalizedBase };
  }

  const bundledDir = resolveBundledInspectorDir();
  if (bundledDir) {
    return { kind: "local", basePath: normalizedBase, staticDir: bundledDir };
  }

  return { kind: "disabled", basePath: normalizedBase };
}

/**
 * Inject `<meta name="neotoma-api-base" content="<origin>">` into the
 * Inspector's index.html so the SPA discovers the API origin at runtime.
 */
export function injectInspectorApiBaseMeta(
  html: string,
  origin: string,
): string {
  const metaTag = `<meta name="neotoma-api-base" content="${origin}">`;
  const headIdx = html.indexOf("</head>");
  if (headIdx === -1) return html;
  return html.slice(0, headIdx) + metaTag + "\n" + html.slice(headIdx);
}

/** `stampPath` must be the absolute path (e.g. `/inspector/__live/build_stamp`). */
export function appendInspectorLiveReloadScript(html: string, stampPath: string): string {
  const headIdx = html.indexOf("</head>");
  if (headIdx === -1) return html;
  const stampUrl = stampPath.replace(/\/{2,}/g, "/");
  const script = `<script>(function(){var u=${JSON.stringify(stampUrl)};var l=null;function c(){fetch(u,{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.json()}).then(function(j){var s=String(j.stamp||"");if(l!==null&&s&&s!==l)location.reload();l=s;}).catch(function(){})}setInterval(c,2000);c();})();</script>`;
  return html.slice(0, headIdx) + script + "\n" + html.slice(headIdx);
}

/**
 * Read the Inspector's index.html from the given directory.
 */
export function readInspectorIndexHtml(dir: string): string | null {
  const indexPath = path.join(dir, "index.html");
  try {
    return fs.readFileSync(indexPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Install the Inspector SPA mount on an Express app.
 *
 * Registered before auth middleware so the SPA shell and assets are reachable
 * without a bearer token — the API calls the Inspector makes still flow
 * through the normal auth stack.
 */
function isInspectorLiveBuildEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.NEOTOMA_INSPECTOR_LIVE_BUILD === "1";
}

function resolveLiveInspectorStaticDir(currentDir: string): string {
  const root = resolvePackageRoot();
  const sourceFallbackDir = path.join(root, "inspector", "dist");
  const primaryBundledDir = path.join(root, "dist", "inspector");
  if (
    path.resolve(currentDir) === path.resolve(sourceFallbackDir) &&
    fs.existsSync(path.join(primaryBundledDir, "index.html"))
  ) {
    return primaryBundledDir;
  }
  return currentDir;
}

export function installInspectorMount(
  app: express.Application,
  env: NodeJS.ProcessEnv = process.env,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
): void {
  const cfg = resolveInspectorMount(env);
  const inspectorLiveBuild = isInspectorLiveBuildEnabled(env);

  if (cfg.kind === "disabled") {
    logger.info(
      "[Inspector] Disabled or no built SPA found; /inspector will not be served.",
    );
    return;
  }

  if (cfg.kind === "external") {
    logger.info(
      `[Inspector] External Inspector configured at ${cfg.externalUrl}; no local mount.`,
    );
    return;
  }

  const { basePath } = cfg;
  let { staticDir } = cfg;
  if (!staticDir) return;
  if (inspectorLiveBuild) {
    staticDir = resolveLiveInspectorStaticDir(staticDir);
  }

  try {
    const rawHtml = readInspectorIndexHtml(staticDir);
    if (!rawHtml) {
      logger.warn(
        `[Inspector] index.html not found in ${staticDir}; skipping mount.`,
      );
      return;
    }

    // Cache the injected HTML per process when not in live-build mode. With
    // NEOTOMA_INSPECTOR_LIVE_BUILD=1 (e.g. watch:full + vite build --watch), HTML
    // and assets must be re-read so new hashed chunks and index.html apply
    // without restarting the API.
    let cachedHtml: string | null = null;

    const buildStampPath = `${basePath}/__live/build_stamp`.replace(/\/{2,}/g, "/");

    if (inspectorLiveBuild) {
    app.get(buildStampPath, (_req, res) => {
        const activeStaticDir = inspectorLiveBuild
          ? resolveLiveInspectorStaticDir(staticDir)
          : staticDir;
        const indexPath = path.join(activeStaticDir, "index.html");
        try {
          const st = fs.statSync(indexPath);
          res.set("Cache-Control", "no-store");
          res.type("application/json");
          res.json({ stamp: st.mtimeMs, dir: activeStaticDir });
        } catch {
          res.status(404).type("application/json").json({ error: "no_index" });
        }
      });

      app.use(
        basePath,
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
          if (req.method !== "GET" && req.method !== "HEAD") return next();
          if (req.path === "/" || req.path === "" || req.path.startsWith("/__live")) {
            return next();
          }

          const activeStaticDir = resolveLiveInspectorStaticDir(staticDir);
          const requested = decodeURIComponent(req.path.replace(/^\/+/, ""));
          const candidate = path.resolve(activeStaticDir, requested);
          const relative = path.relative(activeStaticDir, candidate);
          if (relative.startsWith("..") || path.isAbsolute(relative)) return next();

          try {
            if (!fs.statSync(candidate).isFile()) return next();
          } catch {
            return next();
          }

          res.set("Cache-Control", "no-store");
          res.sendFile(candidate);
        },
      );
    }

    app.use(
      basePath,
      expressStatic.static(staticDir, {
        index: false,
        fallthrough: true,
        maxAge: inspectorLiveBuild ? 0 : "1h",
        setHeaders: inspectorLiveBuild
          ? (res) => {
              res.setHeader("Cache-Control", "no-store");
            }
          : undefined,
      }),
    );

    app.get(
      [basePath, `${basePath}/*`],
      (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (req.method !== "GET") return next();
        if (req.path.startsWith(`${basePath}/__live`)) return next();

        const proto = req.protocol;
        const host = req.get("host") || "localhost";
        const origin = `${proto}://${host}`;

        if (inspectorLiveBuild) {
          const activeStaticDir = resolveLiveInspectorStaticDir(staticDir);
          const latest = readInspectorIndexHtml(activeStaticDir);
          if (!latest) return next();
          const html = appendInspectorLiveReloadScript(
            injectInspectorApiBaseMeta(latest, origin),
            buildStampPath,
          );
          res.set("Content-Type", "text/html; charset=utf-8");
          res.set("Cache-Control", "no-store");
          res.send(html);
          return;
        }

        if (!cachedHtml) {
          cachedHtml = injectInspectorApiBaseMeta(rawHtml, origin);
        }

        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Cache-Control", "no-store");
        res.send(cachedHtml);
      },
    );

    logger.info(
      `[Inspector] Serving SPA from ${staticDir} at ${basePath}${
        inspectorLiveBuild
          ? " (live rebuild: no HTML/asset cache; auto-reload when index.html changes)"
          : ""
      }`,
    );
  } catch (err) {
    logger.warn(`[Inspector] Failed to mount SPA: ${(err as Error).message}`);
  }
}

/**
 * Resolve the Inspector URL for the root landing page.
 *
 * Returns null when the Inspector is disabled or unavailable; an absolute
 * external URL when PUBLIC_INSPECTOR_URL is set; or a same-origin path
 * when a local mount is active.
 */
export function resolveInspectorLandingUrl(
  base: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const cfg = resolveInspectorMount(env);
  if (cfg.kind === "disabled") return null;
  if (cfg.kind === "external") return cfg.externalUrl ?? null;
  return `${base}${cfg.basePath}`;
}
