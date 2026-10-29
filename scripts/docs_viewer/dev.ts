/** Serve the existing static docs reader before Vite's SPA fallback in development. */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { tsImport } from "tsx/esm/api";
import {
  buildDocsViewerIndex,
  DOCS_VIEWER_MANIFEST,
  DOCS_VIEWER_VISUALS,
  SPANISH_DOCS_VIEWER_MANIFEST,
  viewerHref,
} from "../../frontend/src/site/docs_viewer_manifest";
import type { runDocsViewer as buildDocsViewer } from "./build";

const manifests = [DOCS_VIEWER_MANIFEST, SPANISH_DOCS_VIEWER_MANIFEST];
const entries = manifests.flatMap((manifest) =>
  manifest.filter((entry) => entry.status === "included")
);
const index = buildDocsViewerIndex(entries);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function createDocsViewerDevMiddleware(
  repoRoot: string,
  runDocsViewer: typeof buildDocsViewer
) {
  const privateDir = mkdtempSync(path.join(tmpdir(), "neotoma-docs-dev-"));
  const outDir = path.join(privateDir, "readers");
  let files = new Map<string, Buffer>();
  const knownGeneratedPaths = new Set<string>();
  let buildError: unknown;
  const sourcePaths = new Set(entries.map((entry) => `/source/${entry.slug}.md`));
  const close = () => rmSync(privateDir, { recursive: true, force: true });
  function rebuild() {
    // A failed refresh must not leave yesterday's reader available as today's source.
    files = new Map();
    buildError = new Error("The documentation rebuild has not completed");
    rmSync(outDir, { recursive: true, force: true });
    try {
      for (const manifest of manifests) {
        const result = runDocsViewer({
          repoRoot,
          outDir,
          manifest,
          write: true,
          sourceContext: "local-preview",
        });
        if (result.failures.length) throw new Error(result.failures.join("\n"));
      }
    } catch (error) {
      buildError = error;
      throw error;
    }
    const next = new Map<string, Buffer>();
    function collect(dir: string) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) collect(file);
        else if (item.isFile())
          next.set(`/${path.relative(outDir, file).split(path.sep).join("/")}`, readFileSync(file));
      }
    }
    collect(outDir);
    next.set(
      "/assets/reader-language.js",
      readFileSync(path.join(repoRoot, "public/assets/reader-language.js"))
    );
    files = next;
    for (const file of files.keys()) knownGeneratedPaths.add(file);
    buildError = undefined;
  }
  try {
    rebuild();
  } catch {
    /* Known readers remain available as a meaningful 503 until source recovery. */
  }
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return next();
    }
    const route = url.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
    const conflict =
      /^\/(?:en|es)\/(?:en|es)(?:\/|$)/.test(route) ||
      /^\/(?:en|es)\/docs\/(?:en|es)(?:\/|$)/.test(route);
    if (conflict) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : "Conflicting language prefixes. Choose the English or Spanish page from /en/ or /es/."
      );
      return;
    }
    const entry = index.byRoute.get(route);
    if (!entry) {
      let alias = index.byAliasRoute.get(route);
      if (route.startsWith("/en/"))
        alias = index.byRoute.get(route.slice(3)) ?? index.byAliasRoute.get(route.slice(3));
      if (route.startsWith("/es/")) {
        const english = index.byAliasRoute.get(route.slice(3));
        if (english) alias = index.byRoute.get(`/es/${english.slug}`);
      }
      if (alias) {
        res.writeHead(302, {
          Location: `${viewerHref(alias.slug)}${url.search}`,
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
    }
    const file = entry ? `${viewerHref(entry.slug)}index.html` : url.pathname;
    const body = files.get(file);
    const knownReader =
      entry ||
      sourcePaths.has(url.pathname) ||
      knownGeneratedPaths.has(url.pathname) ||
      url.pathname === "/assets/reader-language.js";
    if (!body && knownReader && buildError) {
      res.writeHead(503, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : "The local documentation reader could not be built. Check the development server output, fix the source, and reload."
      );
      return;
    }
    if (!body) {
      if (
        knownReader ||
        /^\/(?:docs|source)(?:\/|$)/.test(route) ||
        /^\/(?:en|es)\/docs(?:\/|$)/.test(route)
      ) {
        res.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          req.method === "HEAD"
            ? undefined
            : "Documentation page not found. Return to /en/ or /es/ to choose a page."
        );
        return;
      }
      return next();
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }
  return {
    middleware,
    rebuild,
    close,
    privateDir,
    get buildError() {
      return buildError;
    },
  };
}

export function docsViewerDevPlugin(repoRoot: string): Plugin {
  return {
    name: "docs-viewer-dev",
    apply: "serve",
    async configureServer(server) {
      // Run the existing TSX builder with its frontend aliases. Keep its React graph
      // out of Vite's config bundle, which does not use the frontend tsconfig paths.
      const { runDocsViewer } = await tsImport(
        path.join(repoRoot, "scripts/docs_viewer/build.ts"),
        {
          parentURL: import.meta.url,
          tsconfig: path.join(repoRoot, "frontend/tsconfig.json"),
        }
      );
      const reader = createDocsViewerDevMiddleware(repoRoot, runDocsViewer);
      if (reader.buildError)
        server.config.logger.error(`Docs reader build failed: ${String(reader.buildError)}`);
      const visualPaths = new Set(Object.values(DOCS_VIEWER_VISUALS).map((visual) => visual.src));
      let visualFiles: Map<string, Buffer> | undefined;
      let visualPromise: Promise<void> | undefined;
      async function captureVisuals() {
        const address = server.httpServer?.address();
        if (!address || typeof address === "string")
          throw new Error("Local reader capture requires a listening server");
        const origin = `http://127.0.0.1:${address.port}`;
        const { chromium } = await import("playwright");
        const { captureTopicVisuals } = await tsImport(
          path.join(repoRoot, "scripts/docs_viewer/capture_visuals.tsx"),
          {
            parentURL: import.meta.url,
            tsconfig: path.join(repoRoot, "frontend/tsconfig.json"),
          }
        );
        const browser = await chromium.launch({ headless: true });
        try {
          const context = await browser.newContext({ serviceWorkers: "block" });
          await context.route("**/*", (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const staticPath =
              url.pathname === "/en/" ||
              /^\/(?:@|src\/|node_modules\/|(?:public\/)?brand\/|favicon|assets\/)/.test(
                url.pathname
              );
            return url.origin === origin && staticPath && ["GET", "HEAD"].includes(request.method())
              ? route.continue()
              : route.abort();
          });
          const page = await context.newPage();
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.goto(`${origin}/en/`, { waitUntil: "networkidle", timeout: 30000 });
          // Match the existing static capture's settled-homepage precondition. Network
          // idle alone can precede Vite's dependency reload and leave SVG strokes unstyled.
          await page.locator("#root > *").first().waitFor({ timeout: 30000 });
          await page
            .locator('svg[data-paper-scene="localService"]')
            .first()
            .waitFor({ timeout: 30000 });
          await page.waitForFunction(() => {
            const writing = document.querySelector(".paper-writing");
            return (
              writing &&
              getComputedStyle(writing).fill === "none" &&
              getComputedStyle(writing).stroke !== "none"
            );
          });
          const outDir = path.join(reader.privateDir, "visuals");
          await captureTopicVisuals(page, outDir);
          visualFiles = new Map(
            [...visualPaths].map((url) => [url, readFileSync(path.join(outDir, url.slice(1)))])
          );
        } finally {
          await browser.close();
        }
      }
      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        } catch {
          return next();
        }
        if (!["GET", "HEAD"].includes(req.method ?? "")) return next();
        if (!visualPaths.has(pathname)) {
          if (!pathname.startsWith("/brand/october/topic/")) return next();
          res.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(req.method === "HEAD" ? undefined : "Documentation visual not found.");
          return;
        }
        visualPromise ??= captureVisuals();
        void visualPromise
          .then(() => {
            res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-store" });
            res.end(req.method === "HEAD" ? undefined : visualFiles!.get(pathname));
          })
          .catch((error) => {
            server.config.logger.error(`Docs reader visual capture failed: ${String(error)}`);
            res.writeHead(503, {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(
              req.method === "HEAD"
                ? undefined
                : "Local reader visuals could not be built. Check the server output and restart after correcting the source."
            );
          });
      });
      server.middlewares.use(reader.middleware);
      const sources = entries.map((entry) => path.resolve(repoRoot, entry.source));
      server.watcher.add(sources);
      const refresh = (event: string, file: string) => {
        if (!["add", "change", "unlink"].includes(event) || !sources.includes(path.resolve(file)))
          return;
        try {
          reader.rebuild();
          server.config.logger.info(
            "Docs reader rebuilt. Refresh its browser page to read the changed Markdown. Restart the server after changing reader styles, images or renderer code."
          );
        } catch (error) {
          server.config.logger.error(`Docs reader refresh failed: ${String(error)}`);
        }
      };
      server.watcher.on("all", refresh);
      server.httpServer?.once("close", async () => {
        server.watcher.off("all", refresh);
        await visualPromise?.catch(() => {});
        reader.close();
      });
    },
  };
}
