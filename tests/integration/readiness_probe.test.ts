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
import { readFileSync } from "node:fs";

import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPENAPI_OPERATION_MAPPINGS } from "../../src/shared/contract_mappings.js";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";

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
    // Detail IS returned here because the test env is not production. That is
    // the intended behaviour and also exactly why the production leak below
    // went unnoticed on the first pass — asserting only this case proves
    // nothing about what an unauthenticated caller sees in production.
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

  describe("production does not leak driver detail to unauthenticated callers", () => {
    // `/ready` has `security: []` — anyone on the internet can call it. SQLite
    // and filesystem errors routinely carry absolute paths and schema
    // fragments, so returning `Error.message` verbatim hands those out on
    // request. Same rule `handleApiError` already applies
    // (security_audit_2026_04_22.md S-5); this route bypassed it.
    const withProdEnv = async (
      behaviour: () => Promise<unknown>,
      assertion: (body: Record<string, unknown>) => void
    ) => {
      process.env.NEOTOMA_ENV = "production";
      delete process.env.NEOTOMA_VERBOSE_ERRORS;
      mockDb(behaviour);
      const app = await freshApp();
      try {
        await withHttpServer(app, async (baseUrl) => {
          const resp = await fetch(`${baseUrl}/ready`);
          expect(resp.status).toBe(503);
          assertion((await resp.json()) as Record<string, unknown>);
        });
      } finally {
        delete process.env.NEOTOMA_ENV;
      }
    };

    it("redacts a driver error message", async () => {
      await withProdEnv(
        async () => ({
          data: null,
          error: { message: "SQLITE_CANTOPEN: unable to open /var/lib/neotoma/prod.db" },
        }),
        (body) => {
          const detail = String(body.error);
          expect(detail).not.toContain("/var/lib/neotoma");
          expect(detail).not.toContain("SQLITE_CANTOPEN");
          expect(body.database).toBe("error");
        }
      );
    });

    it("redacts a thrown driver error", async () => {
      await withProdEnv(
        async () => {
          throw new Error("connect ENOENT /Users/someone/secret/path/neotoma.db");
        },
        (body) => {
          const detail = String(body.error);
          expect(detail).not.toContain("/Users/someone");
          expect(detail).not.toContain("ENOENT");
        }
      );
    });

    it("still returns the budget overrun, which is ours and carries no paths", async () => {
      // Redacting this one would gut the endpoint: "exceeded 3000ms" is the
      // entire diagnostic value of the response during the incident it exists
      // to catch. The string is constructed here, not by the driver.
      process.env.NEOTOMA_READINESS_BUDGET_MS = "50";
      await withProdEnv(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 5000)),
        (body) => {
          expect(body.database).toBe("unreachable");
          expect(String(body.error)).toMatch(/exceeded 50ms/);
          expect(body.budget_ms).toBe(50);
        }
      );
      delete process.env.NEOTOMA_READINESS_BUDGET_MS;
    });

    it("returns detail again when NEOTOMA_VERBOSE_ERRORS is set", async () => {
      process.env.NEOTOMA_ENV = "production";
      process.env.NEOTOMA_VERBOSE_ERRORS = "1";
      mockDb(async () => ({ data: null, error: { message: "SQLITE_BUSY on /tmp/x.db" } }));
      const app = await freshApp();
      try {
        await withHttpServer(app, async (baseUrl) => {
          const body = (await (await fetch(`${baseUrl}/ready`)).json()) as Record<string, unknown>;
          expect(String(body.error)).toContain("SQLITE_BUSY");
        });
      } finally {
        delete process.env.NEOTOMA_ENV;
        delete process.env.NEOTOMA_VERBOSE_ERRORS;
      }
    });
  });

  it("declares /ready in the contract, matching what it serves", () => {
    // The route existed and answered before it was declared anywhere
    // (guardrails MUST #17). An undeclared public route is invisible to
    // generated clients and to the security manifest.
    const spec = load(readFileSync(resolveOpenApiPath(), "utf-8")) as {
      paths?: Record<string, { get?: { operationId?: string } }>;
    };
    expect(spec.paths?.["/ready"]?.get?.operationId).toBe("readinessCheck");

    const mapping = OPENAPI_OPERATION_MAPPINGS.find((m) => m.path === "/ready");
    expect(mapping, "/ready must have a contract mapping row").toBeTruthy();
    expect(mapping?.operationId).toBe("readinessCheck");
    expect(mapping?.adapter).toBe("infra");
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
