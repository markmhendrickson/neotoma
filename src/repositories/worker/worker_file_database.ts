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
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
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

// Shared execution custody survives cached database-handle replacement. Only
// actual Worker exit releases this hold; ordinary routing does not consult it.
const retiringReaderWorkers = new Set<Worker>();

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

// Ids the parent has given up on (timeout / abort), shared so the flag is
// visible while this thread is busy inside a native call. A statement that is
// still QUEUED when its id is flagged is skipped instead of run: it can no
// longer be delivered to anyone, and running it would only keep the worker
// (and the pool slot behind it) busy for nothing.
const cancelled = workerData.cancelled ? new Int32Array(workerData.cancelled) : null;

parentPort.on("message", (msg) => {
  try {
    let result;
    if (
      cancelled !== null &&
      msg.op !== "__drained__" &&
      Atomics.load(cancelled, msg.id % cancelled.length) === msg.id
    ) {
      parentPort.postMessage({ id: msg.id, ok: false, error: { message: "cancelled before start" } });
      return;
    }
    if (msg.op === "__drained__") {
      // Sent by the parent AFTER it retires this worker (#2324). Because the
      // worker processes messages strictly FIFO and runs each statement to
      // completion, this one cannot be handled until every statement queued
      // ahead of it has finished. Answering it is therefore the worker's own
      // proof that it holds no native frame and has nothing left to start —
      // the only moment at which terminating it cannot abort the process.
      //
      // The parent cannot infer this from an ordinary reply: a reply is posted
      // and the worker then IMMEDIATELY picks up the next queued message, so a
      // terminate racing that lands inside the next statement's native call.
      // That is exactly the failure this message exists to remove.
      parentPort.postMessage({ id: msg.id, ok: true, drained: true });
      return;
    }
    if (msg.sql === "__crash__") {
      // Test-only hook: simulate a hard worker crash so supervised-restart is
      // exercisable. Never issued by production code paths.
      process.exit(1);
    } else if (msg.sql === "__hold_for_test__") {
      // Deterministic test-only lifetime barrier; no production path issues it.
      if (process.env.NODE_ENV !== "test") throw new Error("Worker test barrier unavailable");
      const flags = new Int32Array(msg.params[0]);
      Atomics.store(flags, 0, 1);
      Atomics.notify(flags, 0);
      Atomics.wait(flags, 1, 0);
      result = { held: true };
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
 * Thrown when a statement exceeds the per-statement timeout. The caller is
 * released immediately and the worker hosting the statement is retired and
 * replaced, so the pool slot is reclaimed rather than held for the query's
 * full natural duration — the #2217 failure, where two long reads made every
 * subsequent read queue behind them indefinitely. The worker is NEVER
 * terminated while it may be inside a native call (that aborts the process,
 * #2324); it drains and is then terminated. At the retirement cap the worker
 * stays in the pool instead (see `canRetire`).
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
 * e.g. the HTTP client hung up. Same mechanism as the timeout: the caller is
 * released and the reader retired, so abandoned work stops holding a pool slot
 * for a response nobody will read (the worker drains before it is terminated).
 */
export class WorkerDbAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerDbAbortError";
  }
}

/**
 * Internal signal that a connection was retired between being chosen from the
 * pool and being dispatched to (#2324). Never reaches a caller: `routeRead`
 * catches it and re-dispatches to a live reader. It exists as its own type so
 * that retry is triggered by this one narrow race and not by an abort, which
 * must still propagate — retrying an aborted read would defeat the abort.
 */
class WorkerDbRetiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerDbRetiredError";
  }
}

type PendingEntry = {
  /** Statement text, kept only so saturation logs can say what is queued. */
  sql: string;
  /** `Date.now()` when the request was handed to this worker's queue. */
  enqueuedAt: number;
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
  private liveWorkers = new Map<Worker, Promise<void>>();
  private exactReadCustody = false;
  private exactWorkers = new Set<Worker>();
  private workerGeneration = 0;
  private nextId = 1;
  /** Slot per id (mod length) holding the id of a statement abandoned by its caller. */
  private readonly cancelled = new Int32Array(new SharedArrayBuffer(4 * 1024));
  private pending = new Map<number, PendingEntry>();
  private closed = false;
  /** `Date.now()` when this worker last went from idle to busy; 0 while idle. */
  private busyStartedAt = 0;
  /**
   * Set once this connection has been abandoned (#2324). A retired connection
   * is out of the pool and never dispatched to again; its worker is still
   * running only so it can finish its native call and be terminated safely.
   */
  private retired = false;
  /** Whether anything was actually executing when this connection retired. */
  private hadInFlightAtRetire = false;
  /** Terminates the orphaned worker; cleared once it has run. */
  private orphanFinish: (() => void) | undefined;
  private orphanTimer: ReturnType<typeof setInterval> | undefined;
  /**
   * The orphaned worker itself, kept because `failInFlight` has already nulled
   * `this.worker` by the time the connection retires. Without this handle
   * `close()` would find nothing to wait on and return while the orphan was
   * still running — the thread would then outlive the database it was reading,
   * which is precisely what tracking retired connections exists to prevent.
   */
  private orphanWorker: Worker | undefined;

  /**
   * The two objects are separate on purpose. `options` is handed to the Worker
   * verbatim as `workerData`, so everything in it must be structured-cloneable:
   * a callback there throws `DataCloneError` at spawn time, and — because that
   * rejection carries a NUMERIC `code` — it then trips the string handling in
   * `isReadonlyRejection`, surfacing as an unrelated `TypeError` on the next
   * read rather than as anything resembling its cause. Connection-local
   * settings the worker has no use for (the grace window, the retirement
   * callback) therefore live in `local`, which never crosses the boundary.
   */
  constructor(
    private readonly options: {
      dbPath: string;
      readonly: boolean;
      busyTimeoutMs: number;
      driverPath: string | null;
      useNodeSqlite: boolean;
      stripRowMetadata: boolean;
    },
    private readonly local: {
      /** Grace window for an orphaned worker before forced termination. */
      orphanGraceMs?: number;
      /** Called when this connection retires, so its owner drops it. */
      onRetire?: (connection: WorkerConnection) => void;
      onExit?: (connection: WorkerConnection) => void;
      /**
       * Asked before a timed-out/aborted statement retires its worker. `false`
       * means too many orphans are already draining: the caller is still
       * rejected, but the worker stays in the pool (busy) so later reads queue
       * behind it instead of spawning yet another thread.
       */
      canRetire?: () => boolean;
      /** Retired workers currently draining, for diagnostics only. */
      drainingCount?: () => number;
      /** Retirement cap, for diagnostics only. */
      retirementCap?: () => number;
    } = {}
  ) {}

  private get orphanGraceMs(): number {
    return this.local.orphanGraceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  }

  private get onRetire(): ((connection: WorkerConnection) => void) | undefined {
    return this.local.onRetire;
  }

  /** Whether this connection has been abandoned and left the pool (#2324). */
  get isRetired(): boolean {
    return this.retired;
  }

  get hasLiveWorkers(): boolean {
    return this.liveWorkers.size > 0;
  }

  claimExactRead(): void {
    this.exactReadCustody = true;
    if (this.worker) this.exactWorkers.add(this.worker);
  }

  releaseExactRead(): void {
    if (!this.retired) {
      this.exactReadCustody = false;
      if (this.worker) this.exactWorkers.delete(this.worker);
    }
  }

  private retainRetiringReader(worker: Worker): void {
    if (this.options.readonly && this.liveWorkers.has(worker)) retiringReaderWorkers.add(worker);
  }

  retainForShutdown(): void {
    for (const worker of this.liveWorkers.keys()) this.retainRetiringReader(worker);
  }

  get generation(): number | null {
    return this.worker === null ? null : this.workerGeneration;
  }

  /**
   * How many statements this worker currently owns. The worker executes them
   * strictly FIFO and synchronously, so this is queue depth, not parallelism —
   * which is exactly what busy-aware dispatch needs to compare.
   */
  get inFlight(): number {
    return this.pending.size;
  }

  /** Statement text of everything this worker currently owns (diagnostics only). */
  inFlightSql(): string[] {
    return [...this.pending.values()].map((entry) => entry.sql);
  }

  /** `Date.now()` enqueue time of every owned statement, oldest first (diagnostics only). */
  inFlightEnqueuedAt(): number[] {
    return [...this.pending.values()].map((entry) => entry.enqueuedAt);
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
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { ...this.options, cancelled: this.cancelled.buffer },
    });
    if (this.exactReadCustody) this.exactWorkers.add(worker);
    let exited!: () => void;
    this.liveWorkers.set(
      worker,
      new Promise<void>((resolve) => {
        exited = resolve;
      })
    );
    worker.on("message", (reply: WorkerReply) => {
      // A reply from a RETIRED worker means the orphan has finished its native
      // call and is back in JavaScript — the one moment at which terminating
      // it cannot abort the process (#2324). Its result is discarded either
      // way: the callers were already rejected by `failInFlight`.
      // A retired worker's ordinary replies are discarded — its callers were
      // already rejected. Only the `__drained__` acknowledgement means it is
      // safe to terminate: the worker answers that strictly after every
      // statement queued ahead of it has finished, so no native frame is on
      // its stack and none is about to start. Terminating on an ordinary reply
      // instead would race the very next queued statement's native call, which
      // is what #2324 is (verified: doing so still aborts).
      if (this.retired) {
        if ((reply as WorkerReply & { drained?: boolean }).drained) {
          const finish = this.orphanFinish;
          this.orphanFinish = undefined;
          finish?.();
        }
        return;
      }
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
      if (this.worker !== worker) return;
      this.failInFlight(error instanceof Error ? error : new Error(String(error)));
    });
    // A crashed or self-exited worker fires `exit` with a non-zero code. Without
    // this handler, `postMessage` after a crash would enqueue a request that
    // never settles — a permanent hang. Reject everything in flight and drop the
    // handle so the next request respawns.
    worker.on("exit", (code) => {
      // Retirement clears/replaces the active handle before physical exit.
      // Resource custody must therefore be released before that identity guard.
      this.liveWorkers.delete(worker);
      this.exactWorkers.delete(worker);
      retiringReaderWorkers.delete(worker);
      if (this.orphanWorker === worker) this.orphanWorker = undefined;
      if (this.orphanWorker === undefined && this.orphanTimer !== undefined) {
        clearInterval(this.orphanTimer);
        this.orphanTimer = undefined;
      }
      exited();
      this.local.onExit?.(this);
      if (this.worker !== worker) return; // already replaced (normal terminate)
      if (code !== 0 && !this.closed) {
        this.failInFlight(new WorkerDbCrashError(`DB worker exited unexpectedly (code ${code})`));
      }
      this.worker = null;
    });
    worker.unref();
    this.worker = worker;
    this.workerGeneration += 1;
    return worker;
  }

  /** Reject all in-flight requests and drop the dead worker handle. */
  private failInFlight(error: Error): void {
    // Snapshot first: reject() runs caller continuations that may re-enter
    // request() and repopulate the map while we are still iterating it.
    const entries = [...this.pending.values()];
    this.hadInFlightAtRetire = entries.length > 0;
    this.pending.clear();
    this.busyStartedAt = 0;
    this.worker = null;
    for (const entry of entries) {
      entry.cleanup();
      entry.reject(error);
    }
    // Reclamation is routine on this path — an aborting client or an expired
    // budget — but it is worth a line: each of these was an unhandled
    // rejection that killed the process before #2316, and a reclamation storm
    // (the crash-loop signature) is otherwise invisible. Deliberately does not
    // claim whether a caller was waiting: this promise is consumed by
    // `routeRead` and by `guardAbandonedRead` before any caller reaches it, so
    // that is not knowable here.
    if (entries.length > 0) {
      logger.warn(`DB reclaimed ${entries.length} in-flight statement(s): ${error.message}`);
    }
  }

  /**
   * Give up on everything this worker is executing and take it out of service,
   * WITHOUT terminating it while a native call is on its stack (#2324).
   *
   * The reason this is not simply `terminate()` is the whole of #2324. The
   * synchronous driver is a native addon: while a statement runs, the worker
   * thread is inside Rust, not inside JavaScript. `worker.terminate()` is
   * built on V8's `TerminateExecution`, which — per V8's own
   * `include/v8-isolate.h` — "forcefully terminate[s] the current thread of
   * JAVASCRIPT execution" by raising a termination exception on JS frames. It
   * has no mechanism to preempt a native frame. So terminating mid-statement
   * does not stop the Rust; it puts the isolate into a tearing-down state with
   * the Rust still running on top of it. The next napi call that Rust makes
   * then fails, and neon 1.0.0 asserts on the status rather than propagating
   * it — `assert_eq!(status, Ok)` with no `PendingException` arm, unlike its
   * own siblings in `fun.rs`/`buffer.rs`. Because `libsql-js` builds with
   * `panic = "abort"`, that assertion is a straight `abort()`: SIGABRT, exit
   * 134, no unwinding, and nothing any JavaScript-level guard can observe or
   * catch. Reproduced locally at `neon-1.0.0/src/sys/array.rs:22` (reached
   * from the per-100-row `rowsNext` re-entry behind `.all()`); the production
   * trace names `external.rs:80` (`JsBox` allocation). Same defect class, two
   * assertion sites — which is why the fix has to be the protocol, not a
   * guard around one call.
   *
   * So: reclaim the POOL SLOT immediately, which is all #2217 ever required,
   * and let the thread die on its own schedule.
   *
   *   1. `failInFlight` rejects the callers now, exactly as before. Nothing
   *      caller-visible changes; the request still fails promptly.
   *   2. The connection is marked retired and the owner drops it from the
   *      pool, so dispatch never sends it another statement and a replacement
   *      spawns on the next read. The slot is free at this instant.
   *   3. A `__drained__` probe is queued BEHIND everything the worker still
   *      holds, and the orphan is terminated when that probe is acknowledged.
   *      Ordinary replies are discarded as before.
   *
   *      The probe is load-bearing and its absence was a real bug, caught only
   *      once the test ran with a SATURATED pool: "terminate when the orphan
   *      posts a reply" is NOT safe. The worker posts a reply and then
   *      immediately takes the next queued message off its queue, so a
   *      terminate racing that lands inside the next statement's native call
   *      and aborts exactly as before. Verified: with reply-triggered
   *      termination the suite still panicked at `array.rs:22` in 6 of 8 runs.
   *      Because the worker runs messages strictly FIFO and each statement to
   *      completion, an acknowledgement of a probe queued after them is the
   *      worker's own proof that it holds no native frame and has none left to
   *      start — which a reply, by construction, is not.
   *   4. A worker that is slow to report is NEVER force-terminated: that is
   *      the pre-#2324 last resort and it is what aborted production on
   *      2026-11-12. Instead a rate-limited warning names how long it has been
   *      draining (every `orphanGraceMs`), and the number of draining workers
   *      is bounded by `canRetire` (at the cap, the worker stays in the pool).
   *
   * The cost is honest and worth stating: peak thread count rises, because an
   * abandoned reader lingers until its statement finishes rather than dying at
   * once. On a 2-CPU machine that is real contention. It is the better trade —
   * a lingering thread degrades throughput, whereas the abort takes the whole
   * instance down and blocks its own recovery. Exact-owned work waits for drain
   * and retains admission custody; ordinary work gets the same wait.
   */
  /**
   * Flag a statement id so the worker skips it if it has not started yet. The
   * skip applies to every connection type, including the writer should it ever
   * gain a budget or signal (today it has neither, so it is never abandoned).
   */
  private cancel(id: number): void {
    Atomics.store(this.cancelled, id % this.cancelled.length, id);
  }

  private abandon(errorOrFactory: Error | ((workerKept: boolean) => Error), id?: number): void {
    const make = (workerKept: boolean): Error =>
      typeof errorOrFactory === "function" ? errorOrFactory(workerKept) : errorOrFactory;
    const error = make(false);
    // ALREADY RETIRED: a second abort landing on the same connection. Under
    // pool saturation this is the common case, not the exotic one — several
    // requests share one reader, each installs its own abort listener, and a
    // client batch going away fires all of them. There is nothing left to
    // reclaim (the first retirement did it) and the orphan's termination is
    // already scheduled, so the ONLY thing a second pass could add is a
    // premature `terminate()` on a worker still inside its native call — the
    // exact fault this method exists to avoid. Return.
    if (this.retired) {
      this.failInFlight(error);
      return;
    }

    const worker = this.worker;
    // Orphan cap reached: do not add another draining thread. Reject only the
    // caller that gave up and leave a placeholder in `pending` so the worker
    // still counts as busy; its real reply (or the drain of whatever is queued
    // behind it) clears the placeholder. Never terminates, so never aborts.
    if (
      id !== undefined &&
      worker &&
      !this.exactWorkers.has(worker) &&
      this.local.canRetire?.() === false
    ) {
      const entry = this.pending.get(id);
      if (entry) {
        this.cancel(id);
        entry.cleanup();
        this.pending.set(id, {
          sql: entry.sql,
          enqueuedAt: entry.enqueuedAt,
          resolve: () => {},
          reject: () => {},
          cleanup: () => {},
        });
        const now = Date.now();
        if (now - lastCapLogAt >= SATURATION_LOG_INTERVAL_MS) {
          const suppressed = capLogSuppressed;
          lastCapLogAt = now;
          capLogSuppressed = 0;
          logger.warn(
            `DB reader retirement cap reached (retired=${this.local.drainingCount?.() ?? "?"}/${this.local.retirementCap?.() ?? "?"}): ` +
              `a timed-out read was rejected but its worker was kept in the pool, so reads now queue behind busy workers ` +
              `until retired workers finish draining. Raise NEOTOMA_DB_MAX_RETIRED_WORKERS if this is sustained. ` +
              `Statement: ${sqlHead(entry.sql)}; ${suppressed} similar warning(s) suppressed since the last one`
          );
        } else {
          capLogSuppressed += 1;
        }
        entry.reject(make(true));
      }
      return;
    }
    for (const pendingId of this.pending.keys()) this.cancel(pendingId);
    this.failInFlight(error);
    if (!worker) return;

    // Out of service: never dispatched to again, and its replies are ignored.
    this.retired = true;
    this.retainRetiringReader(worker);
    this.onRetire?.(this);

    if (!this.hadInFlightAtRetire) {
      // Nothing was running, so no native call can be on the stack and the
      // old prompt behaviour is safe.
      void worker.terminate().catch(() => {});
      return;
    }

    // Terminate when the orphan acknowledges the drain probe below — the point
    // at which it is provably idle — or when the grace window expires,
    // whichever comes first.
    this.orphanWorker = worker;
    const retiredAt = Date.now();
    const finish = () => {
      if (this.orphanTimer !== undefined) {
        clearInterval(this.orphanTimer);
        this.orphanTimer = undefined;
      }
      logger.info(`DB retired reader finished draining after ${Date.now() - retiredAt}ms`);
      // Keep the orphan handle until the unconditional actual-exit callback.
      void worker.terminate().catch(() => {});
    };
    this.orphanFinish = finish;
    // Queue the drain probe BEHIND everything the worker is still holding. Its
    // reply is the worker's own statement that it is idle; until then we wait.
    try {
      worker.postMessage({ id: this.nextId++, op: "__drained__" });
    } catch {
      // The worker is already gone; the grace timer below still covers it.
    }
    // Deliberately NO force-terminate: wait for the drain probe however long
    // the native call takes. Force-terminating a worker still inside the addon
    // aborts the whole process (neon PendingException, SIGABRT; production
    // 2026-11-12, 13 crash loops), which is worse than a lingering thread. The
    // number of lingering threads is bounded by `canRetire` (see the pool).
    // Log only, so a slow drain is visible to operators.
    const everyMs = Math.max(this.orphanGraceMs, 1000);
    this.orphanTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastDrainLogAt < SATURATION_LOG_INTERVAL_MS) return;
      lastDrainLogAt = now;
      logger.warn(
        `DB retired reader still draining after ${now - retiredAt}ms ` +
          `(${this.local.drainingCount?.() ?? "?"} retired worker(s) draining, cap ${this.local.retirementCap?.() ?? "?"}); ` +
          `it is not terminated while inside a native call`
      );
    }, everyMs);
    this.orphanTimer.unref?.();
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
    // A RETIRED connection must never serve another statement (#2324). The
    // pool drops it on retirement, but there is a window: `readerConnection()`
    // can hand this object to a caller and an abort can retire it before the
    // caller reaches here. Spawning a fresh worker on a retired connection
    // would be actively harmful — the `message` handler treats every reply as
    // the ORPHAN reporting in, so the new worker's own replies are discarded
    // and its callers hang, while its arrival can trigger a terminate aimed at
    // a different worker that is still inside a native call. Rejecting sends
    // the caller back through `routeRead`, which dispatches to a live reader.
    if (this.retired) {
      return Promise.reject(new WorkerDbRetiredError("DB reader was retired before dispatch"));
    }
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
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
      this.pending.set(id, { sql, enqueuedAt: Date.now(), resolve, reject, cleanup });

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.abandon(
            (workerKept) =>
              new WorkerDbTimeoutError(
                workerKept
                  ? `DB statement exceeded ${timeoutMs}ms; caller released, worker kept in pool (retirement cap reached)`
                  : `DB statement exceeded ${timeoutMs}ms; caller released, worker retired and draining (replacement spawned)`,
                timeoutMs
              ),
            id
          );
        }, timeoutMs);
        // Do not let a pending timeout keep the process alive on its own.
        timer.unref?.();
      }

      if (signal) {
        onAbort = () => {
          this.abandon(new WorkerDbAbortError("DB request aborted by caller"), id);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      // Hold the process open while a request is in flight.
      worker.ref();
      worker.postMessage({ id, op, sql, params });
    });
  }

  /**
   * Shut this connection down for good (process close, or `db.close()`).
   *
   * Shares the shape #2324 is about — a `terminate()` that can land while a
   * native call is on the worker's stack — but at much lower severity, since
   * the process is on its way out and an abort during shutdown costs an exit
   * code rather than an outage. Still worth not doing: an aborting shutdown
   * turns a clean stop into a crash-looking one and muddies the very signal
   * used to diagnose this bug. So give an in-flight statement the same short
   * chance to finish and report as `abandon` does, then terminate. Exact-owned
   * generations require a drain/exit; ordinary ones keep their existing grace.
   * Every path waits for actual exit, even if a termination request rejects.
   */
  async terminate(): Promise<void> {
    this.closed = true;
    // A RETIRED connection has already had `this.worker` nulled by
    // `failInFlight`, so its orphan is reachable only through `orphanWorker`.
    // Taking it here is what makes closing the database actually wait the
    // orphan out instead of returning while it still runs.
    const workers = [...this.liveWorkers.entries()];
    // Busy means "a statement may still be inside a native call": either this
    // connection has pending requests, or it is an orphan that has not yet
    // reported back. Both need the same wait before it is safe to terminate.
    const wasBusy = this.pending.size > 0 || this.orphanWorker !== undefined;
    this.worker = null;
    for (const entry of this.pending.values()) entry.cleanup();
    this.pending.clear();
    if (this.orphanTimer !== undefined) {
      clearInterval(this.orphanTimer);
      this.orphanTimer = undefined;
    }
    this.orphanFinish = undefined;
    await Promise.all(
      workers.map(async ([worker, exited]) => {
        this.retainRetiringReader(worker);
        worker.ref(); // an awaited close must remain live until the actual exit
        if (wasBusy) await this.awaitWorkerIdle(worker, this.exactWorkers.has(worker));
        // Guarded the same way the two call sites in `abandon()` are (#2483): a
        // shutdown-time `terminate()` can race a worker that is still inside a
        // native call exactly as an abort-time one can, and an unguarded rejection
        // here would turn a clean shutdown into an unhandled rejection.
        await worker.terminate().catch(() => {});
        await exited;
      })
    );
  }

  /**
   * Resolve on terminal drain/exit; only ordinary generations permit the
   * existing grace fallback. A termination request itself is not exit evidence.
   */
  private awaitWorkerIdle(worker: Worker, drainOnly = false): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("exit", done);
        resolve();
      };
      // Wait for the DRAIN acknowledgement specifically, not for any message.
      // An ordinary reply is posted and the worker then immediately starts the
      // next queued statement, so resolving on one would hand back a worker
      // that is about to be inside native code again (#2324).
      const onMessage = (reply: WorkerReply & { drained?: boolean }) => {
        if (reply?.drained) done();
      };
      const timer = drainOnly ? undefined : setTimeout(done, this.orphanGraceMs);
      timer?.unref?.();
      worker.on("message", onMessage);
      worker.on("exit", done);
      try {
        worker.postMessage({ id: this.nextId++, op: "__drained__" });
      } catch {
        // Unknown state is not a drain proof; exact custody waits for actual exit.
      }
    });
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

/**
 * Make a read's promise safe to abandon (#2316).
 *
 * Reads are the only statements that can be reclaimed out from under their
 * caller: an abort or a statement timeout rejects them on the SERVER's
 * schedule, whenever the client hangs up or the budget expires, not when the
 * caller chooses to look. A caller that has already walked away — an express
 * handler that returned once its client disconnected, an SSE request whose
 * response closed — never attaches a handler, and Node's default
 * `--unhandled-rejections=throw` turns that rejection into an unhandled
 * exception that kills the process. One abandoned HTTP request must never be
 * able to do that.
 *
 * So attach a no-op catch to a DERIVED promise, which marks the rejection
 * handled without altering the promise we hand back: callers that DO await
 * still receive the real `WorkerDbAbortError` / `WorkerDbTimeoutError` and can
 * still map it to a response. Nothing is swallowed for anyone who is listening.
 *
 * Scoped deliberately narrowly — reads on the reader pool only:
 *   - Writes are NOT guarded. `routeWrite` and everything inside a transaction
 *     ignore the abort signal and are never timed out, precisely so a caller
 *     hanging up mid-write cannot leave a half-applied mutation. A write that
 *     fails is a real fault whose rejection must stay loud.
 *   - This is not a process-wide handler. A blanket
 *     `process.on("uncaughtException")` would keep the server alive through
 *     genuine faults — a corrupt migration, an OOM — and is its own defect;
 *     the crash-worthy cases must still crash. This guards one known-benign
 *     class of rejection at the one boundary that produces it.
 */
function guardAbandonedRead<T>(read: Promise<T>): Promise<T> {
  void read.catch(() => {});
  return read;
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
    return guardAbandonedRead(this.db.routeRead("get", this.sql, bound));
  }

  all(...params: unknown[]): Promise<unknown[]> {
    const bound = normalizeParams(params).map(toBindValue);
    return guardAbandonedRead(this.db.routeRead("all", this.sql, bound) as Promise<unknown[]>);
  }
}

/**
 * Default per-statement budget for reads on the reader pool. Generous relative
 * to any healthy query (#2267 put a 40k-row count at ~1 ms) — this is a
 * runaway-query backstop, not a latency SLO. `NEOTOMA_DB_STATEMENT_TIMEOUT_MS`
 * overrides it; `0` disables the timeout entirely.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * How long `close()` waits for a busy worker before shutting it down anyway,
 * and the interval at which a still-draining retired worker is warned about
 * (#2324). A retired worker is never force-terminated on this clock.
 *
 * Terminating a worker that is inside a synchronous native call is what aborts
 * the process, so the normal path waits for the orphan to return to JavaScript
 * and terminates it from the `message` handler instead. This window is the
 * backstop for the worker that never returns — a genuinely wedged thread must
 * not leak forever. Sized above the default statement budget so a statement
 * that is merely slow finishes and reports rather than being killed by the
 * backstop, which would reintroduce the very race being fixed.
 * This grace now bounds only the shutdown wait in `close()`. A retired reader
 * is NEVER force-terminated while it may be inside a native call (that aborts
 * the process; production 2026-11-12), so it lingers until it drains, and
 * `NEOTOMA_DB_MAX_RETIRED_WORKERS` bounds how many may linger.
 */
const DEFAULT_ORPHAN_GRACE_MS = 30_000;

/**
 * How long the oldest statement that is genuinely WAITING has been queued, in
 * ms. Input is one list of enqueue timestamps per reader, oldest first. The
 * first entry of each list is the statement the worker is executing, not one
 * waiting for it, so it is skipped; a reader with a single statement has
 * nothing queued. Returns 0 when nothing is waiting.
 */
export function oldestQueuedWaitMs(enqueuedAtPerReader: number[][], now: number): number {
  let oldest = 0;
  for (const list of enqueuedAtPerReader) {
    if (list.length < 2) continue;
    oldest = Math.max(oldest, now - list[1]);
  }
  return oldest;
}

/** First 80 characters of a statement, whitespace collapsed. SQL text only, never bound values. */
function sqlHead(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** A write that waits this long for the gate before dispatching is logged. */
const SLOW_GATE_WAIT_MS = 250;

let lastCapLogAt = 0;
let capLogSuppressed = 0;
let lastDrainLogAt = 0;

/** Rate limit for the pool-saturation warning, so a long stall logs once a second. */
const SATURATION_LOG_INTERVAL_MS = 1_000;

/**
 * Compact "what is queued" summary for the saturation warning: the most common
 * statement shapes (first 70 characters, whitespace collapsed, so parameter
 * lists and bound values never appear) with their counts. Without it the
 * warning says the pool is full but not who filled it.
 */
export function summarizeQueuedStatements(statements: string[], top = 4): string {
  const counts = new Map<string, number>();
  for (const sql of statements) {
    const shape = sql.replace(/\s+/g, " ").trim().slice(0, 70);
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = ranked.slice(0, top).map(([shape, n]) => `${n}x "${shape}"`);
  const rest = ranked.length - shown.length;
  return shown.join("; ") + (rest > 0 ? `; +${rest} more shapes` : "");
}

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

/**
 * Run `fn` with NO abort signal bound, even when the caller is inside a
 * request whose signal is. Reads issued inside `fn` are never abandoned on a
 * client disconnect.
 *
 * For a unit of work that interleaves reads with writes and must not stop
 * half way: `dbAbortContext` promises writes are never abandoned, but a
 * read-then-write loop inherits the request's signal on its reads, and a
 * hang-up rejecting one of them ends the loop after the writes already made
 * and before the rest (#2144). The statement-timeout budget still applies, so a
 * genuinely stuck read cannot hold a reader slot forever.
 */
export function detachDbAbortSignal<T>(fn: () => T): T {
  return abortContext.exit(fn);
}

/**
 * The abort signal currently bound to this async context, if any. Read-only
 * accessor so callers (and tests) can assert whether a unit of work is running
 * under a request's cancellation, without the context itself being exported.
 */
export function currentDbAbortSignal(): AbortSignal | undefined {
  return abortContext.getStore();
}

export class WorkerFileDatabase implements DbDatabase {
  private closing: Promise<void> | null = null;
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private readonly readerCount: number;
  private readonly driver = resolveWorkerDriver();
  private readonly statementTimeoutMs: number;
  private writer: WorkerConnection | null = null;
  private readers: WorkerConnection[] = [];
  private pinnedReader: WorkerConnection | null = null;
  private pinnedReadAbort: AbortController | null = null;
  /**
   * Connections that have been abandoned and left service, but whose orphaned
   * worker may still be finishing a native call (#2324). Held only so
   * `close()` can wait them out rather than leaking threads past shutdown.
   *
   * In practice these are all readers — the writer is never abandoned, since
   * writes carry neither a signal nor a timeout — but the set is not typed to
   * readers so that the shutdown guarantee does not depend on that invariant.
   */
  private retiredConnections = new Set<WorkerConnection>();
  private readonly orphanGraceMs: number;
  /** Max abandoned workers draining at once before timeouts stop retiring workers. */
  private readonly maxRetiredWorkers: number;
  private closed = false;
  private saturatedSince: number | null = null;
  private lastSaturationLogAt = 0;
  private readonly gate = new TransactionGate();
  private readonly loopDelay: IntervalHistogram | null;
  private lastGateWaitLogAt = 0;
  /** Head of the first statement run in the open transaction; never holds bound values. */
  private txSqlHead = "";
  private readonly txContext = new AsyncLocalStorage<boolean>();

  constructor(
    dbPath: string,
    options: {
      busyTimeoutMs?: number;
      readerWorkers?: number;
      /** Per-statement budget for pool reads; `0` disables the timeout. */
      statementTimeoutMs?: number;
      /**
       * How long `close()` waits for a busy worker, and how often a slow-draining
       * retired worker is warned about. Never used to force-terminate a retired
       * worker.
       */
      orphanGraceMs?: number;
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
    this.orphanGraceMs = Math.max(
      0,
      options.orphanGraceMs ?? readEnvInt("NEOTOMA_DB_ORPHAN_GRACE_MS") ?? DEFAULT_ORPHAN_GRACE_MS
    );
    this.maxRetiredWorkers = Math.max(
      1,
      readEnvInt("NEOTOMA_DB_MAX_RETIRED_WORKERS") ?? Math.max(4, this.readerCount * 2)
    );
    // Event-loop delay is the symptom a stalled gate or a blocked main thread
    // shows from outside; 20 ms resolution is cheap enough to leave on.
    try {
      this.loopDelay = monitorEventLoopDelay({ resolution: 20 });
      this.loopDelay.enable();
    } catch {
      this.loopDelay = null;
    }
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
      this.writer = new WorkerConnection(
        {
          dbPath: this.dbPath,
          readonly: false,
          busyTimeoutMs: this.busyTimeoutMs,
          driverPath: this.driver.driverPath,
          useNodeSqlite: this.driver.useNodeSqlite,
          stripRowMetadata: this.stripRowMetadata(),
        },
        {
          orphanGraceMs: this.orphanGraceMs,
          // The writer is never abandoned today: `routeWrite` passes neither a
          // signal nor a timeout, deliberately, so a client hangup cannot
          // half-apply a mutation. This hook is wired anyway so the invariant
          // does not have to hold for `close()` to be correct — if a write
          // path ever does gain a budget, a retired writer is already tracked
          // rather than leaking its thread past shutdown.
          onRetire: (connection) => {
            if (this.writer === connection) this.writer = null;
            this.retiredConnections.add(connection);
          },
          onExit: (connection) => {
            if (!connection.hasLiveWorkers) this.retiredConnections.delete(connection);
          },
        }
      );
    }
    return this.writer;
  }

  private spawnReader(): WorkerConnection {
    const reader = new WorkerConnection(
      {
        dbPath: this.dbPath,
        readonly: true,
        busyTimeoutMs: this.busyTimeoutMs,
        driverPath: this.driver.driverPath,
        useNodeSqlite: this.driver.useNodeSqlite,
        stripRowMetadata: this.stripRowMetadata(),
      },
      {
        orphanGraceMs: this.orphanGraceMs,
        canRetire: () => this.retiredConnections.size < this.maxRetiredWorkers,
        drainingCount: () => this.retiredConnections.size,
        retirementCap: () => this.maxRetiredWorkers,
        // Reclaiming the POOL SLOT is the whole of the #2217 requirement, and
        // #2324 is what happens when it is conflated with killing the thread.
        // Dropping the connection here frees the slot at this instant: dispatch
        // never sees it again and `readerConnection()` spawns a replacement on
        // the next read, while the retired worker finishes its native call in
        // its own time and is terminated safely once it is back in JavaScript.
        onRetire: (connection) => this.retireReader(connection),
        onExit: (connection) => {
          if (!connection.hasLiveWorkers) this.retiredConnections.delete(connection);
        },
      }
    );
    this.readers.push(reader);
    return reader;
  }

  /**
   * Drop a retired reader from the pool (#2324). The connection object stays
   * alive to manage its orphaned worker's safe termination; it is simply no
   * longer a dispatch target.
   */
  private retireReader(connection: WorkerConnection): void {
    const index = this.readers.indexOf(connection);
    if (index >= 0) this.readers.splice(index, 1);
    if (connection.hasLiveWorkers) this.retiredConnections.add(connection);
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
      if (reader === this.pinnedReader) continue;
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
      const queuedWait = oldestQueuedWaitMs(
        this.readers.map((r) => r.inFlightEnqueuedAt()),
        now
      );
      logger.warn(
        `DB reader pool saturated: all ${this.readers.length} readers busy ` +
          `(${depth} statements in flight, oldest queued wait ${queuedWait}ms, ` +
          `saturated for ${now - this.saturatedSince}ms). ` +
          `Raise NEOTOMA_DB_READER_WORKERS if this is sustained. ` +
          `In flight: ${summarizeQueuedStatements(this.readers.flatMap((r) => r.inFlightSql()))}`
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
    if (!this.txContext.getStore()) {
      await this.waitForGate(sql);
    } else {
      this.noteTxSql(sql);
    }
    return this.writerConnection().request(op, sql, params);
  }

  /** Wait for queued transactions, logging (rate-limited) when the wait is long. */
  private async waitForGate(sql: string): Promise<void> {
    const startedAt = Date.now();
    await this.gate.whenIdle();
    const waited = Date.now() - startedAt;
    if (waited <= SLOW_GATE_WAIT_MS) return;
    const now = Date.now();
    if (now - this.lastGateWaitLogAt < SATURATION_LOG_INTERVAL_MS) return;
    this.lastGateWaitLogAt = now;
    logger.warn(`DB write waited ${waited}ms for the transaction gate: ${sqlHead(sql)}`);
  }

  private noteTxSql(sql: string): void {
    if (this.txSqlHead === "") this.txSqlHead = sqlHead(sql);
  }

  /**
   * @internal Reads route to the reader pool; a read that turns out to write
   * (INSERT/UPDATE … RETURNING via get/all) is rejected read-only by SQLite
   * and retried on the writer. Inside a transaction, reads must see the
   * transaction's uncommitted state, so they go to the writer directly.
   */
  /**
   * Send a read to a live reader, re-choosing if the one we picked retired in
   * between (#2324).
   *
   * The window is small but routine under saturation: `readerConnection()`
   * returns the least-loaded reader, and an abort belonging to a DIFFERENT
   * request sharing that reader can retire it before this one dispatches. The
   * retry is bounded and re-picks from the pool each time, so it cannot spin
   * on the same dead connection; the pool spawns a replacement as soon as it
   * is short a reader.
   */
  private async dispatchRead(
    op: "get" | "all",
    sql: string,
    params: unknown[],
    options: WorkerRequestOptions
  ): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.readerConnection().request(op, sql, params, options);
      } catch (error) {
        if (!(error instanceof WorkerDbRetiredError)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async routeRead(op: "get" | "all", sql: string, params: unknown[]): Promise<unknown> {
    if (this.txContext.getStore()) {
      // Inside a transaction the statement runs on the writer, which is never
      // timed out or abandoned: terminating it mid-transaction would leave the
      // caller unable to tell whether anything committed.
      this.noteTxSql(sql);
      return this.writerConnection().request(op, sql, params);
    }
    // No wait for the transaction gate here. Readers are separate read-only WAL
    // connections that cannot see an uncommitted transaction's rows, so waiting
    // for it bought no consistency and stalled every read behind every queued
    // write transaction. The one exception is a pool with no readers, where
    // `readerConnection()` hands back the writer itself: a read dealt there
    // would run inside whichever transaction is open, so it must still wait.
    if (this.readerCount === 0) await this.gate.whenIdle();
    const options: WorkerRequestOptions = {
      timeoutMs: this.statementTimeoutMs,
      signal: abortContext.getStore(),
    };
    try {
      return await this.dispatchRead(op, sql, params, options);
    } catch (error) {
      if (isReadonlyRejection(error)) {
        // The read mutates, so it belongs on the writer. Re-run it there
        // untimed for the reason above — a half-applied write is worse than a
        // slow one. It is a write, so unlike a plain read it must not run
        // inside a transaction opened since: wait for the gate first.
        await this.gate.whenIdle();
        return this.writerConnection().request(op, sql, params);
      }
      throw error;
    }
  }

  /**
   * @internal Reader-pool occupancy, for tests and diagnostics. `busy` counts
   * readers with at least one statement in flight; `queued` is total depth.
   */
  readerPoolStats(): {
    size: number;
    capacity: number;
    busy: number;
    queued: number;
    oldestQueuedWaitMs: number;
    /** Event-loop delay p99/max since the previous snapshot (the histogram resets on each read). */
    eventLoopDelaySinceLastSnapshotMs: { p99: number; max: number } | null;
  } {
    let busy = 0;
    let queued = 0;
    for (const reader of this.readers) {
      if (reader.inFlight > 0 || reader === this.pinnedReader) busy += 1;
      queued += reader.inFlight;
    }
    const loop = this.loopDelay;
    // Reset after reading so each snapshot reflects recent behaviour, not the
    // whole process lifetime.
    const loopStats = loop
      ? {
          p99: Math.round(loop.percentile(99) / 1e4) / 100,
          max: Math.round(loop.max / 1e4) / 100,
        }
      : null;
    loop?.reset();
    return {
      size: this.readers.length,
      capacity: this.readerCount,
      busy,
      queued,
      oldestQueuedWaitMs: oldestQueuedWaitMs(
        this.readers.map((r) => r.inFlightEnqueuedAt()),
        Date.now()
      ),
      eventLoopDelaySinceLastSnapshotMs: loopStats,
    };
  }

  /**
   * @internal Test-only: force the writer or a reader worker to crash, to
   * exercise the supervised-restart path. Returns the promise that rejects with
   * the crash error. Never called by production code.
   */
  __crashWorkerForTest(which: "writer" | "reader" | "pinned"): Promise<unknown> {
    if (which === "pinned") {
      if (!this.pinnedReader) throw new Error("No pinned worker to crash");
      return this.pinnedReader.request("run", "__crash__", []);
    }
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
    return this.gate.runExclusive(
      () =>
        this.txContext.run(true, async () => {
          // Reset only once this transaction owns the gate, so a queued one
          // cannot overwrite the tag of the one still running.
          this.txSqlHead = "";
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
        }),
      () => this.txSqlHead
    );
  }

  /**
   * Internal: hold one idle read-only worker for a complete bounded read view.
   * This path never queues for a busy slot, changes the pool cap, or runs on the writer.
   */
  async withPinnedReadView<T>(
    operation: (view: DbConnection) => Promise<T>,
    timeoutMs = 1000
  ): Promise<T> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2000)
      throw new RangeError("Invalid pinned read budget");
    const parentSignal = abortContext.getStore();
    if (parentSignal?.aborted)
      throw new WorkerDbAbortError("DB pinned read aborted before dispatch");
    if (
      this.closed ||
      this.readerCount < 2 ||
      this.pinnedReader ||
      this.txContext.getStore() ||
      retiringReaderWorkers.size !== 0
    )
      throw new Error("DB pinned reader unavailable");
    const reader =
      this.readers.find((candidate) => candidate.inFlight === 0) ??
      (this.readers.length < this.readerCount ? this.spawnReader() : null);
    if (!reader) throw new Error("DB pinned reader unavailable");

    this.pinnedReader = reader;
    reader.claimExactRead();
    const control = new AbortController();
    this.pinnedReadAbort = control;
    const budgetError = new WorkerDbTimeoutError("DB pinned read exceeded its budget", timeoutMs);
    const deadline = performance.now() + timeoutMs;
    const verifyBudget = () => {
      if (performance.now() >= deadline) control.abort(budgetError);
      control.signal.throwIfAborted();
    };
    const timer = setTimeout(() => control.abort(budgetError), timeoutMs);
    const abort = () => control.abort(new WorkerDbAbortError("DB pinned read aborted by caller"));
    parentSignal?.addEventListener("abort", abort, { once: true });
    let generation: number | null = null;
    let began = false;
    let active = true;
    let pending = false;

    const verifyWorker = () => {
      if (generation === null || reader.generation !== generation)
        throw new WorkerDbCrashError("DB pinned reader lost its original worker");
    };
    const readonly = async (): Promise<never> => {
      throw new Error("DB pinned reader permits only SELECT statements");
    };
    const issue = async (op: "get" | "all", sql: string, params: unknown[]) => {
      if (!active || pending) throw new Error("DB pinned reader is busy or expired");
      verifyBudget();
      verifyWorker();
      pending = true;
      try {
        return await reader.request(op, sql, normalizeParams(params).map(toBindValue), {
          signal: control.signal,
        });
      } finally {
        pending = false;
      }
    };
    const view: DbConnection = {
      prepare: (sql) => {
        if (!/^\s*SELECT\s/i.test(sql) || sql.includes(";"))
          throw new Error("DB pinned reader permits only SELECT statements");
        return {
          get: (...params) => guardAbandonedRead(issue("get", sql, params)),
          all: (...params) => guardAbandonedRead(issue("all", sql, params) as Promise<unknown[]>),
          run: readonly,
        };
      },
      exec: readonly,
    };

    const cancelled = new Promise<never>((_resolve, reject) => {
      control.signal.addEventListener("abort", () => reject(control.signal.reason), { once: true });
    });
    const release = async () => {
      active = false;
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
      if (pending)
        control.abort(new WorkerDbAbortError("DB pinned read closed before its statement"));
      try {
        if (this.closed) throw new WorkerDbAbortError("DB pinned reader is closing");
        if (!reader.isRetired) {
          try {
            if (!began || pending) throw new Error("DB pinned reader custody is uncertain");
            verifyWorker();
            await reader.request("exec", "ROLLBACK", [], { timeoutMs: 250 });
          } catch (error) {
            if (!reader.isRetired) {
              this.retireReader(reader);
              // Admission stays held until actual exit; do not turn uncertain
              // native cleanup into an unbounded response wait.
              void reader.terminate().catch(() => {});
            }
            throw error;
          }
        }
      } finally {
        this.pinnedReader = null;
        this.pinnedReadAbort = null;
        reader.releaseExactRead();
      }
    };

    try {
      return await Promise.race([
        cancelled,
        (async () => {
          const begin = reader.request("exec", "BEGIN", [], { signal: control.signal });
          generation = reader.generation;
          await begin;
          verifyWorker();
          began = true;
          verifyBudget();
          const result = await operation(view);
          verifyBudget();
          if (pending) throw new Error("DB pinned reader has an unfinished statement");
          verifyWorker();
          return result;
        })(),
      ]);
    } finally {
      await release();
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.loopDelay?.disable();
    // Retired readers are included so an orphaned worker cannot outlive the
    // database it was reading (#2324). Their `terminate()` waits for the
    // worker to return to JavaScript, bounded by the same grace window, so
    // close does not abort the process on the way out either.
    const connections = [this.writer, ...this.readers, ...this.retiredConnections].filter(
      (c): c is WorkerConnection => c !== null
    );
    let finish!: () => void;
    let fail!: (error: unknown) => void;
    this.closing = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    for (const connection of connections) connection.retainForShutdown();
    this.pinnedReadAbort?.abort(new WorkerDbAbortError("DB pinned reader is closing"));
    this.writer = null;
    this.readers = [];
    Promise.all(connections.map((c) => c.terminate())).then(() => {
      this.retiredConnections.clear();
      finish();
    }, fail);
    return this.closing;
  }
}
