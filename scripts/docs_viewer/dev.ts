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
  const outDir = mkdtempSync(path.join(tmpdir(), "neotoma-docs-dev-"));
  let files = new Map<string, Buffer>();
  const close = () => rmSync(outDir, { recursive: true, force: true });
  function rebuild() {
    // A failed refresh must not leave yesterday's reader available as today's source.
    files = new Map();
    rmSync(outDir, { recursive: true, force: true });
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
  }
  try {
    rebuild();
  } catch (error) {
    close();
    throw error;
  }
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return next();
    }
    const route = url.pathname.replace(/\/+$/, "") || "/";
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
    if (!body && entry) {
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
    if (!body) return next();
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }
  return { middleware, rebuild, close };
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
      server.middlewares.use(reader.middleware);
      const sources = entries.map((entry) => path.resolve(repoRoot, entry.source));
      server.watcher.add(sources);
      const refresh = (event: string, file: string) => {
        if (!["add", "change", "unlink"].includes(event) || !sources.includes(path.resolve(file)))
          return;
        try {
          reader.rebuild();
          server.ws.send({ type: "full-reload" });
        } catch (error) {
          server.config.logger.error(`Docs reader refresh failed: ${String(error)}`);
        }
      };
      server.watcher.on("all", refresh);
      server.httpServer?.once("close", () => {
        server.watcher.off("all", refresh);
        reader.close();
      });
    },
  };
}
