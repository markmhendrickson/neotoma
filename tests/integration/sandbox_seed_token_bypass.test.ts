/**
 * Sandbox write rate limit: the internal seed token bypasses it; nothing else does.
 *
 * Per-session pack seeding fires many writes from the server's own loopback IP,
 * which collides on the per-IP sandbox write bucket. The auth/rate-limit layer
 * in `src/actions.ts` mints a per-boot token, exports it to the spawned seed
 * child, and lets requests carrying it `skip` the limiter. This test mirrors
 * that wiring (the full app can't be booted with NEOTOMA_SANDBOX_MODE in the
 * shared test server — same constraint as the other sandbox auth tests) and
 * asserts the security contract: the token bypasses, a wrong/absent token does
 * not, and the compare is length-safe.
 */

import { AddressInfo } from "node:net";
import { randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import { afterEach, describe, expect, it } from "vitest";

const SEED_TOKEN = randomUUID();
const HEADER = "x-neotoma-seed-token";

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
function isInternalSeedRequest(req: express.Request): boolean {
  const t = req.header(HEADER);
  return typeof t === "string" && t.length > 0 && safeCompare(t, SEED_TOKEN);
}

function makeApp(maxPerWindow: number) {
  const app = express();
  const limiter = rateLimit({
    windowMs: 60_000,
    max: maxPerWindow,
    keyGenerator: () => "shared-ip", // everyone shares one bucket (loopback)
    skip: isInternalSeedRequest,
    validate: { trustProxy: false } as never,
  });
  app.post("/store", limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function hammer(url: string, n: number, headers: Record<string, string>) {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(`${url}/store`, { method: "POST", headers });
    codes.push(res.status);
  }
  return codes;
}

describe("sandbox seed-token write bypass", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it("requests with the seed token are never rate-limited", async () => {
    const s = await listen(makeApp(3));
    close = s.close;
    const codes = await hammer(s.url, 10, { [HEADER]: SEED_TOKEN });
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it("requests without the token are rate-limited past the cap", async () => {
    const s = await listen(makeApp(3));
    close = s.close;
    const codes = await hammer(s.url, 10, {});
    expect(codes.filter((c) => c === 200).length).toBe(3);
    expect(codes.filter((c) => c === 429).length).toBe(7);
  });

  it("a wrong token does not bypass", async () => {
    const s = await listen(makeApp(3));
    close = s.close;
    const codes = await hammer(s.url, 10, { [HEADER]: "not-the-token" });
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });
});
