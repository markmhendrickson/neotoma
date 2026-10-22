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

  /** Resolves once every transaction enqueued so far has settled. */
  whenIdle(): Promise<void> {
    return this.tail;
  }

  /** Enqueue `fn` after all prior transactions; holds the gate until settled. */
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return (async () => {
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    })();
  }
}
