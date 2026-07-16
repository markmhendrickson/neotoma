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
 * Transaction semantics match the other backends: the TransactionGate
 * serializes transactions and keeps unrelated statements out of the open
 * transaction window, and AsyncLocalStorage routes statements issued on the
 * database handle from inside the callback into the transaction (they all
 * land on the writer worker, whose statements execute in message order).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import {
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
    if (msg.op === "run") {
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

class WorkerConnection {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(options: {
    dbPath: string;
    readonly: boolean;
    busyTimeoutMs: number;
    driverPath: string | null;
    useNodeSqlite: boolean;
    stripRowMetadata: boolean;
  }) {
    this.worker = new Worker(WORKER_SOURCE, { eval: true, workerData: options });
    this.worker.on("message", (reply: WorkerReply) => {
      const entry = this.pending.get(reply.id);
      if (!entry) return;
      this.pending.delete(reply.id);
      if (this.pending.size === 0) this.worker.unref();
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
    this.worker.on("error", (error) => {
      for (const entry of this.pending.values()) entry.reject(error as Error);
      this.pending.clear();
    });
    // Never keep the process alive just for an idle DB worker.
    this.worker.unref();
  }

  request(
    op: "run" | "get" | "all" | "exec" | "pragma",
    sql: string,
    params: unknown[] = []
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Hold the process open while a request is in flight.
      this.worker.ref();
      this.worker.postMessage({ id, op, sql, params });
    });
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }
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

export class WorkerFileDatabase implements DbDatabase {
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private readonly readerCount: number;
  private readonly driver = resolveWorkerDriver();
  private writer: WorkerConnection | null = null;
  private readers: WorkerConnection[] = [];
  private nextReader = 0;
  private readonly gate = new TransactionGate();
  private readonly txContext = new AsyncLocalStorage<boolean>();

  constructor(dbPath: string, options: { busyTimeoutMs?: number; readerWorkers?: number } = {}) {
    this.dbPath = dbPath;
    this.busyTimeoutMs = options.busyTimeoutMs ?? 5000;
    const fromEnv = Number.parseInt(process.env.NEOTOMA_DB_READER_WORKERS || "", 10);
    this.readerCount = Math.max(
      0,
      options.readerWorkers ?? (Number.isFinite(fromEnv) ? fromEnv : 2)
    );
    // The writer opens eagerly so the DB file exists before any read-only
    // reader connects (read-only opens fail on a missing file).
    this.writerConnection();
  }

  private stripRowMetadata(): boolean {
    return this.driver.driverPath !== null && /[\\/]libsql[\\/]/.test(this.driver.driverPath);
  }

  private writerConnection(): WorkerConnection {
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

  private readerConnection(): WorkerConnection {
    if (this.readerCount === 0) return this.writerConnection();
    if (this.readers.length < this.readerCount) {
      this.readers.push(
        new WorkerConnection({
          dbPath: this.dbPath,
          readonly: true,
          busyTimeoutMs: this.busyTimeoutMs,
          driverPath: this.driver.driverPath,
          useNodeSqlite: this.driver.useNodeSqlite,
          stripRowMetadata: this.stripRowMetadata(),
        })
      );
      return this.readers[this.readers.length - 1];
    }
    this.nextReader = (this.nextReader + 1) % this.readers.length;
    return this.readers[this.nextReader];
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
      return this.writerConnection().request(op, sql, params);
    }
    await this.gate.whenIdle();
    try {
      return await this.readerConnection().request(op, sql, params);
    } catch (error) {
      if (isReadonlyRejection(error)) {
        return this.writerConnection().request(op, sql, params);
      }
      throw error;
    }
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
    const connections = [this.writer, ...this.readers].filter(
      (c): c is WorkerConnection => c !== null
    );
    this.writer = null;
    this.readers = [];
    await Promise.all(connections.map((c) => c.terminate()));
  }
}
