import crypto from "crypto";
import { mkdirSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { getSqliteDb } from "./sqlite_client.js";
import { config } from "../../config.js";

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number };

const JSON_COLUMNS: Record<string, Set<string>> = {
  sources: new Set(["provenance"]),
  interpretations: new Set(["interpretation_config"]),
  observations: new Set(["fields"]),
  entity_snapshots: new Set(["snapshot", "provenance"]),
  entities: new Set(["aliases"]),
  relationship_observations: new Set(["metadata"]),
  relationship_snapshots: new Set(["snapshot", "provenance"]),
  raw_fragments: new Set(["fragment_value", "fragment_envelope"]),
  schema_registry: new Set(["schema_definition", "reducer_config", "metadata"]),
  schema_recommendations: new Set(["fields_to_add", "fields_to_remove", "fields_to_modify", "converters_to_add"]),
  auto_enhancement_queue: new Set(["payload"]),
};

const TABLES_WITH_ID = new Set([
  "sources",
  "interpretations",
  "observations",
  "entities",
  "timeline_events",
  "relationship_observations",
  "raw_fragments",
  "entity_merges",
  "schema_registry",
  "schema_recommendations",
  "auto_enhancement_queue",
  "field_blacklist",
  "source_entity_edges",
  "source_event_edges",
  "mcp_oauth_state",
  "mcp_oauth_connections",
  "mcp_oauth_client_state",
  "auth_users",
  "auth_sessions",
  "local_auth_users",
]);

/** SQLite3 only accepts numbers, strings, bigints, buffers, and null. Normalize for bind. */
function toBindValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function toDbValue(table: string, column: string, value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (JSON_COLUMNS[table]?.has(column)) {
    return value === null ? null : JSON.stringify(value);
  }
  return value;
}

function fromDbRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row };
  const jsonColumns = JSON_COLUMNS[table];
  if (!jsonColumns) {
    return result;
  }
  for (const column of jsonColumns) {
    if (result[column] === null || result[column] === undefined) {
      continue;
    }
    if (typeof result[column] === "string") {
      try {
        result[column] = JSON.parse(result[column] as string);
      } catch {
        // Leave as string if parse fails
      }
    }
  }
  return result;
}


class LocalQueryBuilder {
  private table: string;
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selectColumns: string | null = "*";
  private filters: string[] = [];
  private filterValues: unknown[] = [];
  private orderBy: string | null = null;
  private orderAscending = true;
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private insertPayload: Record<string, unknown>[] | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private upsertPayload: Record<string, unknown>[] | null = null;
  private countExact = false;
  private countHead = false;
  private expectSingle = false;
  private allowNullSingle = false;
  private orConditions: Array<{ clause: string; values: unknown[] }> = [];

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: { count?: "exact"; head?: boolean }): this {
    this.selectColumns = columns || "*";
    this.countExact = options?.count === "exact";
    this.countHead = options?.head === true;
    if (this.operation !== "insert" && this.operation !== "upsert") {
      this.operation = "select";
    }
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.insertPayload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = "update";
    this.updatePayload = payload;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  upsert(payload: Record<string, unknown> | Record<string, unknown>[], _options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.upsertPayload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    if (value === null) {
      this.filters.push(`${column} IS NULL`);
    } else {
      this.filters.push(`${column} = ?`);
      this.filterValues.push(value);
    }
    return this;
  }

  /** Postgrest-compatible NULL check: .is(column, null) => column IS NULL */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  is(column: string, value: null): this {
    this.filters.push(`${column} IS NULL`);
    return this;
  }

  in(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.filters.push("1 = 0");
      return this;
    }
    const placeholders = values.map(() => "?").join(", ");
    this.filters.push(`${column} IN (${placeholders})`);
    this.filterValues.push(...values);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === "is" && value === null) {
      this.filters.push(`${column} IS NOT NULL`);
      return this;
    }
    this.filters.push(`${column} != ?`);
    this.filterValues.push(value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push(`${column} >= ?`);
    this.filterValues.push(value);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push(`${column} <= ?`);
    this.filterValues.push(value);
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push(`${column} < ?`);
    this.filterValues.push(value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = column;
    this.orderAscending = options?.ascending !== false;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  single(): this {
    this.expectSingle = true;
    this.allowNullSingle = false;
    return this;
  }

  maybeSingle(): this {
    this.expectSingle = true;
    this.allowNullSingle = true;
    return this;
  }

  or(conditions: string): this {
    const parts = conditions.split(",").map((p) => p.trim()).filter(Boolean);
    const clauses: string[] = [];
    const values: unknown[] = [];

    for (const part of parts) {
      const [left, op, ...rest] = part.split(".");
      const value = rest.join(".");
      if (!left || !op) {
        continue;
      }
      if (op === "eq") {
        clauses.push(`${left} = ?`);
        values.push(value);
      } else if (op === "is" && value === "null") {
        clauses.push(`${left} IS NULL`);
      }
    }

    if (clauses.length > 0) {
      this.orConditions.push({ clause: `(${clauses.join(" OR ")})`, values });
    }
    return this;
  }

  async execute(): Promise<QueryResult<any>> {
    const db = getSqliteDb();
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (this.filters.length > 0) {
      whereClauses.push(...this.filters);
      values.push(...this.filterValues.map(toBindValue));
    }
    if (this.orConditions.length > 0) {
      const orClause = this.orConditions.map((o) => o.clause).join(" AND ");
      whereClauses.push(orClause);
      for (const condition of this.orConditions) {
        values.push(...condition.values.map(toBindValue));
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    try {
      if (this.operation === "select") {
        const countRow = this.countExact
          ? db.prepare(`SELECT COUNT(*) as count FROM ${this.table} ${whereSql}`).get(values) as { count: number } | undefined
          : undefined;
        const count = countRow?.count;

        if (this.countHead) {
          return { data: null, error: null, count };
        }

        const orderSql = this.orderBy ? `ORDER BY ${this.orderBy} ${this.orderAscending ? "ASC" : "DESC"}` : "";
        const limitSql = this.limitValue !== null ? `LIMIT ${this.limitValue}` : "";
        const offsetSql = this.offsetValue !== null ? `OFFSET ${this.offsetValue}` : "";

        const sql = `SELECT ${this.selectColumns || "*"} FROM ${this.table} ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`.trim();
        const rows = db.prepare(sql).all(values).map((row: any) => fromDbRow(this.table, row));

        if (this.expectSingle) {
          const row = rows[0] || null;
          if (!row && !this.allowNullSingle) {
            const detail =
              whereSql ||
              "no filter applied";
            return {
              data: null,
              error: {
                message: `SELECT on table '${this.table}' returned no rows (expected exactly one). Query had: ${detail}.`,
                code: "PGRST116",
              },
            };
          }
          return { data: row, error: null, count };
        }

        return { data: rows, error: null, count };
      }

      if (this.operation === "insert" && this.insertPayload) {
        const inserted: Record<string, unknown>[] = [];
        for (const item of this.insertPayload) {
          const payload = { ...item };
          if (TABLES_WITH_ID.has(this.table) && !payload.id) {
            payload.id = crypto.randomUUID();
          }
          if ("created_at" in payload === false) {
            payload.created_at = new Date().toISOString();
          }
          const columns = Object.keys(payload);
          const values = columns.map((column) => toDbValue(this.table, column, payload[column]));
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
          inserted.push(payload);

        }

        if (this.selectColumns) {
          return { data: this.expectSingle ? inserted[0] : inserted, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "update" && this.updatePayload) {
        const payload = { ...this.updatePayload };
        const columns = Object.keys(payload);
        const updateValues = columns.map((column) => toDbValue(this.table, column, payload[column]));
        const updateSql = columns.map((column) => `${column} = ?`).join(", ");

        db.prepare(`UPDATE ${this.table} SET ${updateSql} ${whereSql}`).run([...updateValues, ...values]);

        if (this.selectColumns) {
          const rows = db.prepare(`SELECT ${this.selectColumns} FROM ${this.table} ${whereSql}`).all(values).map((row: any) => fromDbRow(this.table, row));
          if (this.expectSingle) {
            const row = rows[0] || null;
            if (!row && !this.allowNullSingle) {
              const detail =
                whereSql ||
                "no filter applied";
              return {
                data: null,
                error: {
                  message: `UPDATE on table '${this.table}' then SELECT returned no rows (expected exactly one). Query had: ${detail}.`,
                  code: "PGRST116",
                },
              };
            }
            return { data: row, error: null };
          }
          return { data: rows, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "upsert" && this.upsertPayload) {
        const inserted: Record<string, unknown>[] = [];
        for (const item of this.upsertPayload) {
          const payload = { ...item };
          if (TABLES_WITH_ID.has(this.table) && !payload.id) {
            payload.id = crypto.randomUUID();
          }
          const columns = Object.keys(payload);
          const values = columns.map((column) => toDbValue(this.table, column, payload[column]));
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`INSERT OR REPLACE INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
          inserted.push(payload);
        }
        if (this.selectColumns) {
          return { data: this.expectSingle ? inserted[0] : inserted, error: null };
        }
        return { data: null, error: null };
      }

      if (this.operation === "delete") {
        db.prepare(`DELETE FROM ${this.table} ${whereSql}`).run(values);
        return { data: null, error: null };
      }

      return { data: null, error: { message: "Unsupported operation" } };
    } catch (error: any) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class LocalStorageBucket {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private resolvePath(objectPath: string): string {
    if (this.bucket === "sources") {
      return path.join(config.rawStorageDir, objectPath);
    }
    return path.join(config.dataDir, "storage", this.bucket, objectPath);
  }

  async upload(objectPath: string, data: Buffer, options?: { upsert?: boolean; contentType?: string }): Promise<QueryResult<null>> {
    const targetPath = this.resolvePath(objectPath);
    const dir = path.dirname(targetPath);
    mkdirSync(dir, { recursive: true });

    try {
      if (!options?.upsert) {
        try {
          await fs.access(targetPath);
          return { data: null, error: { message: "File already exists", code: "STORAGE_FILE_EXISTS" } };
        } catch {
          // continue
        }
      }
      await fs.writeFile(targetPath, data);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  async download(objectPath: string): Promise<QueryResult<{ arrayBuffer: () => Promise<ArrayBuffer> }>> {
    const targetPath = this.resolvePath(objectPath);
    try {
      const file = await fs.readFile(targetPath);
      return {
        data: {
          arrayBuffer: async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
        },
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createSignedUrl(objectPath: string, _expiresIn: number): Promise<QueryResult<{ signedUrl: string }>> {
    const targetPath = this.resolvePath(objectPath);
    const signedUrl = `file://${targetPath}`;
    return { data: { signedUrl }, error: null };
  }
}

class LocalStorageClient {
  from(bucket: string): LocalStorageBucket {
    return new LocalStorageBucket(bucket);
  }
}

class LocalAuthAdmin {
  async getUserById(userId: string): Promise<QueryResult<{ user: { id: string; email?: string | null } | null }>> {
    const db = getSqliteDb();
    const user = db.prepare("SELECT id, email FROM auth_users WHERE id = ?").get(userId) as { id: string; email?: string | null } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }
    return { data: { user }, error: null };
  }

  async createUser(payload: { id?: string; email?: string; email_confirm?: boolean }): Promise<QueryResult<{ user: { id: string; email?: string | null } }>> {
    const db = getSqliteDb();
    const id = payload.id || crypto.randomUUID();
    const email = payload.email || null;
    db.prepare("INSERT INTO auth_users (id, email, created_at) VALUES (?, ?, ?)").run(
      id,
      email,
      new Date().toISOString()
    );
    return { data: { user: { id, email } }, error: null };
  }

  async listUsers(): Promise<QueryResult<{ users: Array<{ id: string; email?: string | null }> }>> {
    const db = getSqliteDb();
    const users = db.prepare("SELECT id, email FROM auth_users").all();
    return { data: { users: users as any }, error: null };
  }

  async generateLink(payload: { type: string; email: string; options?: { redirectTo?: string } }): Promise<QueryResult<{ properties: { action_link: string } }>> {
    const db = getSqliteDb();
    const user = db.prepare("SELECT id, email FROM auth_users WHERE email = ?").get(payload.email) as { id: string; email?: string } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }

    const accessToken = `local_${crypto.randomUUID()}`;
    const refreshToken = `local_refresh_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sessionId = crypto.randomUUID();

    db.prepare(
      "INSERT INTO auth_sessions (id, user_id, access_token, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, user.id, accessToken, refreshToken, expiresAt, new Date().toISOString());

    const redirectTo = payload.options?.redirectTo || "http://localhost:5173";
    const actionLink = `${redirectTo}#access_token=${accessToken}&refresh_token=${refreshToken}`;

    return { data: { properties: { action_link: actionLink } }, error: null };
  }
}

class LocalAuthClient {
  admin = new LocalAuthAdmin();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refreshSession(_opts: { refresh_token: string }): Promise<QueryResult<{ session: null }>> {
    return {
      data: { session: null },
      error: { message: "Token refresh not supported in local backend", code: "AUTH_LOCAL" },
    };
  }

  async getUser(token: string): Promise<QueryResult<{ user: { id: string; email?: string | null } }>> {
    const db = getSqliteDb();
    const session = db.prepare("SELECT user_id, access_token, expires_at FROM auth_sessions WHERE access_token = ?").get(token) as { user_id: string; expires_at: string | null } | undefined;
    if (!session) {
      return { data: null, error: { message: "Invalid token", code: "AUTH_INVALID" } };
    }
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return { data: null, error: { message: "Token expired", code: "AUTH_EXPIRED" } };
    }
    const user = db.prepare("SELECT id, email FROM auth_users WHERE id = ?").get(session.user_id) as { id: string; email?: string | null } | undefined;
    if (!user) {
      return { data: null, error: { message: "User not found", code: "PGRST116" } };
    }
    return { data: { user: user as any }, error: null };
  }
}

export class LocalSupabaseClient {
  storage = new LocalStorageClient();
  auth = new LocalAuthClient();

  from(table: string): LocalQueryBuilder {
    return new LocalQueryBuilder(table);
  }
}

export function createLocalSupabaseClient(): LocalSupabaseClient {
  return new LocalSupabaseClient();
}
