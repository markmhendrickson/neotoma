import { createRequire } from "node:module";

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

function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0] as unknown[];
  }
  return params;
}

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

  /**
   * `mode: "immediate"` acquires the write lock at `BEGIN` time (`BEGIN
   * IMMEDIATE`) instead of deferring it to the transaction's first write.
   * Use this for any transaction that concurrent processes may open as a
   * reader against the same DB file (e.g. one-time schema init): a deferred
   * transaction lets two callers both start as readers on the same WAL
   * snapshot, and whichever tries to upgrade to a writer second hits
   * SQLITE_BUSY_SNAPSHOT — a snapshot conflict that busy_timeout cannot
   * retry. Taking the write lock up front makes the second caller block on
   * ordinary lock contention instead, which busy_timeout does retry.
   */
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
    options?: { mode?: "deferred" | "immediate" }
  ): (...args: TArgs) => TResult {
    const immediate = options?.mode === "immediate";
    if (typeof this.db.transaction === "function" && !hasNativeSqlite) {
      const tx = this.db.transaction(fn) as ((...args: TArgs) => TResult) & {
        immediate: (...args: TArgs) => TResult;
      };
      return immediate ? (tx.immediate.bind(tx) as (...args: TArgs) => TResult) : tx;
    }
    return (...args: TArgs): TResult => {
      this.db.exec(immediate ? "BEGIN IMMEDIATE" : "BEGIN");
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

export default class Database extends SqliteDatabaseImpl {}
export type SqliteDatabase = SqliteDatabaseImpl;
export type SqliteStatement = SqliteStatementImpl;
