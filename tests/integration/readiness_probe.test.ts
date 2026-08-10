/**
 * Readiness must fail while the instance is merely SLOW (#2141).
 *
 * `/health` reads package.json and returns `{ok:true}`. It never touches the
 * database, so it cannot distinguish "the server is up" from "the server is up
 * and can answer a request". That gap is not theoretical: on 2026-08-10 this
 * instance served `/health` in 0.28s while entity reads took 34–37s and page
 * renders timed out past 40s. Every dashboard read green. The one signal
 * everybody trusts was the one signal that still worked.
 *
 * These tests drive the real Express app over a real socket. The important one
 * is `test_ready_fails_when_the_database_is_slow`: a probe that merely awaits
 * the database would return "ready" 37 seconds later — accurate and useless.
 * Detecting sustained degradation requires a LATENCY BUDGET, so that is what is
 * pinned here.
 */

import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function withHttpServer<T>(
  app: unknown,
  callback: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server: Server = createServer(app as never);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

/** Replace the db module with a driver that behaves however the test needs. */
function mockDb(behaviour: () => Promise<unknown>): void {
  vi.doMock("../../src/db.js", () => ({
    db: {
      from: () => ({
        select: () => ({
          limit: () => behaviour(),
        }),
      }),
    },
    getServiceRoleClient: () => ({}),
    initDatabase: async () => undefined,
  }));
}

async function freshApp(): Promise<unknown> {
  vi.resetModules();
  const mod = await import("../../src/actions.js");
  return (mod as { app: unknown }).app;
}

describe("readiness probe (#2141)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../src/db.js");
    vi.resetModules();
    vi.useRealTimers();
  });

  it("reports ready when the database answers promptly", async () => {
    mockDb(async () => ({ data: [{ id: "e1" }], error: null }));
    const app = await freshApp();

    await withHttpServer(app, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/ready`);
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.database).toBe("ok");
      expect(typeof body.elapsed_ms).toBe("number");
    });
  });

  it("fails when the database is SLOW, not only when it is down", async () => {
    // THE test. A probe without a budget would eventually resolve and report
    // ready — which is exactly the 2026-08-10 condition it must catch.
    process.env.NEOTOMA_READINESS_BUDGET_MS = "50";
    mockDb(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: [], error: null }), 5000))
    );
    const app = await freshApp();

    await withHttpServer(app, async (baseUrl) => {
      const started = Date.now();
      const resp = await fetch(`${baseUrl}/ready`);
      const elapsed = Date.now() - started;

      expect(resp.status).toBe(503);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.database).toBe("unreachable");
      expect(String(body.error)).toMatch(/exceeded/);
      // It must fail FAST — waiting out the slow query defeats the purpose.
      expect(elapsed).toBeLessThan(2000);
    });
    delete process.env.NEOTOMA_READINESS_BUDGET_MS;
  });

  it("fails when the driver returns an error", async () => {
    mockDb(async () => ({ data: null, error: { message: "connection reset" } }));
    const app = await freshApp();

    await withHttpServer(app, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/ready`);
      expect(resp.status).toBe(503);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.database).toBe("error");
      expect(String(body.error)).toContain("connection reset");
    });
  });

  it("fails when the driver throws", async () => {
    mockDb(async () => {
      throw new Error("driver exploded");
    });
    const app = await freshApp();

    await withHttpServer(app, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/ready`);
      expect(resp.status).toBe(503);
    });
  });

  it("keeps /health cheap and independent of the database", async () => {
    // Liveness must NOT be made to fail by a slow dependency — that is the
    // division of labour. A hung database should fail /ready and leave /health
    // answering, so an operator can still tell the process is alive.
    process.env.NEOTOMA_READINESS_BUDGET_MS = "50";
    mockDb(() => new Promise(() => {})); // never resolves
    const app = await freshApp();

    await withHttpServer(app, async (baseUrl) => {
      const started = Date.now();
      const resp = await fetch(`${baseUrl}/health`);
      expect(resp.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(1000);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });
    delete process.env.NEOTOMA_READINESS_BUDGET_MS;
  });
});
