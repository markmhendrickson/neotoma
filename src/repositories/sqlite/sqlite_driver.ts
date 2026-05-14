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

  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
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

export default class Database extends SqliteDatabaseImpl {}
export type SqliteDatabase = SqliteDatabaseImpl;
export type SqliteStatement = SqliteStatementImpl;
