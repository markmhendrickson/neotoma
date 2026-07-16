/**
 * libSQL backend for the async DB driver contract (concurrent-backend plan).
 *
 * Uses @libsql/client, whose native binding executes statements off the Node
 * event loop — a slow query no longer freezes health checks, the web UI, or
 * concurrent MCP requests (the bottega8 failure mode). Supports:
 *   - `file:` URLs — embedded local database, same file format and SQL dialect
 *     as the SQLite backend, preserving the zero-config local-first default.
 *   - `http(s):`/`ws(s):`/`libsql:` URLs — remote sqld / Turso, for hosted
 *     deployments (NEOTOMA_DB_AUTH_TOKEN supplies credentials when required).
 *
 * The file-protocol client runs transactions on the same underlying
 * connection as ordinary statements, so the TransactionGate serializes
 * transactions against outside statements for isolation; statements issued
 * from inside the transaction's async context are routed into the open
 * transaction via AsyncLocalStorage (see driver.ts).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import {
  normalizeParams,
  TransactionGate,
  type DbConnection,
  type DbDatabase,
  type DbRunResult,
  type DbStatement,
} from "../db/driver.js";
import { WorkerFileDatabase } from "../worker/worker_file_database.js";

/** Convert a file: URL (file:/path, file:///path) to a filesystem path. */
export function fileUrlToPath(url: string): string {
  return url.slice("file:".length).replace(/^\/\//, "/");
}

/**
 * Open the libsql backend for a connection URL.
 *
 * - `file:` URLs: EVERY Node binding for local libSQL/SQLite files executes
 *   synchronously on the calling thread (verified empirically — including
 *   @libsql/client's file protocol and `libsql/promise`, whose promises
 *   resolve only after blocking the event loop for the whole statement). To
 *   actually deliver statements-off-the-event-loop locally, file URLs are
 *   served by WorkerFileDatabase: the synchronous driver hosted in worker
 *   threads (single writer + read-only reader pool under WAL) behind the
 *   same DbDatabase contract.
 * - Remote URLs (http/https/ws/wss/libsql): @libsql/client is genuinely
 *   async — network I/O — so the direct client is used.
 */
export function openLibsqlDatabase(
  url: string,
  options: { authToken?: string; busyTimeoutMs?: number } = {}
): DbDatabase {
  if (url.startsWith("file:")) {
    return new WorkerFileDatabase(fileUrlToPath(url), {
      busyTimeoutMs: options.busyTimeoutMs,
    });
  }
  return new LibsqlDatabase(url, { authToken: options.authToken });
}

/** SQLite accepts numbers, strings, bigints, buffers, and null; map the rest. */
function toInValue(value: unknown): InValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as InValue;
}

/**
 * libSQL rows are array-likes with numeric and named accessors; normalize to
 * plain objects keyed by column name so callers can spread and JSON-serialize
 * them exactly like better-sqlite3 rows.
 */
function rowToObject(
  row: Record<string | number, unknown>,
  columns: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i += 1) {
    out[columns[i]] = row[i];
  }
  return out;
}

/** The statement-execution surface shared by the client and an open transaction. */
type Executor = Pick<Client, "execute">;

class LibsqlStatement implements DbStatement {
  constructor(
    private readonly db: LibsqlDatabase,
    private readonly sql: string
  ) {}

  private async execute(params: unknown[]): Promise<{
    rows: Record<string, unknown>[];
    rowsAffected: number;
    lastInsertRowid: bigint | undefined;
  }> {
    const executor = await this.db.executorForStatement();
    const args = normalizeParams(params).map(toInValue);
    const result = await executor.execute({ sql: this.sql, args });
    return {
      rows: result.rows.map((row) =>
        rowToObject(row as unknown as Record<string | number, unknown>, result.columns)
      ),
      rowsAffected: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async run(...params: unknown[]): Promise<DbRunResult> {
    const result = await this.execute(params);
    return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
  }

  async get(...params: unknown[]): Promise<unknown> {
    const result = await this.execute(params);
    return result.rows[0];
  }

  async all(...params: unknown[]): Promise<unknown[]> {
    const result = await this.execute(params);
    return result.rows;
  }
}

export class LibsqlDatabase implements DbDatabase {
  private readonly client: Client;
  private readonly gate = new TransactionGate();
  private readonly txContext = new AsyncLocalStorage<Transaction>();

  constructor(url: string, options: { authToken?: string; syncUrl?: string } = {}) {
    this.client = createClient({
      url,
      // Neotoma stores integers well inside Number.MAX_SAFE_INTEGER; "number"
      // matches better-sqlite3's default return type for INTEGER columns.
      intMode: "number",
      ...(options.authToken ? { authToken: options.authToken } : {}),
      ...(options.syncUrl ? { syncUrl: options.syncUrl } : {}),
    });
  }

  /**
   * @internal Statements wait for any open transaction unless they execute
   * inside its async context, in which case they join the open transaction.
   */
  async executorForStatement(): Promise<Executor> {
    const activeTx = this.txContext.getStore();
    if (activeTx) return activeTx;
    await this.gate.whenIdle();
    return this.client;
  }

  prepare(sql: string): DbStatement {
    return new LibsqlStatement(this, sql);
  }

  async exec(sql: string): Promise<void> {
    const activeTx = this.txContext.getStore();
    if (activeTx) {
      await activeTx.executeMultiple(sql);
      return;
    }
    await this.gate.whenIdle();
    await this.client.executeMultiple(sql);
  }

  async pragma(command: string): Promise<unknown[]> {
    await this.gate.whenIdle();
    const result = await this.client.execute(`PRAGMA ${command}`);
    return result.rows.map((row) =>
      rowToObject(row as unknown as Record<string | number, unknown>, result.columns)
    );
  }

  transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    return this.gate.runExclusive(async () => {
      const tx = await this.client.transaction("write");
      try {
        const result = await this.txContext.run(tx, () => fn(this));
        await tx.commit();
        return result;
      } catch (error) {
        try {
          await tx.rollback();
        } catch {
          // Ignore rollback errors during unwind.
        }
        throw error;
      } finally {
        tx.close();
      }
    });
  }

  async close(): Promise<void> {
    this.client.close();
  }
}
