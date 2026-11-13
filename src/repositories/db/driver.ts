/**
 * Async DB driver contract (concurrent-backend plan).
 *
 * Every backend (better-sqlite3 / node:sqlite, libSQL, future Postgres)
 * implements this interface, so call sites are written once against an async
 * contract. The synchronous SQLite implementation resolves immediately; the
 * libSQL implementation runs statements off the Node event loop, which is the
 * fix for the single-threaded blocking that froze hosted instances (a slow
 * query no longer stalls health checks or concurrent MCP requests).
 *
 * Transaction semantics
 * ---------------------
 * `transaction(fn)` opens BEGIN..COMMIT around `fn` and rolls back on throw.
 * Transactions are serialized: while one is open, other transactions AND
 * statements issued outside it queue until it settles, so an async callback
 * cannot have unrelated writes interleaved into its transaction (the isolation
 * the old synchronous better-sqlite3 `db.transaction()` gave for free).
 * Statements issued on the database handle from *inside* the callback's async
 * context are routed into the open transaction via AsyncLocalStorage rather
 * than deadlocking on the queue.
 */

import { logger } from "../../utils/logger.js";

export interface DbRunResult {
  /** Number of rows changed by the statement. */
  changes: number;
  /** Rowid of the last inserted row, when the backend reports it. */
  lastInsertRowid?: number | bigint;
}

export interface DbStatement {
  run(...params: unknown[]): Promise<DbRunResult>;
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
}

/** The statement surface shared by a database handle and an open transaction. */
export interface DbConnection {
  prepare(sql: string): DbStatement;
  exec(sql: string): Promise<void>;
}

export interface DbDatabase extends DbConnection {
  pragma(command: string): Promise<unknown[]>;
  /** Run `fn` atomically; commit on resolve, rollback on throw. */
  transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Thrown when `transaction()` is called from inside another transaction's
 * callback. Transactions are gate-serialized, so a nested call would await a
 * queue tail that only resolves after the outer (waiting) transaction finishes
 * — a self-deadlock. Every backend fails fast with this message instead of
 * hanging. Statements issued on the db handle inside a transaction callback
 * join the open transaction and are fine; only a nested `transaction()` is
 * unsupported.
 */
export const NESTED_TRANSACTION_ERROR =
  "Nested transaction() is not supported: a transaction() call was issued from " +
  "inside another transaction's callback. Transactions are serialized, so this " +
  "would deadlock. Issue statements directly on the db handle inside the " +
  "callback (they join the open transaction), or restructure so the inner work " +
  "runs outside the outer transaction.";

/**
 * Normalize positional bind params. Callers historically pass either
 * `.run(a, b, c)` or `.run(valuesArray)`; both must bind identically.
 */
export function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0] as unknown[];
  }
  return params;
}

/**
 * Serializes transactions against each other and lets non-transaction work
 * wait for the currently open transaction. Backends compose this with an
 * AsyncLocalStorage check so statements inside the transaction's own async
 * context bypass the gate instead of deadlocking.
 *
 * DESIGN NOTE — process-global, NOT per-tenant (arch review, PR #1944): the
 * single tail-promise queue serializes ALL transactions in this process
 * against each other, regardless of tenant/user. One caller's slow transaction
 * queues every other caller's transaction behind it. This is the SAME
 * global-serial constraint the prior synchronous better-sqlite3 driver had
 * (single-threaded engine, one writer) — carried forward, just made explicit
 * and now shared across the worker + reader pools. Do NOT "optimize" this into
 * per-tenant sharding without preserving the atomicity guarantee entity_merge.ts
 * relies on: its AsyncLocalStorage-routed statements join the caller's OPEN
 * transaction, keyed on gate identity (the open BEGIN), not on tenant. A
 * per-tenant gate would let a second tenant's statement interleave into the
 * first tenant's transaction window and break that guarantee.
 */
export class TransactionGate {
  private tail: Promise<void> = Promise.resolve();
  private lastSlowHoldLogAt = 0;
  private suppressedSlowHoldLogs = 0;

  /**
   * Resolves once every transaction enqueued SO FAR has settled. This is a
   * snapshot: a transaction enqueued after the call is not waited for. Code
   * that is about to issue a statement on a connection a transaction also uses
   * must not rely on it alone; see {@link runInOrder}.
   */
  whenIdle(): Promise<void> {
    return this.tail;
  }

  /**
   * Run a non-transaction statement in the gate's FIFO order, behind every
   * transaction enqueued before it and ahead of every one enqueued after it.
   *
   * `whenIdle()` is not enough for a non-transaction statement on a
   * single-writer backend. A transaction enqueued after the snapshot awaits the
   * same tail, and its `BEGIN` reaches the writer a few microtasks before the
   * waiting statement does, so the statement runs INSIDE that transaction: it
   * resolves before COMMIT (invisible to every other connection, and lost on
   * ROLLBACK) while the caller believes it committed. Re-checking the tail in a
   * loop instead would starve the statement for as long as other clients keep
   * transactions queued. Taking a place in the queue closes both: the statement
   * owns the gate while it runs, so no transaction can begin around it, and it
   * cannot be overtaken indefinitely.
   *
   * `onWait` receives the time spent queued behind earlier transactions.
   */
  runInOrder<T>(fn: () => Promise<T>, onWait?: (waitedMs: number) => void): Promise<T> {
    const enqueuedAt = Date.now();
    return this.runExclusive(() => {
      onWait?.(Date.now() - enqueuedAt);
      return fn();
    });
  }

  /**
   * Enqueue `fn` after all prior transactions; holds the gate until settled.
   *
   * `describe` returns a short, parameter-free tag (for example the head of
   * the first SQL statement) used only when the hold is slow enough to log.
   * It is read at release time so it can reflect what the transaction ran.
   */
  runExclusive<T>(fn: () => Promise<T>, describe?: () => string): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enqueuedAt = Date.now();
    return (async () => {
      await prev;
      const startedAt = Date.now();
      try {
        return await fn();
      } finally {
        this.noteHold(Date.now() - startedAt, startedAt - enqueuedAt, describe);
        release();
      }
    })();
  }

  /** Log a transaction that held the gate longer than SLOW_GATE_HOLD_MS. Rate-limited; counts suppressed lines. */
  private noteHold(holdMs: number, queueWaitMs: number, describe?: () => string): void {
    if (holdMs <= SLOW_GATE_HOLD_MS) return;
    const now = Date.now();
    if (now - this.lastSlowHoldLogAt < SLOW_GATE_LOG_INTERVAL_MS) {
      this.suppressedSlowHoldLogs += 1;
      return;
    }
    this.lastSlowHoldLogAt = now;
    const suppressed = this.suppressedSlowHoldLogs;
    this.suppressedSlowHoldLogs = 0;
    let tag = "";
    try {
      tag = describe ? describe() : "";
    } catch {
      tag = "";
    }
    logger.warn(
      `DB transaction held the gate ${holdMs}ms (waited for gate ${queueWaitMs}ms` +
        `${suppressed > 0 ? `, ${suppressed} similar line(s) suppressed` : ""}). ` +
        `A long write transaction delays other writes.` +
        (tag ? ` First statement: ${tag}` : "")
    );
  }
}

/** A transaction holding the gate longer than this is logged. */
export const SLOW_GATE_HOLD_MS = 3000;
const SLOW_GATE_LOG_INTERVAL_MS = 1000;
