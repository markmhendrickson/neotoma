import { createServer, type Server } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocsViewerDevMiddleware } from "../../scripts/docs_viewer/dev";

describe("development docs reader using actual manifest sources", () => {
  let reader: ReturnType<typeof createDocsViewerDevMiddleware>;
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    reader = createDocsViewerDevMiddleware(path.resolve(__dirname, "../.."));
    server = createServer((req, res) =>
      reader.middleware(req, res, () => {
        res.writeHead(404).end("Not found");
      })
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test listener");
    origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    reader?.close();
  });

  it.each(["/vocabulary/", "/cli/", "/readme/", "/es/vocabulary/"])(
    "serves %s as a complete reader without a client redirect",
    async (route) => {
      const response = await fetch(`${origin}${route}?preview=1`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain('id="dv-main"');
      expect(html).toContain(`lang="${route.startsWith("/es/") ? "es" : "en"}"`);
      expect(html).not.toContain("This page has moved.");
      expect(html).not.toContain("location.replace");
      expect(html).not.toContain("/@vite/client");
    }
  );
  it.each([
    ["/docs/vocabulary/", "/vocabulary/"],
    ["/en/vocabulary/", "/vocabulary/"],
    ["/en/docs/vocabulary/", "/vocabulary/"],
    ["/es/docs/vocabulary/", "/es/vocabulary/"],
    ["/docs/es/vocabulary/", "/es/vocabulary/"],
  ])(
    "redirects alias %s without an interstitial and retains the query",
    async (alias, destination) => {
      const response = await fetch(`${origin}${alias}?preview=1`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`${destination}?preview=1`);
      expect(await response.text()).toBe("");
    }
  );
  it("supports HEAD and the reader language asset", async () => {
    const head = await fetch(`${origin}/es/vocabulary/`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
    expect(await head.text()).toBe("");
    const asset = await fetch(`${origin}/assets/reader-language.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(await asset.text()).toContain("preferred_locale");
  });
  it.each([
    "/docs/not-a-real-document/",
    "/source/.env",
    "/source/../../.env.development",
    "/not-a-real-page/",
  ])("does not claim unrelated or unsafe path %s", async (route) => {
    expect((await fetch(`${origin}${route}`)).status).toBe(404);
  });
  it("does not intercept mutations", async () => {
    expect((await fetch(`${origin}/vocabulary/`, { method: "POST" })).status).toBe(404);
  });
});
