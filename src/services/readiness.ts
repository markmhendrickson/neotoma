import { runtimeEnv } from "../config_embedded.js";
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

export function resolveReadyTimeoutMs(env: NodeJS.ProcessEnv = runtimeEnv()): number {
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

// ============================================================================
// Storage write probe (`checks.storage_write` on GET /ready, and
// GET /ready/storage).
//
// The read probe above passes while every write fails, for example when the
// data volume is full. This probe covers that gap.
//
// What it does: checks free space on the volume holding the database file
// against a floor, then writes and fsyncs one small fixed-name file in the
// same directory (overwritten each time, so nothing accumulates).
//
// What it does NOT prove: that the DATABASE accepts writes. Neotoma has no
// table a probe can write without adding history, touching user data, or a
// schema migration, so the probe writes a file on the same volume instead. A
// passing result proves the volume has room above the floor and accepts a
// synced write; it does not prove SQLite can take its write lock, that the
// database file is writable, or that a store request will commit.
//
// Every request to these routes is unauthenticated, so results are cached for
// a short interval and concurrent requests share one in-flight probe: request
// volume cannot turn into write volume.
// ============================================================================

export type StorageWriteStatus = "ok" | "failed" | "skipped";

/**
 * Short fixed reason codes. These are the only failure detail that reaches an
 * HTTP response; paths, sizes and raw error text go to the log only.
 */
export type StorageWriteReason =
  | "below_free_space_floor"
  | "free_space_check_failed"
  | "write_failed"
  | "write_timeout"
  | "disabled";

export interface StorageWriteResult {
  status: StorageWriteStatus;
  /** Present when status is not "ok". */
  reason?: StorageWriteReason;
}

/** File-system operations the probe needs; injectable for tests. */
export interface StorageWriteProbeFs {
  /** Available bytes for an unprivileged writer on the volume holding `dir`. */
  freeBytes(dir: string): Promise<number>;
  /** Write `data` to `filePath`, replacing any previous content, and fsync it. */
  writeAndSync(filePath: string, data: string): Promise<void>;
}

export const DEFAULT_READY_WRITE_CACHE_MS = 30_000;
export const DEFAULT_READY_WRITE_TIMEOUT_MS = 5_000;
/** 64 MiB: far below a healthy small volume, far above "the next write fails". */
export const DEFAULT_READY_MIN_FREE_MB = 64;
export const STORAGE_WRITE_PROBE_FILE_NAME = ".neotoma_ready_write_probe";

export interface StorageWriteProbeConfig {
  enabled: boolean;
  cacheMs: number;
  timeoutMs: number;
  minFreeBytes: number;
  /** When true, a failed storage write also fails GET /ready. */
  requireForReady: boolean;
}

function parsePositiveInt(raw: string | undefined): number | null {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isTruthyFlag(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isFalsyFlag(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

export function resolveStorageWriteProbeConfig(
  env: NodeJS.ProcessEnv = runtimeEnv()
): StorageWriteProbeConfig {
  const minFreeMbRaw = (env.NEOTOMA_READY_MIN_FREE_MB ?? "").trim();
  const minFreeMb = minFreeMbRaw === "0" ? 0 : parsePositiveInt(minFreeMbRaw);
  return {
    enabled: !isFalsyFlag(env.NEOTOMA_READY_WRITE_PROBE),
    // Floors keep a misconfigured value from turning the probe into a write
    // loop (cache) or a flapping check against a healthy disk (timeout).
    cacheMs: Math.max(
      1_000,
      parsePositiveInt(env.NEOTOMA_READY_WRITE_CACHE_MS) ?? DEFAULT_READY_WRITE_CACHE_MS
    ),
    timeoutMs: Math.max(
      500,
      parsePositiveInt(env.NEOTOMA_READY_WRITE_TIMEOUT_MS) ?? DEFAULT_READY_WRITE_TIMEOUT_MS
    ),
    minFreeBytes: (minFreeMb ?? DEFAULT_READY_MIN_FREE_MB) * 1024 * 1024,
    requireForReady: isTruthyFlag(env.NEOTOMA_READY_REQUIRE_WRITE),
  };
}

export const nodeStorageWriteProbeFs: StorageWriteProbeFs = {
  async freeBytes(dir: string): Promise<number> {
    const { statfs } = await import("node:fs/promises");
    const stats = await statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  },
  async writeAndSync(filePath: string, data: string): Promise<void> {
    const { open } = await import("node:fs/promises");
    const handle = await open(filePath, "w");
    try {
      await handle.writeFile(data, "utf-8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

export interface StorageWriteProbeOptions {
  /** Directory on the volume that holds the database file. */
  dir: string;
  config?: StorageWriteProbeConfig;
  fs?: StorageWriteProbeFs;
  now?: () => number;
  /** Receives full failure detail. Never reaches a response. */
  log?: (message: string) => void;
}

export interface StorageWriteProbe {
  /** Never rejects. Cached for `cacheMs`; concurrent callers share one probe. */
  check(): Promise<StorageWriteResult>;
  readonly config: StorageWriteProbeConfig;
}

export function createStorageWriteProbe(options: StorageWriteProbeOptions): StorageWriteProbe {
  const config = options.config ?? resolveStorageWriteProbeConfig();
  const fsOps = options.fs ?? nodeStorageWriteProbeFs;
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const dir = options.dir;
  const filePath = `${dir.replace(/[\\/]+$/, "")}/${STORAGE_WRITE_PROBE_FILE_NAME}`;

  let cached: { result: StorageWriteResult; at: number } | null = null;
  let inFlight: Promise<StorageWriteResult> | null = null;
  // The underlying fs work of the last probe. When a probe times out this can
  // still be pending; a new probe must not stack another write on a hung disk.
  let pendingIo: Promise<unknown> | null = null;

  async function runOnce(): Promise<StorageWriteResult> {
    if (pendingIo) {
      log("[Ready] storage write probe: previous write still pending; reporting timeout");
      return { status: "failed", reason: "write_timeout" };
    }

    let stage: "free_space" | "write" = "free_space";
    const io = (async (): Promise<StorageWriteResult> => {
      let free: number;
      try {
        free = await fsOps.freeBytes(dir);
      } catch (error) {
        log(`[Ready] storage free-space check failed: ${errorText(error)}`);
        return { status: "failed", reason: "free_space_check_failed" };
      }
      if (!Number.isFinite(free) || free < config.minFreeBytes) {
        log(
          `[Ready] storage free space ${free} bytes is below the floor of ${config.minFreeBytes} bytes`
        );
        return { status: "failed", reason: "below_free_space_floor" };
      }
      stage = "write";
      try {
        await fsOps.writeAndSync(filePath, `${now()}\n`);
      } catch (error) {
        log(`[Ready] storage write probe failed: ${errorText(error)}`);
        return { status: "failed", reason: "write_failed" };
      }
      return { status: "ok" };
    })();

    pendingIo = io;
    void io
      .catch(() => undefined)
      .finally(() => {
        if (pendingIo === io) pendingIo = null;
      });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<StorageWriteResult>((resolve) => {
      timer = setTimeout(() => {
        log(`[Ready] storage probe exceeded ${config.timeoutMs}ms during ${stage}`);
        resolve({ status: "failed", reason: "write_timeout" });
      }, config.timeoutMs);
    });
    try {
      return await Promise.race([io, deadline]);
    } catch (error) {
      // `io` catches its own errors; this is a guard, not an expected path.
      log(`[Ready] storage probe raised: ${errorText(error)}`);
      return { status: "failed", reason: "write_failed" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    config,
    check(): Promise<StorageWriteResult> {
      if (!config.enabled) return Promise.resolve({ status: "skipped", reason: "disabled" });
      if (cached && now() - cached.at < config.cacheMs) return Promise.resolve(cached.result);
      if (inFlight) return inFlight;
      inFlight = runOnce()
        .catch((error): StorageWriteResult => {
          log(`[Ready] storage probe raised: ${errorText(error)}`);
          return { status: "failed", reason: "write_failed" };
        })
        .then((result) => {
          cached = { result, at: now() };
          return result;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ReadyResponse {
  status: 200 | 503;
  body: ReadinessResult & {
    checks: ReadinessResult["checks"] & { storage_write: StorageWriteStatus };
    storage_write_reason?: StorageWriteReason;
  };
}

/**
 * Combines the read probe and the storage write probe into the GET /ready
 * response. The status code follows the read probe only, unless
 * `requireForReady` is set: on a single-machine instance a failing traffic
 * check removes the machine, which would also stop the reads that still work.
 */
export function buildReadyResponse(
  read: ReadinessResult,
  write: StorageWriteResult,
  requireForReady: boolean
): ReadyResponse {
  const writeFailed = write.status === "failed";
  const ok = read.ok && !(requireForReady && writeFailed);
  return {
    status: ok ? 200 : 503,
    body: {
      ...read,
      ok,
      checks: { ...read.checks, storage_write: write.status },
      ...(write.reason ? { storage_write_reason: write.reason } : {}),
    },
  };
}

export interface StorageReadyResponse {
  status: 200 | 503;
  body: {
    ok: boolean;
    checks: { storage_write: StorageWriteStatus };
    reason?: StorageWriteReason;
  };
}

/** GET /ready/storage: 503 when the write or the free-space floor fails. */
export function buildStorageReadyResponse(write: StorageWriteResult): StorageReadyResponse {
  const ok = write.status !== "failed";
  return {
    status: ok ? 200 : 503,
    body: {
      ok,
      checks: { storage_write: write.status },
      ...(write.reason ? { reason: write.reason } : {}),
    },
  };
}
