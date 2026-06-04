/**
 * Integration tests for Inspector skin injection.
 *
 * Spins up the Inspector SPA mount against a fixture index.html and asserts
 * the resolved skin payload appears in (or stays absent from) the served HTML
 * based on the `NEOTOMA_INSPECTOR_SKIN` / `NEOTOMA_INSPECTOR_SKIN_CONFIG` env
 * vars.
 */

import { AddressInfo } from "node:net";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { installInspectorMount } from "../../src/services/inspector_mount.js";

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
  delete env.NEOTOMA_INSPECTOR_SKIN;
  delete env.NEOTOMA_INSPECTOR_SKIN_CONFIG;
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

describe("installInspectorMount — skin injection", () => {
  let server: Server | undefined;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    if (tmpDir) {
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

  function setupFixture(prefix: string): string {
    tmpDir = path.join(process.cwd(), "tmp", `${prefix}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "index.html"), FIXTURE_HTML);
    return tmpDir;
  }

  it("injects the skin script into the served SPA shell when NEOTOMA_INSPECTOR_SKIN_CONFIG is set", async () => {
    const dir = setupFixture("inspector-skin-explicit");
    const skinPath = path.join(dir, "lemonbrand.json");
    writeFileSync(
      skinPath,
      JSON.stringify({
        name: "lemonbrand",
        brand: { sidebar_title: "Lemonbrand" },
        light: { primary: "49 96% 52%" },
      })
    );

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: dir, NEOTOMA_INSPECTOR_SKIN_CONFIG: skinPath }),
      noopLogger()
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("__NEOTOMA_INSPECTOR_SKIN__");
    expect(body).toContain('"name":"lemonbrand"');
    expect(body).toContain('"sidebar_title":"Lemonbrand"');
    // Skin script must appear inside <head>, before </head>, alongside the
    // existing API base meta tag.
    expect(body.indexOf("__NEOTOMA_INSPECTOR_SKIN__")).toBeLessThan(body.indexOf("</head>"));
    expect(body).toContain("neotoma-api-base");
  });

  it("loads the lemonbrand preset from inspector/public/skins when NEOTOMA_INSPECTOR_SKIN is set", async () => {
    const dir = setupFixture("inspector-skin-preset");

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: dir, NEOTOMA_INSPECTOR_SKIN: "lemonbrand" }),
      noopLogger()
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"name":"lemonbrand"');
    expect(body).toContain('"primary":"49 96% 52%"');
  });

  it("omits the skin script when neither skin env var is set", async () => {
    const dir = setupFixture("inspector-skin-absent");

    const app = express();
    installInspectorMount(app, cleanEnv({ NEOTOMA_INSPECTOR_STATIC_DIR: dir }), noopLogger());

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("__NEOTOMA_INSPECTOR_SKIN__");
    // API base meta tag still present so the SPA can discover the origin.
    expect(body).toContain("neotoma-api-base");
  });

  it("omits the skin script when an unknown preset is requested", async () => {
    const dir = setupFixture("inspector-skin-unknown");

    const app = express();
    installInspectorMount(
      app,
      cleanEnv({
        NEOTOMA_INSPECTOR_STATIC_DIR: dir,
        NEOTOMA_INSPECTOR_SKIN: "no-such-skin-name",
      }),
      noopLogger()
    );

    const base = await listenApp(app);
    const res = await fetch(`${base}/inspector/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("__NEOTOMA_INSPECTOR_SKIN__");
  });
});
