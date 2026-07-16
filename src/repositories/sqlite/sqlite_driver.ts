import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import {
  normalizeParams,
  TransactionGate,
  type DbConnection,
  type DbDatabase,
  type DbRunResult,
  type DbStatement,
} from "../db/driver.js";

const nodeRequire = createRequire(import.meta.url);
let DatabaseCtor: new (path: string) => any;
let hasNativeSqlite = false;

try {
  // Suppress the ExperimentalWarning emitted by node:sqlite on Node 22+.
  const originalEmit = process.emit.bind(process) as typeof process.emit;
  process.emit = function (event: string, ...args: unknown[]) {
    if (
      event === "warning" &&
      args[0] != null &&
      typeof (args[0] as Record<string, unknown>).name === "string" &&
      (args[0] as Record<string, unknown>).name === "ExperimentalWarning" &&
      typeof (args[0] as Record<string, unknown>).message === "string" &&
      ((args[0] as Record<string, unknown>).message as string).includes("SQLite")
    ) {
      return false;
    }
    return (originalEmit as (...a: unknown[]) => boolean)(event, ...args);
  } as typeof process.emit;
  const nativeModule = nodeRequire("node:sqlite") as { DatabaseSync: new (path: string) => any };
  process.emit = originalEmit;
  DatabaseCtor = nativeModule.DatabaseSync;
  hasNativeSqlite = true;
} catch {
  DatabaseCtor = nodeRequire("better-sqlite3") as new (path: string) => any;
}

type UnknownRecord = Record<string, unknown>;

class SqliteStatementImpl {
  constructor(private readonly statement: any) {}

  run(...params: unknown[]): UnknownRecord {
    return this.statement.run(...(normalizeParams(params) as [])) as UnknownRecord;
  }

  get(...params: unknown[]): unknown {
    return this.statement.get(...(normalizeParams(params) as []));
  }

  all(...params: unknown[]): unknown[] {
    return this.statement.all(...(normalizeParams(params) as [])) as unknown[];
  }
}

class SqliteDatabaseImpl {
  private readonly db: any;

  constructor(path: string) {
    this.db = new DatabaseCtor(path);
  }

  prepare(sql: string): SqliteStatementImpl {
    return new SqliteStatementImpl(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(command: string): unknown[] {
    if (typeof this.db.pragma === "function") {
      return this.db.pragma(command) as unknown[];
    }
    this.db.exec(`PRAGMA ${command}`);
    return [];
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    if (typeof this.db.transaction === "function" && !hasNativeSqlite) {
      return this.db.transaction(fn) as (...args: TArgs) => TResult;
    }
    return (...args: TArgs): TResult => {
      this.db.exec("BEGIN");
      try {
        const result = fn(...args);
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Ignore rollback errors during unwind.
        }
        throw error;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Async adapter over the synchronous SQLite implementation, satisfying the
 * shared DbDatabase contract. Statements resolve immediately (the underlying
 * driver is sync), but the call-site contract is identical to concurrent
 * backends like libSQL, so backends can be swapped via configuration.
 */
/**
 * SQLite only binds numbers, strings, bigints, buffers, and null. Match the
 * libSQL driver's normalization so both backends accept the same inputs.
 */
function toSqliteBindValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class AsyncSqliteStatement implements DbStatement {
  constructor(
    private readonly db: AsyncSqliteDatabase,
    private readonly sql: string
  ) {}

  private async exec<T>(op: (stmt: SqliteStatementImpl) => T): Promise<T> {
    await this.db.readyForStatement();
    return op(this.db.rawDb().prepare(this.sql));
  }

  run(...params: unknown[]): Promise<DbRunResult> {
    const bound = normalizeParams(params).map(toSqliteBindValue);
    return this.exec((stmt) => {
      const result = stmt.run(...bound) as {
        changes?: number | bigint;
        lastInsertRowid?: number | bigint;
      };
      return {
        changes: Number(result?.changes ?? 0),
        lastInsertRowid: result?.lastInsertRowid,
      };
    });
  }

  get(...params: unknown[]): Promise<unknown> {
    const bound = normalizeParams(params).map(toSqliteBindValue);
    return this.exec((stmt) => stmt.get(...bound));
  }

  all(...params: unknown[]): Promise<unknown[]> {
    const bound = normalizeParams(params).map(toSqliteBindValue);
    return this.exec((stmt) => stmt.all(...bound));
  }
}

export class AsyncSqliteDatabase implements DbDatabase {
  private readonly db: SqliteDatabaseImpl;
  private readonly gate = new TransactionGate();
  private readonly txContext = new AsyncLocalStorage<boolean>();

  constructor(path: string) {
    this.db = new SqliteDatabaseImpl(path);
  }

  /** @internal Exposes the sync database to statement wrappers. */
  rawDb(): SqliteDatabaseImpl {
    return this.db;
  }

  /**
   * @internal Statements wait for any open transaction unless they run inside
   * its async context (then they join it — the single connection is already
   * inside BEGIN, matching the old synchronous semantics).
   */
  async readyForStatement(): Promise<void> {
    if (this.txContext.getStore()) return;
    await this.gate.whenIdle();
  }

  prepare(sql: string): DbStatement {
    return new AsyncSqliteStatement(this, sql);
  }

  async exec(sql: string): Promise<void> {
    await this.readyForStatement();
    this.db.exec(sql);
  }

  async pragma(command: string): Promise<unknown[]> {
    await this.readyForStatement();
    return this.db.pragma(command);
  }

  transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    // Manual BEGIN/COMMIT: the native sync transaction() helper commits when
    // its callback *returns*, which for an async fn would be before any awaited
    // work ran. The gate serializes transactions and holds unrelated statements
    // out of the open transaction window.
    //
    // IMMEDIATE (not deferred): a deferred transaction acquires the write lock
    // at its first write, and if another connection wrote since our read
    // snapshot, SQLite fails that upgrade with "database is locked"
    // IMMEDIATELY — busy_timeout never applies to upgrades because retrying
    // against a stale snapshot cannot succeed. Acquiring the write lock at
    // BEGIN makes contention wait up to busy_timeout instead, which matters
    // now that the async callback keeps transactions open across microtask
    // hops (observed as cross-process lock failures in ensureSchema).
    return this.gate.runExclusive(() =>
      this.txContext.run(true, async () => {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(this);
          this.db.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
            // Ignore rollback errors during unwind.
          }
          throw error;
        }
      })
    );
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export default class Database extends SqliteDatabaseImpl {}
export type SqliteDatabase = SqliteDatabaseImpl;
export type SqliteStatement = SqliteStatementImpl;
