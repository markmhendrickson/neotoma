/**
 * Integration tests for the `GET /` and `GET /robots.txt` handlers wired in
 * `src/actions.ts` via `src/services/root_landing/index.ts`.
 *
 * Rather than spinning the full Neotoma app (which conflicts with the shared
 * vitest global setup), we mount the root-landing handlers onto a minimal
 * Express instance and exercise them over HTTP. That's enough to lock in the
 * contract: content negotiation, host-aware URL interpolation, mode selection
 * via `NEOTOMA_ROOT_LANDING_MODE`, and sandbox-mode robots.txt.
 */

import { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  buildLandingContext,
  buildRootLandingHtml,
  buildRootLandingJson,
  buildRootLandingMarkdown,
  buildRobotsTxt,
  wantsHtml,
  wantsMarkdown,
} from "../../src/services/root_landing/index.js";

type Server = ReturnType<express.Application["listen"]>;

function makeApp(): express.Application {
  const app = express();
  app.set("trust proxy", true);
  app.get("/", (req, res) => {
    const ctx = buildLandingContext(req);
    if (wantsHtml(req.headers.accept)) {
      return res.type("html").send(buildRootLandingHtml(ctx));
    }
    if (wantsMarkdown(req.headers.accept)) {
      res.type("text/markdown; charset=utf-8");
      return res.send(buildRootLandingMarkdown(ctx));
    }
    return res.type("application/json").json(buildRootLandingJson(ctx));
  });
  app.get("/robots.txt", (req, res) => {
    const ctx = buildLandingContext(req);
    return res.type("text/plain").send(buildRobotsTxt(ctx.mode, ctx.publicDocsUrl));
  });
  return app;
}

describe("wantsHtml", () => {
  it("returns false without an Accept header", () => {
    expect(wantsHtml(undefined)).toBe(false);
  });
  it("returns false for */*", () => {
    expect(wantsHtml("*/*")).toBe(false);
  });
  it("returns true for text/html preferred by browsers", () => {
    expect(wantsHtml("text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")).toBe(true);
  });
  it("returns false for application/json", () => {
    expect(wantsHtml("application/json")).toBe(false);
  });
});

describe("wantsMarkdown", () => {
  it("returns false without Accept", () => {
    expect(wantsMarkdown(undefined)).toBe(false);
  });
  it("returns true for text/markdown", () => {
    expect(wantsMarkdown("text/markdown")).toBe(true);
  });
  it("returns true for text/x-markdown", () => {
    expect(wantsMarkdown("text/x-markdown")).toBe(true);
  });
  it("returns false when HTML is also requested (HTML wins)", () => {
    expect(wantsMarkdown("text/html, text/markdown")).toBe(false);
  });
  it("returns false for application/json alone", () => {
    expect(wantsMarkdown("application/json")).toBe(false);
  });
});

describe("buildRobotsTxt", () => {
  it("disallows everything in sandbox mode", () => {
    const txt = buildRobotsTxt("sandbox", "https://neotoma.io");
    expect(txt).toContain("Disallow: /");
    expect(txt).not.toMatch(/^Allow: \/$/m);
  });
  it("disallows everything in local mode", () => {
    const txt = buildRobotsTxt("local", "https://neotoma.io");
    expect(txt).toContain("Disallow: /");
  });
  it("allows crawling in personal mode and references the sitemap", () => {
    const txt = buildRobotsTxt("personal", "https://neotoma.io");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /mcp");
    expect(txt).toContain("Disallow: /sandbox/");
    expect(txt).toContain("Sitemap: https://neotoma.io/sitemap.xml");
  });
  it("allows crawling in prod mode and references the sitemap", () => {
    const txt = buildRobotsTxt("prod", "https://neotoma.io");
    expect(txt).toContain("Allow: /");
  });
});

describe("root landing — content negotiation", () => {
  let server: Server;
  let baseUrl = "";
  const restoreEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // Force mode to "personal" so `buildLandingContext` ignores sandbox env
    // bleed-through from the process that invoked vitest.
    restoreEnv.NEOTOMA_ROOT_LANDING_MODE = process.env.NEOTOMA_ROOT_LANDING_MODE;
    restoreEnv.NEOTOMA_SANDBOX_MODE = process.env.NEOTOMA_SANDBOX_MODE;
    process.env.NEOTOMA_ROOT_LANDING_MODE = "personal";
    delete process.env.NEOTOMA_SANDBOX_MODE;

    await new Promise<void>((resolve) => {
      server = makeApp().listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [k, v] of Object.entries(restoreEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns JSON by default (no Accept header)", async () => {
    const res = await fetch(baseUrl + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as {
      name: string;
      mode: string;
      mcp_url: string;
      endpoints: Record<string, string>;
      harnesses: Array<{ id: string; human_config: { format: string; code: string } }>;
      index: Array<{ category: string; items: Array<{ label: string; href: string }> }>;
    };
    expect(body.name).toBe("Neotoma MCP");
    expect(body.mode).toBe("personal");
    expect(body.mcp_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(body.endpoints.mcp).toBe("/mcp");
    expect(body.endpoints.server_info).toBe("/server-info");
    expect(body.harnesses.length).toBeGreaterThan(0);
    expect(body.index.length).toBeGreaterThan(0);
  });

  it("returns HTML when Accept: text/html", async () => {
    const res = await fetch(baseUrl + "/", {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("<!doctype html>");
    expect(body).toContain("Neotoma");
    // Host-aware URL interpolation in the body
    expect(body).toContain("/mcp");
  });

  it("returns Markdown when Accept: text/markdown", async () => {
    const res = await fetch(baseUrl + "/", {
      headers: { Accept: "text/markdown" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body.startsWith("#")).toBe(true);
    expect(body).toContain("## Connect your harness");
    expect(body).toContain("http://127.0.0.1");
    expect(body).toMatch(/```(?:json|shell|toml|text)?\n/);
  });

  it("embeds the resolved host in harness snippets (JSON)", async () => {
    const res = await fetch(baseUrl + "/");
    const body = (await res.json()) as {
      harnesses: Array<{ id: string; human_config: { code: string } }>;
    };
    const cursor = body.harnesses.find((h) => h.id === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.human_config.code).toContain(baseUrl + "/mcp");
  });

  it("respects x-forwarded-host when trust proxy is on", async () => {
    const res = await fetch(baseUrl + "/", {
      headers: {
        "x-forwarded-host": "sandbox.neotoma.io",
        "x-forwarded-proto": "https",
      },
    });
    const body = (await res.json()) as { mcp_url: string; base_url: string };
    expect(body.mcp_url).toBe("https://sandbox.neotoma.io/mcp");
    expect(body.base_url).toBe("https://sandbox.neotoma.io");
  });

  it("/robots.txt reflects mode", async () => {
    const res = await fetch(baseUrl + "/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
  });
});

describe("root landing — sandbox mode", () => {
  let server: Server;
  let baseUrl = "";
  const restoreEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    restoreEnv.NEOTOMA_ROOT_LANDING_MODE = process.env.NEOTOMA_ROOT_LANDING_MODE;
    restoreEnv.NEOTOMA_SANDBOX_MODE = process.env.NEOTOMA_SANDBOX_MODE;
    process.env.NEOTOMA_ROOT_LANDING_MODE = "sandbox";
    await new Promise<void>((resolve) => {
      server = makeApp().listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [k, v] of Object.entries(restoreEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("advertises sandbox endpoints in the JSON payload", async () => {
    const res = await fetch(baseUrl + "/");
    const body = (await res.json()) as {
      mode: string;
      endpoints: Record<string, string>;
    };
    expect(body.mode).toBe("sandbox");
    expect(body.endpoints.sandbox_terms).toBe("/sandbox/terms");
    expect(body.endpoints.sandbox_report).toBe("/sandbox/report");
  });

  it("/robots.txt disallows crawling in sandbox mode", async () => {
    const res = await fetch(baseUrl + "/robots.txt");
    const body = await res.text();
    expect(body).toContain("Disallow: /");
    expect(body).not.toMatch(/^Allow: \/$/m);
  });

  it("HTML response includes sandbox-specific warning banner", async () => {
    const res = await fetch(baseUrl + "/", {
      headers: { Accept: "text/html" },
    });
    const body = await res.text();
    expect(body).toMatch(/public/i);
    expect(body).toMatch(/Sunday/);
  });
});

describe("buildLandingContext — explicit mode precedence", () => {
  afterEach(() => {
    delete process.env.NEOTOMA_ROOT_LANDING_MODE;
    delete process.env.NEOTOMA_SANDBOX_MODE;
  });

  it("explicit env overrides sandbox detection", () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    process.env.NEOTOMA_ROOT_LANDING_MODE = "prod";
    const req = {
      header: () => "example.com",
      socket: { remoteAddress: "203.0.113.10" },
      protocol: "https",
    } as unknown as express.Request;
    const ctx = buildLandingContext(req);
    expect(ctx.mode).toBe("prod");
  });

  it("sandbox env wins over loopback detection when explicit env is absent", () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    const req = {
      header: () => "example.com",
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "http",
    } as unknown as express.Request;
    const ctx = buildLandingContext(req);
    expect(ctx.mode).toBe("sandbox");
  });

  it("loopback falls through to local", () => {
    const req = {
      header: () => "localhost",
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "http",
    } as unknown as express.Request;
    const ctx = buildLandingContext(req);
    expect(ctx.mode).toBe("local");
  });

  it("remote request with no env falls through to personal", () => {
    const req = {
      header: () => "example.com",
      socket: { remoteAddress: "203.0.113.10" },
      protocol: "https",
    } as unknown as express.Request;
    const ctx = buildLandingContext(req);
    expect(ctx.mode).toBe("personal");
  });
});
