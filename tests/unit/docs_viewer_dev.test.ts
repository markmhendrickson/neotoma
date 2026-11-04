import { createServer, type Server } from "node:http";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocsViewerDevMiddleware } from "../../scripts/docs_viewer/dev";
import { runDocsViewer } from "../../scripts/docs_viewer/build";

const fetchReader = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, headers: { Accept: "text/html", ...init?.headers } });

describe("development docs reader using actual manifest sources", () => {
  let reader: ReturnType<typeof createDocsViewerDevMiddleware>;
  let server: Server;
  let origin: string;
  let failRefresh = false;
  beforeAll(async () => {
    reader = createDocsViewerDevMiddleware(path.resolve(__dirname, "../.."), (options) => {
      if (failRefresh) throw new Error("Synthetic source validation failure");
      return runDocsViewer(options);
    });
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
      const response = await fetchReader(`${origin}${route}?preview=1`);
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
      const response = await fetchReader(`${origin}${alias}?preview=1`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`${destination}?preview=1`);
      expect(await response.text()).toBe("");
    }
  );
  it("supports HEAD and the reader language asset", async () => {
    const head = await fetchReader(`${origin}/es/vocabulary/`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
    expect(await head.text()).toBe("");
    const asset = await fetchReader(`${origin}/assets/reader-language.js`);
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
    expect((await fetchReader(`${origin}${route}`)).status).toBe(404);
  });
  it.each(["/en/es/vocabulary/", "/es/en/vocabulary/", "/en/docs/es/vocabulary/"])(
    "rejects conflicting locale prefixes %s",
    async (route) => {
      const response = await fetchReader(`${origin}${route}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Conflicting language");
    }
  );
  it("retains a private parent throughout rebuilding and cleans up only its own output", () => {
    const mode = () => statSync(reader.privateDir).mode & 0o777;
    expect(mode()).toBe(0o700);
    reader.rebuild();
    expect(mode()).toBe(0o700);
    const failed = createDocsViewerDevMiddleware(path.resolve(__dirname, "../.."), () => {
      throw new Error("Invalid initial source");
    });
    expect(failed.buildError).toBeTruthy();
    expect(statSync(failed.privateDir).mode & 0o777).toBe(0o700);
    failed.close();
    expect(existsSync(failed.privateDir)).toBe(false);
    expect(existsSync(reader.privateDir)).toBe(true);
  });
  it("does not intercept mutations", async () => {
    expect((await fetchReader(`${origin}/vocabulary/`, { method: "POST" })).status).toBe(404);
  });
  it("fails visibly instead of falling back into the SPA redirect when rebuilding fails", async () => {
    failRefresh = true;
    try {
      expect(() => reader.rebuild()).toThrow("Synthetic source validation failure");
      const response = await fetchReader(`${origin}/vocabulary/`);
      expect(response.status).toBe(503);
      expect(await response.text()).toContain("could not be built");
      expect((await fetchReader(`${origin}/vocabulary/index.html`)).status).toBe(503);
      expect((await fetchReader(`${origin}/source/vocabulary.md`)).status).toBe(503);
      expect((await fetchReader(`${origin}/source/not-real.md`)).status).toBe(404);
      for (const Accept of ["application/json", "*/*", "text/event-stream"]) {
        const api = await fetch(`${origin}/schemas`, { headers: { Accept } });
        expect(api.status).toBe(404);
        expect(await api.text()).toBe("Not found");
      }
    } finally {
      failRefresh = false;
      reader.rebuild();
    }
  });
});
