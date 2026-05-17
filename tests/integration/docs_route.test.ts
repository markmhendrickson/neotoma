/**
 * Integration tests for the `/docs` and `/docs/<slug>` handlers.
 *
 * Mounts `mountDocsRoutes` against a minimal Express instance and a temp docs
 * tree, exercising visibility gating, slug sanitization, and content rendering.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { mountDocsRoutes } from "../../src/services/docs/index.js";

type Server = ReturnType<express.Application["listen"]>;

let tmpRoot: string;
let docsRoot: string;
let server: Server;
let baseUrl: string;

function makeApp(envSource: NodeJS.ProcessEnv): express.Application {
  const app = express();
  mountDocsRoutes(app, { repoRoot: tmpRoot, envSource });
  return app;
}

function startServer(app: express.Application): Promise<Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
}

function stopServer(s: Server): Promise<void> {
  return new Promise((resolve) => s.close(() => resolve()));
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-docs-it-"));
  docsRoot = path.join(tmpRoot, "docs");
  fs.mkdirSync(path.join(docsRoot, "foundation"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "plans"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "site"), { recursive: true });
  fs.writeFileSync(
    path.join(docsRoot, "foundation", "core_identity.md"),
    "# Core Identity\n\nNeotoma is the State Layer.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "plans", "draft.md"),
    "# Draft Plan\n\nNot yet ready.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "site", "site_doc_manifest.yaml"),
    [
      "version: 1",
      "categories:",
      "  - key: foundation",
      "    display_name: \"Foundation\"",
      "    order: 20",
      "    subcategories: []",
      "  - key: internal",
      "    display_name: \"Internal\"",
      "    order: 200",
      "    subcategories:",
      "      - key: plans",
      "        display_name: \"Plans\"",
      "        order: 20",
      "featured:",
      "  - docs/foundation/core_identity.md",
      "",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (server) await stopServer(server);
});

async function fetchPath(p: string): Promise<{ status: number; body: string }> {
  const res = await fetch(baseUrl + p);
  return { status: res.status, body: await res.text() };
}

describe("/docs", () => {
  beforeEach(async () => {
    const app = makeApp({ NODE_ENV: "production" });
    server = await startServer(app);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  it("returns 200 with the index page", async () => {
    const r = await fetchPath("/docs");
    expect(r.status).toBe(200);
    expect(r.body).toContain("Documentation");
    expect(r.body).toContain("Core Identity");
    expect(r.body).toContain("Featured");
  });

  it("renders a known doc page", async () => {
    const r = await fetchPath("/docs/foundation/core_identity");
    expect(r.status).toBe(200);
    expect(r.body).toContain('<h1 id="core-identity">Core Identity</h1>');
    expect(r.body).toContain("State Layer");
  });

  it("returns 404 for unknown slugs", async () => {
    const r = await fetchPath("/docs/foundation/nonexistent");
    expect(r.status).toBe(404);
    expect(r.body).toContain("Not found");
  });

  it("returns 404 for traversal attempts", async () => {
    const r = await fetchPath("/docs/..%2Fetc%2Fpasswd");
    expect(r.status).toBe(404);
  });

  it("hides internal docs in production", async () => {
    const r = await fetchPath("/docs/plans/draft");
    expect(r.status).toBe(404);
  });

  it("does not list internal docs on the index in production", async () => {
    const r = await fetchPath("/docs");
    expect(r.body).not.toContain("Draft Plan");
  });
});

describe("/docs with NEOTOMA_DOCS_SHOW_INTERNAL=true", () => {
  beforeEach(async () => {
    const app = makeApp({ NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" });
    server = await startServer(app);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  it("renders internal docs when the flag is set", async () => {
    const r = await fetchPath("/docs/plans/draft");
    expect(r.status).toBe(200);
    expect(r.body).toContain("Draft Plan");
  });

  it("lists internal docs on the index when the flag is set", async () => {
    const r = await fetchPath("/docs");
    expect(r.body).toContain("Draft Plan");
  });
});
