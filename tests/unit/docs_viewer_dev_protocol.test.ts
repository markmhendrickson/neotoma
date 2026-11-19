import {
  createServer as createHttpServer,
  request,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, loadConfigFromFile, type ViteDevServer, type Plugin } from "vite";
import {
  buildDocsViewerIndex,
  DOCS_VIEWER_MANIFEST,
  SPANISH_DOCS_VIEWER_MANIFEST,
} from "../../frontend/src/site/docs_viewer_manifest";

const repoRoot = path.resolve(__dirname, "../..");
const index = buildDocsViewerIndex(
  [...DOCS_VIEWER_MANIFEST, ...SPANISH_DOCS_VIEWER_MANIFEST].filter(
    (entry) => entry.status === "included"
  )
);
const routes = [
  ...new Set([
    ...index.byRoute.keys(),
    ...index.byAliasRoute.keys(),
    "/en/schemas",
    "/es/schemas",
    "/en/docs/schemas",
    "/es/docs/schemas",
    "/schemas/index.html",
  ]),
].sort();
const syntheticAuthorization = "Bearer synthetic-not-a-real-credential";
type Receipt = { status: number; type: string; handler: string; body: string };
function send(
  origin: string,
  route: string,
  accept?: string,
  method = "GET",
  body = ""
): Promise<Receipt> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Authorization: syntheticAuthorization };
    if (accept !== undefined) headers.Accept = accept;
    if (body) headers["Content-Length"] = String(Buffer.byteLength(body));
    const req = request(`${origin}${route}`, { method, headers }, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        response += chunk;
      });
      res.on("end", () =>
        resolve({
          status: res.statusCode!,
          type: String(res.headers["content-type"]),
          handler: String(
            res.headers["x-synthetic-handler"] ??
              (response.includes('id="dv-main"') ? "reader" : "vite")
          ),
          body: response,
        })
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("actual Vite reader plugin preserves the normal proxy/protocol boundary", () => {
  let backend: Server;
  const servers: ViteDevServer[] = [];
  const cacheDirs: string[] = [];
  const origins: string[] = [];
  const received: Array<{
    handler: string;
    url: string;
    accept?: string;
    method: string;
    authorized: boolean;
    body: string;
  }> = [];
  let proxyKeys: string[];
  beforeAll(async () => {
    const fallback = (handler: string) => (req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        const row = {
          handler,
          url: req.url!,
          accept: req.headers.accept,
          method: req.method!,
          authorized: req.headers.authorization === syntheticAuthorization,
          body,
        };
        received.push(row);
        const eventStream = String(req.headers.accept ?? "").includes("text/event-stream");
        res.writeHead(207, {
          "Content-Type": eventStream ? "text/event-stream" : "application/json",
          "X-Synthetic-Handler": handler,
        });
        res.end(eventStream ? 'data: {"synthetic":true}\n\n' : JSON.stringify(row));
      });
    };
    backend = createHttpServer(fallback("proxy"));
    await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
    const address = backend.address();
    if (!address || typeof address === "string")
      throw new Error("Missing synthetic backend listener");
    const target = `http://127.0.0.1:${address.port}`;
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      path.join(repoRoot, "vite.config.ts")
    );
    if (!loaded) throw new Error("Missing actual Vite config");
    proxyKeys = Object.keys(loaded.config.server?.proxy ?? {});
    expect(proxyKeys.length).toBeGreaterThan(0);
    for (const useReader of [false, true]) {
      const cacheDir = mkdtempSync(path.join(tmpdir(), "neotoma-reader-protocol-"));
      cacheDirs.push(cacheDir);
      const plugins = (loaded.config.plugins ?? []).flat(Infinity).filter(Boolean) as Plugin[];
      const portProbe = createHttpServer();
      await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
      const probeAddress = portProbe.address();
      if (!probeAddress || typeof probeAddress === "string")
        throw new Error("Missing free-port probe");
      const port = probeAddress.port;
      await new Promise<void>((resolve) => portProbe.close(() => resolve()));
      const server = await createServer({
        ...loaded.config,
        configFile: false,
        envDir: false,
        envFile: false,
        root: path.join(repoRoot, "frontend"),
        cacheDir,
        appType: "custom",
        optimizeDeps: { noDiscovery: true, include: [], entries: [] },
        plugins: [
          ...plugins.filter((plugin) => useReader || plugin.name !== "docs-viewer-dev"),
          {
            name: "synthetic-post-proxy-fallback",
            configureServer(server) {
              return () => {
                server.middlewares.use(fallback("fallthrough"));
              };
            },
          },
        ],
        server: {
          ...loaded.config.server,
          host: "127.0.0.1",
          port,
          strictPort: true,
          hmr: false,
          watch: null,
          proxy: Object.fromEntries(proxyKeys.map((key) => [key, { target, changeOrigin: true }])),
        },
      });
      expect(server.config.envDir).toBe(false);
      expect(Object.keys(server.config.server.proxy ?? {})).toEqual(proxyKeys);
      expect(
        Object.values(server.config.server.proxy ?? {}).every(
          (proxy) => typeof proxy === "object" && proxy.target === target
        )
      ).toBe(true);
      servers.push(server);
      await server.listen();
      const socket = server.httpServer?.address();
      if (!socket || typeof socket === "string") throw new Error("Missing Vite listener");
      origins.push(`http://127.0.0.1:${socket.port}`);
    }
  }, 30000);
  afterAll(async () => {
    for (const server of servers) await server.close();
    if (backend) await new Promise<void>((resolve) => backend.close(() => resolve()));
    for (const dir of cacheDirs) rmSync(dir, { recursive: true, force: true });
  });

  it.each(["application/json", "*/*", undefined, "application/json, text/event-stream"])(
    "preserves every reader/alias intersection for Accept %s",
    async (accept) => {
      for (const route of routes) {
        const url = `${route}?keyword=invoice&value=a%2Bb`;
        const baseline = await send(origins[0], url, accept);
        const before = received.length;
        const actual = await send(origins[1], url, accept);
        expect(actual, `${accept} ${route}`).toEqual(baseline);
        expect(actual.status).toBe(207);
        expect(actual.handler).not.toBe("reader");
        expect(received.length).toBe(before + 1);
        expect(received.at(-1)).toMatchObject({ url, method: "GET", authorized: true });
      }
    },
    30000
  );
  it.each(["/schemas?keyword=invoice", "/observations?entity_id=synthetic", "/mcp"])(
    "keeps GET/HEAD API and SSE reads on the existing handler at %s",
    async (url) => {
      for (const accept of [
        "application/json",
        "*/*",
        undefined,
        "text/event-stream",
        "application/json, text/event-stream",
      ]) {
        for (const method of ["GET", "HEAD"]) {
          const actual = await send(origins[1], url, accept, method);
          expect(actual.status).toBe(207);
          expect(actual.handler).toBe("proxy");
          expect(actual.type).toContain(
            accept?.includes("text/event-stream") ? "text/event-stream" : "application/json"
          );
          if (method === "HEAD") expect(actual.body).toBe("");
        }
      }
    }
  );
  it.each(["text/html", "application/xhtml+xml", "application/json, text/html"])(
    "preserves explicit HTML navigation with Accept %s",
    async (accept) => {
      for (const route of [
        "/schemas",
        "/observations",
        "/mcp",
        "/vocabulary/",
        "/es/vocabulary/",
      ]) {
        const actual = await send(origins[1], route, accept);
        expect(actual.status).toBe(200);
        expect(actual.type).toContain("text/html");
        expect(actual.handler).toBe("reader");
        expect(actual.body).toContain('id="dv-main"');
        const head = await send(origins[1], route, accept, "HEAD");
        expect(head.status).toBe(200);
        expect(head.body).toBe("");
      }
    }
  );
  it("preserves source Markdown and language assets without requiring HTML", async () => {
    for (const accept of [undefined, "*/*", "application/json"]) {
      expect((await send(origins[1], "/source/vocabulary.md", accept)).type).toContain(
        "text/markdown"
      );
      expect((await send(origins[1], "/assets/reader-language.js", accept)).type).toContain(
        "javascript"
      );
    }
  });
  it("leaves mutation methods and unrelated API routes unchanged", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const actual = await send(
        origins[1],
        "/schemas?keyword=invoice",
        "text/html",
        method,
        "synthetic-body"
      );
      const baseline = await send(
        origins[0],
        "/schemas?keyword=invoice",
        "text/html",
        method,
        "synthetic-body"
      );
      expect(actual, `${method}: ${JSON.stringify(actual)}`).toEqual(baseline);
      if (method === "OPTIONS") {
        expect(actual.status).toBe(204);
        expect(actual.handler).toBe("vite");
      } else {
        expect(actual.status, `${method}: ${JSON.stringify(actual)}`).toBe(207);
        expect(actual.handler).toBe("proxy");
        expect(received.at(-1)).toMatchObject({ method, body: "synthetic-body" });
      }
    }
    expect((await send(origins[1], "/health", "application/json")).handler).toBe("proxy");
  });
});
