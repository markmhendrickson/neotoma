/**
 * Integration tests for the Inspector SPA mount installed by
 * `src/services/inspector_mount.ts`.
 *
 * Each test wires a minimal Express app through `installInspectorMount` with
 * controlled env vars and (where needed) a fixture `dist/inspector/index.html`.
 */

import { AddressInfo } from "node:net";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  installInspectorMount,
  resolveInspectorLandingUrl,
  resolveInspectorMount,
  resolveBundledInspectorDir,
  injectInspectorApiBaseMeta,
  appendInspectorLiveReloadScript,
} from "../../src/services/inspector_mount.js";

type Server = ReturnType<express.Application["listen"]>;

const FIXTURE_HTML = `<!DOCTYPE html><html><head><title>Inspector</title></head><body>OK</body></html>`;

function noopLogger() {
  return { info: () => {}, warn: () => {} };
}

function cleanEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.NEOTOMA_INSPECTOR_DISABLE;
  delete env.NEOTOMA_PUBLIC_INSPECTOR_URL;
  delete env.NEOTOMA_INSPECTOR_STATIC_DIR;
  delete env.NEOTOMA_INSPECTOR_BASE_PATH;
  delete env.NEOTOMA_INSPECTOR_BUNDLED_DISABLE;
  delete env.NEOTOMA_INSPECTOR_LIVE_BUILD;
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// Unit-level: resolveInspectorMount
// ---------------------------------------------------------------------------

describe("resolveInspectorMount", () => {
  it("returns disabled when NEOTOMA_INSPECTOR_DISABLE=1", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({ NEOTOMA_INSPECTOR_DISABLE: "1" }),
    );
    expect(cfg.kind).toBe("disabled");
  });

  it("returns external when NEOTOMA_PUBLIC_INSPECTOR_URL is set", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({ NEOTOMA_PUBLIC_INSPECTOR_URL: "https://example.test/inspector" }),
    );
    expect(cfg.kind).toBe("external");
    expect(cfg.externalUrl).toBe("https://example.test/inspector");
  });

  it("DISABLE takes precedence over PUBLIC_INSPECTOR_URL", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({
        NEOTOMA_INSPECTOR_DISABLE: "1",
        NEOTOMA_PUBLIC_INSPECTOR_URL: "https://example.test",
      }),
    );
    expect(cfg.kind).toBe("disabled");
  });

  it("returns local when NEOTOMA_INSPECTOR_STATIC_DIR is set", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: "/tmp/fake-inspector" }),
    );
    expect(cfg.kind).toBe("local");
    expect(cfg.staticDir).toBe("/tmp/fake-inspector");
  });

  it("respects NEOTOMA_INSPECTOR_BASE_PATH", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({
        NEOTOMA_INSPECTOR_STATIC_DIR: "/tmp/fake-inspector",
        NEOTOMA_INSPECTOR_BASE_PATH: "/ui",
      }),
    );
    expect(cfg.basePath).toBe("/ui");
  });

  it("returns disabled when NEOTOMA_INSPECTOR_BUNDLED_DISABLE=1 and no static dir", () => {
    const cfg = resolveInspectorMount(
      cleanEnv({ NEOTOMA_INSPECTOR_BUNDLED_DISABLE: "1" }),
    );
    expect(cfg.kind).toBe("disabled");
  });

  it("defaults basePath to /inspector", () => {
    const cfg = resolveInspectorMount(cleanEnv());
    expect(cfg.basePath).toBe("/inspector");
  });
});

// ---------------------------------------------------------------------------
// Unit-level: injectInspectorApiBaseMeta
// ---------------------------------------------------------------------------

describe("appendInspectorLiveReloadScript", () => {
  it("injects poll script before </head>", () => {
    const out = appendInspectorLiveReloadScript(FIXTURE_HTML, "/inspector/__live/build_stamp");
    expect(out).toContain("/inspector/__live/build_stamp");
    expect(out).toContain("location.reload");
  });
});

describe("injectInspectorApiBaseMeta", () => {
  it("injects meta tag before </head>", () => {
    const result = injectInspectorApiBaseMeta(FIXTURE_HTML, "http://localhost:3180");
    expect(result).toContain('<meta name="neotoma-api-base" content="http://localhost:3180">');
    expect(result.indexOf("neotoma-api-base")).toBeLessThan(result.indexOf("</head>"));
  });

  it("returns unchanged HTML when </head> is missing", () => {
    const noHead = "<html><body>hi</body></html>";
    expect(injectInspectorApiBaseMeta(noHead, "http://x")).toBe(noHead);
  });
});

// ---------------------------------------------------------------------------
// Unit-level: resolveInspectorLandingUrl
// ---------------------------------------------------------------------------

describe("resolveInspectorLandingUrl", () => {
  it("returns null when disabled", () => {
    expect(
      resolveInspectorLandingUrl(
        "http://localhost:3180",
        cleanEnv({ NEOTOMA_INSPECTOR_DISABLE: "1" }),
      ),
    ).toBeNull();
  });

  it("returns external URL when PUBLIC_INSPECTOR_URL is set", () => {
    expect(
      resolveInspectorLandingUrl(
        "http://localhost:3180",
        cleanEnv({ NEOTOMA_PUBLIC_INSPECTOR_URL: "https://ext.test/i" }),
      ),
    ).toBe("https://ext.test/i");
  });

  it("returns same-origin path when a static dir is set", () => {
    expect(
      resolveInspectorLandingUrl(
        "http://localhost:3180",
        cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: "/tmp/fake" }),
      ),
    ).toBe("http://localhost:3180/inspector");
  });

  it("returns null when bundled disabled and no static dir", () => {
    expect(
      resolveInspectorLandingUrl(
        "http://localhost:3180",
        cleanEnv({ NEOTOMA_INSPECTOR_BUNDLED_DISABLE: "1" }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: installInspectorMount with a temp fixture
// ---------------------------------------------------------------------------

describe("installInspectorMount — integration", () => {
  let server: Server | undefined;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function listenApp(app: express.Application): Promise<string> {
    return new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const port = (server!.address() as AddressInfo).port;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  }

  it("serves SPA and injects meta tag for STATIC_DIR", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("neotoma-api-base");
    expect(body).toContain("127.0.0.1");
  });

  it("redirects GET /inspector (no trailing slash) to /inspector/", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-slash-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector`, { redirect: "manual" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/inspector/");
  });

  it("preserves query string when redirecting /inspector → /inspector/", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-q-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector?handoff=1`, { redirect: "manual" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/inspector/?handoff=1");
  });

  it("serves deep-linked SPA routes", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-deep-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/entities/123`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<title>Inspector</title>");
  });

  it("does not mount when DISABLE=1", async () => {
    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_DISABLE: "1" }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector`);
    expect(res.status).toBe(404);
  });

  it("does not mount when PUBLIC_INSPECTOR_URL is set (external)", async () => {
    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_PUBLIC_INSPECTOR_URL: "https://external.test" }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector`);
    expect(res.status).toBe(404);
  });

  it("respects custom base path", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-path-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({
        NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir,
        NEOTOMA_INSPECTOR_BASE_PATH: "/ui",
      }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const atUi = await fetch(`${base}/ui`);
    expect(atUi.status).toBe(200);

    const atInspector = await fetch(`${base}/inspector`);
    expect(atInspector.status).toBe(404);
  });

  it("does not mount when BUNDLED_DISABLE=1 and no static dir", async () => {
    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_BUNDLED_DISABLE: "1" }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector`);
    expect(res.status).toBe(404);
  });

  it("/app returns 404 (no legacy alias)", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-noapp-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/app`);
    expect(res.status).toBe(404);
  });

  it("exposes build stamp JSON when NEOTOMA_INSPECTOR_LIVE_BUILD=1", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-stamp-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({
        NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir,
        NEOTOMA_INSPECTOR_LIVE_BUILD: "1",
      }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/__live/build_stamp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stamp?: number };
    expect(typeof body.stamp).toBe("number");
  });

  it("re-reads index.html on each request when NEOTOMA_INSPECTOR_LIVE_BUILD=1", async () => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-test-live-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({
        NEOTOMA_INSPECTOR_STATIC_DIR: tmpDir,
        NEOTOMA_INSPECTOR_LIVE_BUILD: "1",
      }),
      noopLogger(),
    );

    const base = await listenApp(app);
    const first = await fetch(`${base}/inspector`);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain("<title>Inspector</title>");

    const updated = `<!DOCTYPE html><html><head><title>Inspector v2</title></head><body>v2</body></html>`;
    writeFileSync(path.join(tmpDir, "index.html"), updated);

    const second = await fetch(`${base}/inspector`);
    expect(second.status).toBe(200);
    expect(await second.text()).toContain("<title>Inspector v2</title>");
  });
});
