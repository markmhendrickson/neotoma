/**
 * Worker-hosted file database (concurrent-backend plan).
 *
 * Why this exists: every Node binding for LOCAL SQLite/libSQL files executes
 * statements synchronously on the calling thread — better-sqlite3, node:sqlite,
 * and both APIs of the `libsql` package (its promise API and @libsql/client's
 * `file:` protocol return pre-resolved promises after blocking). Verified
 * empirically 2026-07-16: a 1s self-join blocked the event loop for the full
 * second under every local variant. Only remote sqld URLs are genuinely async.
 *
 * So for local files, "statements off the event loop" is delivered by hosting
 * the synchronous driver in worker threads behind the same async DbDatabase
 * contract:
 *
 *   - One WRITER worker owns all mutating statements, exec/pragma, and
 *     transactions (SQLite has a single writer anyway).
 *   - A small pool of READER workers opens the file read-only; under WAL,
 *     readers run concurrently with the writer, so a slow read no longer
 *     delays other reads — the bottega8 symptom (one deep-offset query
 *     freezing every concurrent request) is fixed at the root.
 *   - A read routed to a reader that turns out to write (e.g. INSERT …
 *     RETURNING via .get()) fails with SQLITE_READONLY and is retried on the
 *     writer — no SQL parsing heuristics.
 *
 * Two properties bound how long that pool can be tied up (issue #2217):
 *
 *   - BUSY-AWARE DISPATCH. Reads go to the *least loaded* reader, not to the
 *     next one round-robin. Blind round-robin deals work onto an occupied
 *     worker even when siblings are idle, and since each worker runs
 *     statements synchronously and strictly FIFO, that query waits behind the
 *     slow one — measured at 271 ms for a trivial `SELECT 1` with seven idle
 *     workers available. Raising the pool size does not help; only choosing
 *     an idle worker does.
 *   - STATEMENT TIMEOUT. The synchronous driver cannot be interrupted
 *     mid-statement: the worker only reads its next message after the current
 *     one runs to completion, so no cancel opcode can be observed in time.
 *     The only real lever is `terminate()`. So a request that exceeds
 *     `statementTimeoutMs` (or whose caller aborts) terminates its worker and
 *     rejects with WorkerDbTimeoutError / WorkerDbAbortError; the next request
 *     lazily respawns. Readers are read-only, so tearing one down loses no
 *     committed state. The writer is exempt by default (killing it mid
 *     transaction would leave the caller unable to know whether work
 *     committed), and requests inside a transaction are never timed out.
 *
 * Transaction semantics match the other backends: the TransactionGate
 * serializes transactions and keeps unrelated statements out of the open
 * transaction window, and AsyncLocalStorage routes statements issued on the
 * database handle from inside the callback into the transaction (they all
 * land on the writer worker, whose statements execute in message order).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { logger } from "../../utils/logger.js";
import {
  NESTED_TRANSACTION_ERROR,
  normalizeParams,
  TransactionGate,
  type DbConnection,
  type DbDatabase,
  type DbRunResult,
  type DbStatement,
} from "../db/driver.js";

const nodeRequire = createRequire(import.meta.url);

/**
 * Resolve the synchronous driver module the worker will load. Preference:
 * `libsql` (libSQL's better-sqlite3-compatible binding — reads/writes the
 * same files and understands libSQL extensions), then `better-sqlite3`.
 * `node:sqlite` (Node 22+) is the final fallback, flagged rather than
 * path-resolved.
 */
function resolveWorkerDriver(): { driverPath: string | null; useNodeSqlite: boolean } {
  for (const name of ["libsql", "better-sqlite3"]) {
    try {
      return { driverPath: nodeRequire.resolve(name), useNodeSqlite: false };
    } catch {
      // try next
    }
  }
  return { driverPath: null, useNodeSqlite: true };
}

/**
 * CommonJS source executed with `eval: true` — avoids build/dist asset
 * plumbing for a separate worker file. Kept dependency-free apart from the
 * driver module whose absolute path the parent resolves and passes in.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");

let DatabaseCtor;
if (workerData.useNodeSqlite) {
  DatabaseCtor = require("node:sqlite").DatabaseSync;
} else {
  DatabaseCtor = require(workerData.driverPath);
}

const openOptions = workerData.readonly ? { readonly: true } : {};
const db = new DatabaseCtor(workerData.dbPath, openOptions);

function pragma(command) {
  if (typeof db.pragma === "function") {
    return db.pragma(command);
  }
  db.exec("PRAGMA " + command);
  return [];
}

pragma("busy_timeout = " + workerData.busyTimeoutMs);
pragma("foreign_keys = ON");
if (!workerData.readonly) {
  pragma("journal_mode = WAL");
}

// The libsql driver stamps a non-column "_metadata" object onto each row;
// strip it so rows match better-sqlite3's plain shape (spread/JSON parity).
const stripMetadata = workerData.stripRowMetadata
  ? (row) => {
      if (row && typeof row === "object" && "_metadata" in row) delete row._metadata;
      return row;
    }
  : (row) => row;

parentPort.on("message", (msg) => {
  try {
    let result;
    if (msg.sql === "__crash__") {
      // Test-only hook: simulate a hard worker crash so supervised-restart is
      // exercisable. Never issued by production code paths.
      process.exit(1);
    } else if (msg.op === "run") {
      const r = db.prepare(msg.sql).run(...msg.params);
      result = { changes: Number(r.changes ?? 0), lastInsertRowid: r.lastInsertRowid };
    } else if (msg.op === "get") {
      result = stripMetadata(db.prepare(msg.sql).get(...msg.params));
    } else if (msg.op === "all") {
      result = db.prepare(msg.sql).all(...msg.params).map(stripMetadata);
    } else if (msg.op === "exec") {
      db.exec(msg.sql);
      result = undefined;
    } else if (msg.op === "pragma") {
      result = pragma(msg.sql);
    } else {
      throw new Error("unknown op: " + msg.op);
    }
    parentPort.postMessage({ id: msg.id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      error: {
        message: (error && error.message) || String(error),
        code: error && error.code,
        errno: error && error.errno,
      },
    });
  }
});
`;

type WorkerReply = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: { message: string; code?: string; errno?: number };
};

/**
 * Thrown when a worker dies (crash or unexpected `exit`) with requests still in
 * flight. The requests that were mid-execution reject with this — the caller
 * can't know whether a mutating statement committed, so it is surfaced rather
 * than silently retried. The connection self-heals: the next request spawns a
 * fresh worker.
 */
export class WorkerDbCrashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerDbCrashError";
  }
}

/**
 * Thrown when a statement exceeds the per-statement timeout. The worker
 * hosting it is terminated (the synchronous driver offers no other way to stop
 * a running statement) so the pool slot is reclaimed immediately rather than
 * held for the query's full natural duration — the #2217 failure, where two
 * long reads made every subsequent read queue behind them indefinitely.
 *
 * Only ever raised for reads on the read-only reader pool, so no committed
 * state is at risk: the caller knows nothing was written.
 */
export class WorkerDbTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number
  ) {
    super(message);
    this.name = "WorkerDbTimeoutError";
  }
}

/**
 * Thrown when the caller's AbortSignal fires while a statement is in flight —
 * e.g. the HTTP client hung up. Same mechanism as the timeout: the reader is
 * terminated so abandoned work stops consuming a pool slot instead of running
 * to completion for a response nobody will read.
 */
export class WorkerDbAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerDbAbortError";
  }
}

type PendingEntry = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  /** Release the timeout timer and abort listener; idempotent. */
  cleanup: () => void;
};

/** Options accepted per request; both bound how long a worker may be held. */
export type WorkerRequestOptions = {
  /** Terminate the worker and reject if the statement outlives this. */
  timeoutMs?: number;
  /** Terminate the worker and reject when the caller gives up. */
  signal?: AbortSignal;
};

class WorkerConnection {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingEntry>();
  private closed = false;
  /** `Date.now()` when this worker last went from idle to busy; 0 while idle. */
  private busyStartedAt = 0;

  constructor(
    private readonly options: {
      dbPath: string;
      readonly: boolean;
      busyTimeoutMs: number;
      driverPath: string | null;
      useNodeSqlite: boolean;
      stripRowMetadata: boolean;
    }
  ) {}

  /**
   * How many statements this worker currently owns. The worker executes them
   * strictly FIFO and synchronously, so this is queue depth, not parallelism —
   * which is exactly what busy-aware dispatch needs to compare.
   */
  get inFlight(): number {
    return this.pending.size;
  }

  /**
   * When the current busy stretch began, as a `Date.now()` timestamp; 0 while
   * idle. Dispatch uses it to break depth ties: at saturation every reader
   * usually holds one statement, and the one that has been busy longest is the
   * one most likely to stay busy.
   */
  get busySince(): number {
    return this.busyStartedAt;
  }

  /**
   * Spawn (or respawn) the worker and wire its lifecycle. Lazy: a crashed
   * worker is only recreated when the next request arrives, so a permanently
   * failing DB doesn't spin in a respawn loop while idle.
   */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: this.options });
    worker.on("message", (reply: WorkerReply) => {
      const entry = this.pending.get(reply.id);
      if (!entry) return;
      this.pending.delete(reply.id);
      entry.cleanup();
      if (this.pending.size === 0) {
        this.busyStartedAt = 0;
        worker.unref();
      }
      if (reply.ok) {
        entry.resolve(reply.result);
      } else {
        const error = new Error(reply.error?.message ?? "worker db error") as Error & {
          code?: string;
          errno?: number;
        };
        if (reply.error?.code !== undefined) error.code = reply.error.code;
        if (reply.error?.errno !== undefined) error.errno = reply.error.errno;
        entry.reject(error);
      }
    });
    worker.on("error", (error) => {
      this.failInFlight(error instanceof Error ? error : new Error(String(error)));
    });
    // A crashed or self-exited worker fires `exit` with a non-zero code. Without
    // this handler, `postMessage` after a crash would enqueue a request that
    // never settles — a permanent hang. Reject everything in flight and drop the
    // handle so the next request respawns.
    worker.on("exit", (code) => {
      if (this.worker !== worker) return; // already replaced (normal terminate)
      if (code !== 0 && !this.closed) {
        this.failInFlight(new WorkerDbCrashError(`DB worker exited unexpectedly (code ${code})`));
      }
      this.worker = null;
    });
    worker.unref();
    this.worker = worker;
    return worker;
  }

  /** Reject all in-flight requests and drop the dead worker handle. */
  private failInFlight(error: Error): void {
    // Snapshot first: reject() runs caller continuations that may re-enter
    // request() and repopulate the map while we are still iterating it.
    const entries = [...this.pending.values()];
    this.pending.clear();
    this.busyStartedAt = 0;
    this.worker = null;
    for (const entry of entries) {
      entry.cleanup();
      entry.reject(error);
    }
  }

  /**
   * Kill the worker hosting a request that overran its budget, and reject
   * everything it was executing.
   *
   * Terminating is the only lever available: the worker runs each statement
   * synchronously to completion before it reads its next message, so a cancel
   * opcode could not be observed until the statement it was meant to cancel
   * had already finished. `failInFlight` runs FIRST so the victim's siblings
   * reject with the same reason rather than a later confusing crash error, and
   * so `this.worker` is cleared before `terminate()` fires the `exit` handler.
   */
  private abandon(error: Error): void {
    const worker = this.worker;
    this.failInFlight(error);
    if (worker) void worker.terminate().catch(() => {});
  }

  request(
    op: "run" | "get" | "all" | "exec" | "pragma",
    sql: string,
    params: unknown[] = [],
    options: WorkerRequestOptions = {}
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new WorkerDbCrashError("DB connection is closed"));
    }
    const { timeoutMs, signal } = options;
    if (signal?.aborted) {
      return Promise.reject(new WorkerDbAbortError("DB request aborted before dispatch"));
    }
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const cleanup = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (onAbort) {
          signal?.removeEventListener("abort", onAbort);
          onAbort = undefined;
        }
      };

      if (this.pending.size === 0) this.busyStartedAt = Date.now();
      this.pending.set(id, { resolve, reject, cleanup });

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.abandon(
            new WorkerDbTimeoutError(
              `DB statement exceeded ${timeoutMs}ms and its worker was terminated to reclaim the pool slot`,
              timeoutMs
            )
          );
        }, timeoutMs);
        // Do not let a pending timeout keep the process alive on its own.
        timer.unref?.();
      }

      if (signal) {
        onAbort = () => {
          this.abandon(new WorkerDbAbortError("DB request aborted by caller"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      // Hold the process open while a request is in flight.
      worker.ref();
      worker.postMessage({ id, op, sql, params });
    });
  }

  async terminate(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    for (const entry of this.pending.values()) entry.cleanup();
    if (worker) await worker.terminate();
  }
}

/**
 * How long a reader must have been busy before dispatch treats it as running
 * something long, and prefers a deeper-queued but recently-started reader over
 * it.
 *
 * Sized against the two populations this pool actually sees. A healthy read is
 * about 1 ms (#2267 measured a 40k-row count at ~1 ms); the reads that caused
 * the outage ran for seconds. 20 ms sits an order of magnitude above the first
 * and two below the second, so it separates them without needing to know
 * either precisely — and a statement genuinely near the boundary costs little
 * either way, since queueing behind a 20 ms statement is not the failure being
 * prevented.
 *
 * The threshold exists because depth is the wrong primary key when statement
 * costs differ by three orders of magnitude: a reader holding ONE multi-second
 * cross join outranks a reader holding TWO 1 ms statements on depth, so
 * depth-first ordering keeps dealing reads behind the cross join — the
 * original bug wearing a different hat.
 */
const LONG_RUNNING_READER_MS = 20;

/** How long `a` has been busy, or 0 if idle. */
function busyForMs(connection: WorkerConnection, now: number): number {
  return connection.busySince > 0 ? now - connection.busySince : 0;
}

/**
 * Order two busy readers by how attractive they are to queue behind.
 *
 * 1. A reader busy for less than {@link LONG_RUNNING_READER_MS} beats one busy
 *    for longer, whatever their depths. This is what keeps traffic off a
 *    reader stuck on a runaway query — the measured failure.
 * 2. Both long-running: prefer the one that started more recently; it has less
 *    elapsed work behind it and is likelier to finish first.
 * 3. Both short-running: prefer the shallower queue, then the more recent
 *    start. At saturation every reader typically holds exactly one statement,
 *    so depth ties constantly, and breaking that tie by array order or a
 *    round-robin cursor is what put a query onto the busy worker while seven
 *    siblings sat idle.
 */
function compareReaderLoad(a: WorkerConnection, b: WorkerConnection): number {
  const now = Date.now();
  const aLong = busyForMs(a, now) >= LONG_RUNNING_READER_MS;
  const bLong = busyForMs(b, now) >= LONG_RUNNING_READER_MS;
  if (aLong !== bLong) return aLong ? 1 : -1;
  if (!aLong && a.inFlight !== b.inFlight) return a.inFlight - b.inFlight;
  // Larger busySince == started later == likely to finish sooner.
  return b.busySince - a.busySince;
}

function isReadonlyRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  const code = (e.code || "").toUpperCase();
  const message = (e.message || "").toLowerCase();
  return code.startsWith("SQLITE_READONLY") || message.includes("readonly database");
}

/** SQLite binds numbers, strings, bigints, buffers, and null; map the rest. */
function toBindValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class WorkerStatement implements DbStatement {
  constructor(
    private readonly db: WorkerFileDatabase,
    private readonly sql: string
  ) {}

  async run(...params: unknown[]): Promise<DbRunResult> {
    const bound = normalizeParams(params).map(toBindValue);
    const result = (await this.db.routeWrite("run", this.sql, bound)) as {
      changes: number;
      lastInsertRowid?: number | bigint;
    };
    return result;
  }

  get(...params: unknown[]): Promise<unknown> {
    const bound = normalizeParams(params).map(toBindValue);
    return this.db.routeRead("get", this.sql, bound);
  }

  all(...params: unknown[]): Promise<unknown[]> {
    const bound = normalizeParams(params).map(toBindValue);
    return this.db.routeRead("all", this.sql, bound) as Promise<unknown[]>;
  }
}

/**
 * Default per-statement budget for reads on the reader pool. Generous relative
 * to any healthy query (#2267 put a 40k-row count at ~1 ms) — this is a
 * runaway-query backstop, not a latency SLO. `NEOTOMA_DB_STATEMENT_TIMEOUT_MS`
 * overrides it; `0` disables the timeout entirely.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/** Rate limit for the pool-saturation warning, so a long stall logs once a second. */
const SATURATION_LOG_INTERVAL_MS = 1_000;

function readEnvInt(name: string): number | undefined {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Ambient abort signal for the current request, so an aborted HTTP request
 * stops consuming a reader without every call site having to thread a signal
 * through. Set by `withDbAbortSignal` at the request boundary.
 */
const abortContext = new AsyncLocalStorage<AbortSignal>();

/**
 * Run `fn` with `signal` attached to every read issued inside it. When the
 * signal fires — an HTTP client hanging up, a cancelled MCP call — reads in
 * flight are abandoned and their reader worker reclaimed, instead of running
 * to completion for a response nobody will read (#2217, suggested fix 3).
 */
export function withDbAbortSignal<T>(signal: AbortSignal | undefined, fn: () => T): T {
  if (!signal) return fn();
  return abortContext.run(signal, fn);
}

export class WorkerFileDatabase implements DbDatabase {
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private readonly readerCount: number;
  private readonly driver = resolveWorkerDriver();
  private readonly statementTimeoutMs: number;
  private writer: WorkerConnection | null = null;
  private readers: WorkerConnection[] = [];
  private closed = false;
  private saturatedSince: number | null = null;
  private lastSaturationLogAt = 0;
  private readonly gate = new TransactionGate();
  private readonly txContext = new AsyncLocalStorage<boolean>();

  constructor(
    dbPath: string,
    options: {
      busyTimeoutMs?: number;
      readerWorkers?: number;
      /** Per-statement budget for pool reads; `0` disables the timeout. */
      statementTimeoutMs?: number;
    } = {}
  ) {
    this.dbPath = dbPath;
    this.busyTimeoutMs = options.busyTimeoutMs ?? 5000;
    this.readerCount = Math.max(
      0,
      options.readerWorkers ?? readEnvInt("NEOTOMA_DB_READER_WORKERS") ?? 2
    );
    this.statementTimeoutMs = Math.max(
      0,
      options.statementTimeoutMs ??
        readEnvInt("NEOTOMA_DB_STATEMENT_TIMEOUT_MS") ??
        DEFAULT_STATEMENT_TIMEOUT_MS
    );
    // The writer opens eagerly so the DB file exists before any read-only
    // reader connects (read-only opens fail on a missing file).
    this.writerConnection();
  }

  private stripRowMetadata(): boolean {
    return this.driver.driverPath !== null && /[\\/]libsql[\\/]/.test(this.driver.driverPath);
  }

  private writerConnection(): WorkerConnection {
    if (this.closed) {
      throw new WorkerDbCrashError("DB connection is closed");
    }
    if (!this.writer) {
      this.writer = new WorkerConnection({
        dbPath: this.dbPath,
        readonly: false,
        busyTimeoutMs: this.busyTimeoutMs,
        driverPath: this.driver.driverPath,
        useNodeSqlite: this.driver.useNodeSqlite,
        stripRowMetadata: this.stripRowMetadata(),
      });
    }
    return this.writer;
  }

  private spawnReader(): WorkerConnection {
    const reader = new WorkerConnection({
      dbPath: this.dbPath,
      readonly: true,
      busyTimeoutMs: this.busyTimeoutMs,
      driverPath: this.driver.driverPath,
      useNodeSqlite: this.driver.useNodeSqlite,
      stripRowMetadata: this.stripRowMetadata(),
    });
    this.readers.push(reader);
    return reader;
  }

  /**
   * Pick the reader to serve the next read.
   *
   * Busy-aware, not round-robin. Each worker runs statements synchronously and
   * strictly FIFO, so a query handed to an occupied worker waits out whatever
   * that worker is already doing — even with idle siblings sitting right there.
   * Blind round-robin did exactly that, and it is why raising the pool size
   * fixed nothing in the measurements on #2217: more slots, still dealt onto a
   * busy one. So: prefer any idle reader; if none is idle and the pool is not
   * yet at its cap, grow it; only when every reader is loaded does the read
   * queue, and then behind the reader expected to free up soonest.
   *
   * Queue DEPTH is not that predictor. When the pool saturates, every reader
   * typically holds exactly one statement, so depth ties across the pool — and
   * a tie broken by array order sends the read to whichever reader happens to
   * sit at index 0, which in the measured repro is the one running the
   * multi-second cross join. Depth counts statements; it cannot tell a
   * 1 ms statement from a 30 s one. So ties break on how long the reader has
   * been busy: the shallowest queue wins, and among equals the one that
   * started most RECENTLY, since a reader that has already been working for
   * seconds is the one likeliest to keep working for seconds.
   */
  private readerConnection(): WorkerConnection {
    if (this.closed) {
      throw new WorkerDbCrashError("DB connection is closed");
    }
    if (this.readerCount === 0) return this.writerConnection();

    let best: WorkerConnection | null = null;
    for (const reader of this.readers) {
      if (reader.inFlight === 0) {
        this.noteSaturation(false);
        return reader;
      }
      if (best === null || compareReaderLoad(reader, best) < 0) best = reader;
    }

    // Nothing idle. Growing to the cap is preferable to queueing.
    if (this.readers.length < this.readerCount) {
      this.noteSaturation(false);
      return this.spawnReader();
    }

    this.noteSaturation(true);
    // `best` is non-null here: readerCount > 0 and the pool is at its cap.
    return best as WorkerConnection;
  }

  /**
   * Log when every reader is busy, and again when the pool recovers.
   *
   * Saturation is otherwise invisible from outside the process — `/health`
   * answers from process state without touching a reader, so a wedged instance
   * and an idle one look identical (#2141, and again here). Rate-limited so a
   * sustained stall does not flood the log.
   */
  private noteSaturation(saturated: boolean): void {
    const now = Date.now();
    if (saturated) {
      if (this.saturatedSince === null) {
        this.saturatedSince = now;
        this.lastSaturationLogAt = 0;
      }
      if (now - this.lastSaturationLogAt < SATURATION_LOG_INTERVAL_MS) return;
      this.lastSaturationLogAt = now;
      const depth = this.readers.reduce((sum, r) => sum + r.inFlight, 0);
      logger.warn(
        `DB reader pool saturated: all ${this.readers.length} readers busy ` +
          `(${depth} statements queued, ${now - this.saturatedSince}ms). ` +
          `Raise NEOTOMA_DB_READER_WORKERS if this is sustained.`
      );
      return;
    }
    if (this.saturatedSince !== null) {
      const heldMs = now - this.saturatedSince;
      this.saturatedSince = null;
      this.lastSaturationLogAt = 0;
      if (heldMs >= SATURATION_LOG_INTERVAL_MS) {
        logger.info(`DB reader pool recovered after ${heldMs}ms of saturation`);
      }
    }
  }

  /** @internal Mutating ops and everything inside a transaction → writer. */
  async routeWrite(
    op: "run" | "exec" | "pragma",
    sql: string,
    params: unknown[] = []
  ): Promise<unknown> {
    if (!this.txContext.getStore()) await this.gate.whenIdle();
    return this.writerConnection().request(op, sql, params);
  }

  /**
   * @internal Reads route to the reader pool; a read that turns out to write
   * (INSERT/UPDATE … RETURNING via get/all) is rejected read-only by SQLite
   * and retried on the writer. Inside a transaction, reads must see the
   * transaction's uncommitted state, so they go to the writer directly.
   */
  async routeRead(op: "get" | "all", sql: string, params: unknown[]): Promise<unknown> {
    if (this.txContext.getStore()) {
      // Inside a transaction the statement runs on the writer, which is never
      // timed out or abandoned: terminating it mid-transaction would leave the
      // caller unable to tell whether anything committed.
      return this.writerConnection().request(op, sql, params);
    }
    await this.gate.whenIdle();
    const options: WorkerRequestOptions = {
      timeoutMs: this.statementTimeoutMs,
      signal: abortContext.getStore(),
    };
    try {
      return await this.readerConnection().request(op, sql, params, options);
    } catch (error) {
      if (isReadonlyRejection(error)) {
        // The read mutates, so it belongs on the writer. Re-run it there
        // untimed for the reason above — a half-applied write is worse than a
        // slow one.
        return this.writerConnection().request(op, sql, params);
      }
      throw error;
    }
  }

  /**
   * @internal Reader-pool occupancy, for tests and diagnostics. `busy` counts
   * readers with at least one statement in flight; `queued` is total depth.
   */
  readerPoolStats(): { size: number; capacity: number; busy: number; queued: number } {
    let busy = 0;
    let queued = 0;
    for (const reader of this.readers) {
      if (reader.inFlight > 0) busy += 1;
      queued += reader.inFlight;
    }
    return { size: this.readers.length, capacity: this.readerCount, busy, queued };
  }

  /**
   * @internal Test-only: force the writer or a reader worker to crash, to
   * exercise the supervised-restart path. Returns the promise that rejects with
   * the crash error. Never called by production code.
   */
  __crashWorkerForTest(which: "writer" | "reader"): Promise<unknown> {
    const conn = which === "writer" ? this.writerConnection() : this.readerConnection();
    return conn.request("run", "__crash__", []);
  }

  prepare(sql: string): DbStatement {
    return new WorkerStatement(this, sql);
  }

  async exec(sql: string): Promise<void> {
    await this.routeWrite("exec", sql);
  }

  async pragma(command: string): Promise<unknown[]> {
    return (await this.routeWrite("pragma", command)) as unknown[];
  }

  transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    // Fail loud on nested transaction() — see NESTED_TRANSACTION_ERROR; a
    // gate-serialized nested call self-deadlocks (qa review, PR #1944).
    if (this.txContext.getStore()) throw new Error(NESTED_TRANSACTION_ERROR);
    return this.gate.runExclusive(() =>
      this.txContext.run(true, async () => {
        // IMMEDIATE for the same reason as the sqlite backend: acquire the
        // write lock where busy_timeout applies instead of failing on a
        // mid-transaction lock upgrade.
        await this.writerConnection().request("exec", "BEGIN IMMEDIATE");
        try {
          const result = await fn(this);
          await this.writerConnection().request("exec", "COMMIT");
          return result;
        } catch (error) {
          try {
            await this.writerConnection().request("exec", "ROLLBACK");
          } catch {
            // Ignore rollback errors during unwind.
          }
          throw error;
        }
      })
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    const connections = [this.writer, ...this.readers].filter(
      (c): c is WorkerConnection => c !== null
    );
    this.writer = null;
    this.readers = [];
    await Promise.all(connections.map((c) => c.terminate()));
  }
}
