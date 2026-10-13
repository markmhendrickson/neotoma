/**
 * Readiness probe backing `GET /ready`.
 *
 * Exists because `/health` proves almost nothing. It reads package.json off
 * disk and returns `{ok: true}` without touching the database, so on
 * 2026-08-31 it answered 200 in 0.89s while every entity query timed out at
 * 45s. Nothing in the swarm noticed a total read outage, because every
 * liveness check in it was pointed at that endpoint.
 *
 * A check that reports success while the system produces nothing is worse than
 * no check at all: it converts an outage into a silent one. This module is the
 * replacement — it runs a real read and is honest about how little that proves.
 */

/** The result of the probe query — only the error channel is consulted. */
export interface ReadinessQueryResult {
  error?: { message?: string } | null;
}

/**
 * The narrow slice of the db client this probe needs.
 *
 * `limit()` is typed as a PromiseLike rather than a Promise because the real
 * query builder is a chainable thenable (`LocalQueryBuilder`), not a Promise —
 * it has `then` but no `catch`/`finally`.
 */
export interface ReadinessDbClient {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<ReadinessQueryResult>;
    };
  };
}

export type ReadinessStatus = "ok" | "failed";

export interface ReadinessResult {
  ok: boolean;
  checks: { database: ReadinessStatus };
  /** Wall-clock duration of the probe, recorded on success and failure alike. */
  latency_ms: number;
  /** Present only on failure. */
  error?: string;
}

/**
 * Default bound for the database probe, in milliseconds.
 *
 * Deliberately shorter than the Fly check timeout (30s) so that a hung read
 * returns an explicit 503 rather than letting the check time out. A wedged
 * instance that answers "not ready" is diagnosable; one that answers nothing
 * is indistinguishable from a network fault or a dead host.
 */
export const DEFAULT_READY_DB_TIMEOUT_MS = 20_000;

export function resolveReadyTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.NEOTOMA_READY_DB_TIMEOUT_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_READY_DB_TIMEOUT_MS;
  // Floor at 1s: a sub-second bound would fail against a healthy instance
  // under normal load and train the operator to ignore the check.
  return Math.max(1_000, parsed);
}

/**
 * Runs a bounded real read against the database.
 *
 * What a passing result proves: the process is up, AND the database accepts a
 * connection and completes a trivial indexed read within the bound.
 *
 * What it does NOT prove:
 *
 *   - That heavier queries complete, or that writes succeed. A one-row read
 *     can stay fast while the query pool is exhausted. This separates "wedged"
 *     from "serving", not "healthy" from "degraded". Latency is returned on
 *     every probe so a caller can watch the ramp toward saturation rather than
 *     waiting for the cliff.
 *
 *   - That the database file on disk is intact. Verified by experiment on
 *     2026-09-01: with the server running, zeroing neotoma.db left this probe
 *     returning ok — the open SQLite handle keeps serving from its page cache
 *     while an independent reader gets "file is not a database". A file
 *     corrupt at OPEN time is a different matter: the process fails to boot
 *     and Fly's `restart` policy covers it, so no check is needed there.
 *
 * What it does catch, and `/health` does not: a read that errors or hangs
 * against a live process — the shape of the 2026-08-31 outage. Demonstrated
 * end to end by dropping the probed table under a running server, where
 * `/health` answered 200 and this returned 503 "no such table: sources".
 */
export async function probeReadiness(
  db: ReadinessDbClient,
  options: { timeoutMs?: number; now?: () => number } = {}
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? resolveReadyTimeoutMs();
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  // `sources` is created by migration 20251231000001 and asserted as required
  // by initDatabase(), so its absence is itself a real failure worth reporting.
  const probe = (async () => {
    const { error } = await db.from("sources").select("id").limit(1);
    if (error) throw new Error(error.message || "database read returned an error");
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`database read exceeded ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([probe, deadline]);
    return { ok: true, checks: { database: "ok" }, latency_ms: now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      checks: { database: "failed" },
      latency_ms: now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
    // When the deadline wins, the probe promise is still pending. Without this
    // its eventual rejection is an unhandled rejection that can take the
    // process down — which would turn a readiness check into an outage cause.
    void probe.catch(() => undefined);
  }
}
