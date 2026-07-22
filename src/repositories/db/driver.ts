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
