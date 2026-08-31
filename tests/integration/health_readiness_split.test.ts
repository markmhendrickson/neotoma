/**
 * ateles#577: `/health` reported `ok: true` throughout an outage in which the
 * instance was effectively unusable — `/entities/query` took 25-80s and MCP
 * clients timed out, while `/health` answered in 1.4-20ms and the Fly check
 * read `passing` the whole time. The handler never touched the database, so
 * there was no database condition it could possibly have detected.
 *
 * The governing principle these tests encode: **a check that cannot determine
 * an answer must report UNKNOWN, not PASS.** Three states, not two.
 *
 * What is covered here, over real HTTP against the booted Express app (the same
 * surface Fly and every external monitor hit):
 *
 *  1. A healthy database → `/ready` 200 with `state: "ok"` and a latency number.
 *  2. A database that HANGS past the probe budget → `/ready` 503, `state:
 *     "timeout"`, `ok: false`. This is the ateles#577 condition, and it is the
 *     assertion that fails against the pre-fix code (which had no `/ready` at
 *     all: 404, and `/health` a confident 200).
 *  3. A database that THROWS → `/ready` 503, `state: "error"`.
 *  4. In both degraded conditions, `/health` still answers 200. That is the
 *     entire point of the split: liveness must not fail on database slowness,
 *     because a restart during a DB stall replaces a degraded instance with a
 *     cold one hitting the same slow database.
 *
 * The database is stubbed rather than genuinely slowed. That is deliberate and
 * it is the honest scope of this file: a real slow database cannot be produced
 * reproducibly in CI at the 25-80s scale of the incident, and a probe budget is
 * a *timing contract* — the thing under test is what the endpoint reports when
 * the probe does not finish in time, not the database's own performance. The
 * stub reproduces exactly that input condition (a read that does not resolve
 * within the budget) at a budget small enough to run in milliseconds.
 */

import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Controls what the stubbed `db.from(...).select(...).limit(...)` does. Each
 * test sets this before issuing its request. Declared before `vi.mock` because
 * the factory closes over it (vitest hoists the mock above the imports, so the
 * factory must not reference anything initialized at import time — reading the
 * binding lazily inside the function body is what makes this legal).
 */
type ProbeBehavior =
  | { kind: "ok" }
  | { kind: "hang" }
  | { kind: "throw"; message: string }
  | { kind: "dbError"; message: string };

let probeBehavior: ProbeBehavior = { kind: "ok" };

vi.mock("../../src/db.js", () => {
  const limit = () => {
    const behavior = probeBehavior;
    switch (behavior.kind) {
      case "ok":
        return Promise.resolve({ data: [{ id: "src_probe" }], error: null });
      case "hang":
        // Never resolves. Models the reported condition: the read is accepted
        // and simply does not come back inside the budget.
        return new Promise(() => {});
      case "throw":
        return Promise.reject(new Error(behavior.message));
      case "dbError":
        // The adapter's other failure shape: resolves with an `error` payload
        // rather than rejecting. Must be classified as a failure too.
        return Promise.resolve({ data: null, error: { message: behavior.message } });
    }
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit,
  };
  return {
    db: { from: () => builder },
    getServiceRoleClient: () => ({ from: () => builder }),
    initDatabase: async () => {},
  };
});

const API_PORT = 18571;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

/** Small enough that a hang test costs milliseconds, not seconds. */
const TEST_BUDGET_MS = "150";

interface ReadyBody {
  ok: boolean;
  version: string;
  db: { ok: boolean; latency_ms: number; state: string; error?: string };
}

describe("ateles#577 liveness/readiness split", () => {
  let httpServer: ReturnType<typeof createServer>;
  let previousBudget: string | undefined;

  beforeAll(async () => {
    previousBudget = process.env.NEOTOMA_READINESS_DB_TIMEOUT_MS;
    process.env.NEOTOMA_READINESS_DB_TIMEOUT_MS = TEST_BUDGET_MS;
    // Imported after the env var is set and after vi.mock is registered.
    const { app } = await import("../../src/actions.js");
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    if (previousBudget === undefined) delete process.env.NEOTOMA_READINESS_DB_TIMEOUT_MS;
    else process.env.NEOTOMA_READINESS_DB_TIMEOUT_MS = previousBudget;
    if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    probeBehavior = { kind: "ok" };
  });

  // ========================================================================
  // Healthy database
  // ========================================================================

  it("GET /ready returns 200 with a measured latency when the database answers", async () => {
    probeBehavior = { kind: "ok" };

    const res = await fetch(`${API_BASE}/ready`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ReadyBody;
    expect(body.ok).toBe(true);
    expect(body.db.ok).toBe(true);
    expect(body.db.state).toBe("ok");
    // A number, not a boolean — the endpoint reports what it measured.
    expect(typeof body.db.latency_ms).toBe("number");
    expect(body.db.latency_ms).toBeGreaterThanOrEqual(0);
    expect(body.db.latency_ms).toBeLessThan(Number(TEST_BUDGET_MS));
    expect(body.db.error).toBeUndefined();
    expect(typeof body.version).toBe("string");
  });

  // ========================================================================
  // Degraded: the database hangs past the budget (the ateles#577 condition)
  // ========================================================================

  it("GET /ready returns 503 with state=timeout when the database probe exceeds its budget", async () => {
    // THE regression assertion. Pre-fix there was no /ready at all, so this
    // request 404s and this expectation fails — see the PR body for the
    // recorded pre-fix run.
    probeBehavior = { kind: "hang" };

    const res = await fetch(`${API_BASE}/ready`);
    expect(
      res.status,
      "a readiness probe that could not complete must report non-200, never a confident pass"
    ).toBe(503);

    const body = (await res.json()) as ReadyBody;
    expect(body.ok).toBe(false);
    expect(body.db.ok).toBe(false);
    expect(body.db.state).toBe("timeout");
    expect(body.db.error).toMatch(/budget/i);
    // The endpoint must give up at its budget rather than hanging with the DB —
    // an unbounded readiness check is the same defect in a different costume.
    expect(body.db.latency_ms).toBeGreaterThanOrEqual(Number(TEST_BUDGET_MS) - 25);
    expect(body.db.latency_ms).toBeLessThan(Number(TEST_BUDGET_MS) * 10);
  });

  it("GET /health still returns 200 while the database is hanging", async () => {
    // The whole reason for the split. Liveness must NOT fail on DB slowness:
    // these are Fly service checks, and draining or restarting on a stalled
    // database makes the outage worse rather than better.
    probeBehavior = { kind: "hang" };

    const res = await fetch(`${API_BASE}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("serves /health promptly while a /ready probe is stuck on the database", async () => {
    // Liveness must stay cheap under exactly the condition that stalls
    // readiness — measured over two real HTTP round trips, not in-process.
    probeBehavior = { kind: "hang" };

    const readyInFlight = fetch(`${API_BASE}/ready`);

    const started = performance.now();
    const healthRes = await fetch(`${API_BASE}/health`);
    const healthMs = performance.now() - started;

    expect(healthRes.status).toBe(200);
    expect(
      healthMs,
      `GET /health took ${healthMs.toFixed(1)}ms while a /ready DB probe was stuck`
    ).toBeLessThan(Number(TEST_BUDGET_MS));

    // Drain the in-flight readiness request so it cannot leak into another test.
    const readyRes = await readyInFlight;
    expect(readyRes.status).toBe(503);
    await readyRes.json();
  });

  // ========================================================================
  // Degraded: the database throws
  // ========================================================================

  it("GET /ready returns 503 with state=error when the database read rejects", async () => {
    probeBehavior = { kind: "throw", message: "SQLITE_CORRUPT: database disk image is malformed" };

    const res = await fetch(`${API_BASE}/ready`);
    expect(res.status).toBe(503);

    const body = (await res.json()) as ReadyBody;
    expect(body.ok).toBe(false);
    expect(body.db.ok).toBe(false);
    expect(body.db.state).toBe("error");
    expect(body.db.error).toContain("SQLITE_CORRUPT");
  });

  it("GET /ready returns 503 when the adapter resolves with an error payload", async () => {
    // The adapter's non-throwing failure shape. Treating a resolved `{ error }`
    // as success would reintroduce the defect through the back door.
    probeBehavior = { kind: "dbError", message: "no such table: sources" };

    const res = await fetch(`${API_BASE}/ready`);
    expect(res.status).toBe(503);

    const body = (await res.json()) as ReadyBody;
    expect(body.ok).toBe(false);
    expect(body.db.state).toBe("error");
    expect(body.db.error).toContain("no such table");
  });

  it("GET /health still returns 200 while the database is throwing", async () => {
    probeBehavior = { kind: "throw", message: "connection refused" };

    const res = await fetch(`${API_BASE}/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  // ========================================================================
  // Both endpoints stay unauthenticated
  // ========================================================================

  it("serves both endpoints without a bearer token", async () => {
    // Both are in the unauthenticated allow-list (docs/security/threat_model.md
    // §4 and protected_routes_manifest.json). A readiness check the load
    // balancer cannot reach without credentials is not a readiness check.
    probeBehavior = { kind: "ok" };

    const [health, ready] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/ready`),
    ]);
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});
