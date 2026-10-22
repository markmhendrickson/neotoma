/**
 * CSP must not upgrade subresources on plain HTTP loopback — otherwise the
 * Inspector shell at http://localhost:3080|3180 loads HTML over HTTP but the
 * browser requests https://localhost/.../assets/* (ERR_SSL_PROTOCOL_ERROR).
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import {
  BUILT_INSPECTOR_ASSETS,
  skipWithoutPrerequisite,
} from "../helpers/test_prerequisites.js";

// Serving the Inspector HTML shell is the whole point of this assertion, so a
// checkout without `dist/inspector/index.html` cannot exercise it. Skip with a
// named reason rather than fail (issue #2090) — a bare `npm ci` does not build
// the Inspector, and a failure there is indistinguishable from a real break.
const SKIP = skipWithoutPrerequisite(BUILT_INSPECTOR_ASSETS, "CSP on loopback HTTP");

describe.skipIf(SKIP)("CSP on loopback HTTP", () => {
  let httpServer: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const addr = httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("does not send upgrade-insecure-requests on inspector HTML shell", async () => {
    const res = await fetch(`${base}/`, { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
