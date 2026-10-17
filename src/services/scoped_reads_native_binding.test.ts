/** Synthetic prospective-layout tests; NOT a verified reader/grant/origin fixture. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AsyncSqliteDatabase } from "../repositories/sqlite/sqlite_driver.js";
import type { DbConnection, DbDatabase } from "../repositories/db/driver.js";
import { canonicalStoreRequest } from "./store_condition_keys.js";
import {
  collectOwnedPrincipalBindingCandidates,
  decodeStrictJsonObject,
  type NativeBindingPresentation,
} from "./scoped_reads.js";

const tenant = "synthetic-native-history-tenant";
const presentation: NativeBindingPresentation = {
  credential_kind: "aauth_sub",
  credential_value: "SYNTHETIC_MATCHING_SUBJECT",
  credential_issuer: "https://synthetic-issuer.invalid",
};
const targetA = "ent_" + "a".repeat(24);
const targetB = "ent_" + "b".repeat(24);
const hash = (value: unknown) =>
  createHash("sha256").update(canonicalStoreRequest(value)).digest("hex");
const selectorFor = (p = presentation) => ({
  bindings: {
    credential_kind: "aauth_sub" as const,
    credential_key_sha256: hash([
      "principal-binding-lookup-v1",
      tenant,
      p.credential_kind,
      p.credential_value,
      p.credential_issuer,
    ]),
  },
});
let database: AsyncSqliteDatabase;
let directory: string;

beforeEach(async () => {
  mkdirSync(join(process.cwd(), ".vitest"), { recursive: true });
  directory = mkdtempSync(join(process.cwd(), ".vitest/native598-matching-"));
  database = new AsyncSqliteDatabase(join(directory, "synthetic-history.sqlite"));
  // Deliberate prospective layout: production/current initializer is still
  // NOT NULL. This does NOT install or prove the separate native migration.
  await database.exec(`CREATE TABLE relationship_observations (
    id TEXT PRIMARY KEY, relationship_key TEXT NOT NULL, relationship_type TEXT NOT NULL,
    source_entity_id TEXT, target_entity_id TEXT NOT NULL, source_id TEXT, interpretation_id TEXT,
    observed_at TEXT, metadata TEXT, canonical_hash TEXT, provenance TEXT,
    source_priority INTEGER, specificity_score REAL, user_id TEXT
  )`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});
function row(
  index: number,
  p = presentation,
  target = targetA,
  extra: Record<string, unknown> = {}
) {
  const metadata = { ...p, expires_at: null, ...extra };
  return {
    id: `synthetic-${index.toString().padStart(5, "0")}`,
    relationship_key:
      "principal_binding:v1:" +
      hash([
        "principal-binding-v1",
        tenant,
        p.credential_kind,
        p.credential_value,
        p.credential_issuer,
        target,
      ]),
    relationship_type: "principal_binding",
    source_entity_id: null as string | null,
    target_entity_id: target,
    source_id: null,
    interpretation_id: null,
    observed_at: "2026-01-01T00:00:00.000Z",
    metadata: JSON.stringify(metadata),
    canonical_hash: hash(metadata),
    provenance: JSON.stringify({ synthetic_implementation_test: true, confidence: 0.76 }),
    source_priority: 100,
    specificity_score: 0.76,
    user_id: tenant,
  };
}
async function insert(value: ReturnType<typeof row>) {
  const keys = Object.keys(value);
  await database
    .prepare(
      `INSERT INTO relationship_observations (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
    )
    .run(Object.values(value));
}
const acquire = () =>
  collectOwnedPrincipalBindingCandidates(database, tenant, presentation, selectorFor());

describe("complete matching binding STORAGE acquisition, not authority", () => {
  it("returns only the verified-input tuple while retaining >50 versions, ends, expiry and all targets", async () => {
    for (let i = 0; i < 60; i++) await insert(row(i));
    await insert(row(60, presentation, targetB, { _deleted: true }));
    await insert(row(61, presentation, targetB, { expires_at: "2020-01-01T00:00:00Z" }));
    await insert(row(62, { ...presentation, credential_value: "SYNTHETIC_UNRELATED_SUBJECT" }));
    await insert(
      row(63, { ...presentation, credential_issuer: "https://other-synthetic.invalid" })
    );
    // Foreign-owner malformed history is outside this primitive's exact scope.
    await insert({ ...row(64), user_id: "synthetic-other-tenant", metadata: "not JSON" });
    const before = await database
      .prepare("SELECT count(*) AS n FROM relationship_observations")
      .get();
    const result = await acquire();
    expect(result.count).toBe(62);
    expect(result.complete).toBe(true);
    expect(result.projected_rows.map((r) => r.id)).toEqual(
      Array.from({ length: 62 }, (_, i) => row(i).id)
    );
    expect(new Set(result.projected_rows.map((r) => r.target_entity_id))).toEqual(
      new Set([targetA, targetB])
    );
    expect(result.canonical_json_utf8).not.toContain("SYNTHETIC_UNRELATED_SUBJECT");
    expect(result.canonical_json_utf8).not.toContain("other-synthetic.invalid");
    expect(result.projected_rows[60].metadata._deleted).toBe(true);
    expect(result.projected_rows[61].metadata.expires_at).toBe("2020-01-01T00:00:00Z");
    expect(result.projected_rows[0].specificity_score).toBe(0.76);
    expect(Object.keys(result).sort()).toEqual([
      "canonical_json_utf8",
      "complete",
      "count",
      "projected_rows",
      "recipe_version",
      "rows_sha256",
      "selector",
    ]);
    expect(result.canonical_json_utf8).toBe(
      canonicalStoreRequest(["native-readset-v2", selectorFor(), result.projected_rows])
    );
    expect(result.rows_sha256).toBe(
      hash(["native-readset-v2", selectorFor(), result.projected_rows])
    );
    expect(
      await database.prepare("SELECT count(*) AS n FROM relationship_observations").get()
    ).toEqual(before);
    expect(result).not.toHaveProperty("principal_id");
    expect(result).not.toHaveProperty("admitted");
  });
  it("enforces one existing transaction and snapshots the inputs while that transaction queues", async () => {
    await insert(row(0));
    const transaction = vi.spyOn(database, "transaction");
    const original = { ...presentation };
    const selector = selectorFor();
    const result = collectOwnedPrincipalBindingCandidates(database, tenant, original, selector);
    original.credential_value = "SYNTHETIC_MUTATED_CALLER_VALUE";
    selector.bindings.credential_key_sha256 = "0".repeat(64);
    expect((await result).count).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("proves storage absence only after complete scoped enumeration", async () => {
    await insert({ ...row(0), user_id: "synthetic-other-tenant" });
    const result = await acquire();
    expect(result.count).toBe(0);
    expect(result.projected_rows).toEqual([]);
    expect(result.canonical_json_utf8).toBe(
      canonicalStoreRequest(["native-readset-v2", selectorFor(), []])
    );
  });
  it("refuses another presentation's hash before any query", async () => {
    const prepare = vi.spyOn(database, "prepare");
    await expect(
      collectOwnedPrincipalBindingCandidates(
        database,
        tenant,
        presentation,
        selectorFor({ ...presentation, credential_value: "SYNTHETIC_FOREIGN_SUBJECT" })
      )
    ).rejects.toMatchObject({ dependency: "G17_binding_selector_mismatch" });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each(["legacy", "malformed-unrelated", "key-mismatch"])(
    "does not hide %s history before matching",
    async (kind) => {
      await insert(row(0));
      const value = row(1, { ...presentation, credential_value: "SYNTHETIC_UNRELATED_SUBJECT" });
      if (kind === "legacy") value.source_entity_id = targetA;
      if (kind === "malformed-unrelated")
        value.metadata = JSON.stringify({ credential_kind: "aauth_sub" });
      if (kind === "key-mismatch") value.relationship_key = "synthetic-wrong-key";
      await insert(value);
      await expect(acquire()).rejects.toMatchObject({
        code: "NATIVE_DEPENDENCY_UNAVAILABLE",
        dependency: "G17_binding_history_shape",
      });
    }
  );
  it.each([
    '{"credential_kind":"aauth_sub","credential_value":"first","credential_value":"second","credential_issuer":"synthetic","expires_at":null}',
    '{"credential_kind":"aauth_sub","credential_value":"first","credential_issuer":"synthetic","expires_at":null,"nested":{"a":1,"\\u0061":2}}',
    '{"credential_kind":"aauth_sub","credential_value":"first","credential_issuer":"synthetic","expires_at":null,"overflow":1e400}',
    "not JSON",
  ])("refuses ambiguous/nonfinite stored JSON without echoing raw contents", async (raw) => {
    await insert({ ...row(0), metadata: raw });
    const outcome = await acquire().then(
      () => null,
      (error: unknown) => error as Error & { code: string }
    );
    expect(outcome?.code).toBe("NATIVE_DEPENDENCY_UNAVAILABLE");
    expect(outcome?.message).not.toContain(raw);
    expect(outcome?.message).not.toContain("first");
  });
  it.each(["metadata", "provenance"] as const)(
    "refuses duplicate JSON names in %s before lossy parsing can admit matching data",
    async (column) => {
      const value = row(0);
      value[column] =
        column === "metadata"
          ? '{"credential_kind":"aauth_sub","credential_value":"SYNTHETIC_OTHER_SUBJECT","credential_value":"SYNTHETIC_MATCHING_SUBJECT","credential_issuer":"https://synthetic-issuer.invalid","expires_at":null}'
          : '{"nested":{"a":1,"\\u0061":2}}';
      await insert(value);
      await expect(acquire()).rejects.toMatchObject({ dependency: "G17_binding_history_shape" });
    }
  );
  it("bounds the entire internally scanned projection, including unrelated rows", async () => {
    await insert(row(0));
    await insert({
      ...row(1, { ...presentation, credential_value: "SYNTHETIC_UNRELATED_SUBJECT" }),
      provenance: JSON.stringify({ synthetic_blob: "x".repeat(1024 * 1024) }),
    });
    await expect(acquire()).rejects.toMatchObject({ dependency: "complete_readset_bound" });
  });
  it("refuses an over-bound population instead of selecting a convenient page", async () => {
    await database.transaction(async () => {
      for (let i = 0; i < 4097; i++) await insert(row(i));
    });
    await expect(acquire()).rejects.toMatchObject({ dependency: "complete_readset_bound" });
  });
  it("refuses missing storage and truncated/corrupt acquisition instead of returning complete absence", async () => {
    await insert(row(0));
    await insert(row(1));
    await database.transaction(async (tx) => {
      const truncated: DbConnection = {
        exec: tx.exec.bind(tx),
        prepare(sql) {
          const statement = tx.prepare(sql);
          return {
            run: statement.run.bind(statement),
            get: statement.get.bind(statement),
            all: async (...params) => (await statement.all(...params)).slice(0, 1),
          };
        },
      };
      // Fault-injected statement results inside a REAL existing transaction.
      // This adapter is a test seam, not a service-authority credential.
      const faulted = {
        transaction: async (fn: (value: DbConnection) => Promise<unknown>) => fn(truncated),
      } as DbDatabase;
      await expect(
        collectOwnedPrincipalBindingCandidates(faulted, tenant, presentation, selectorFor())
      ).rejects.toMatchObject({ dependency: "G17_binding_history_unavailable" });
    });
    await database.exec("DROP TABLE relationship_observations");
    await expect(acquire()).rejects.toMatchObject({
      dependency: "G17_binding_history_unavailable",
    });
  });
});

it("reuses input-only strict JSON1 validation with known SQLite state and finite values", async () => {
  await insert(row(0));
  const paths = await database.prepare("PRAGMA database_list").all();
  expect(
    paths.some(
      (p: any) => p.name === "main" && p.file === join(directory, "synthetic-history.sqlite")
    )
  ).toBe(true);
  expect(
    Number((await database.prepare("SELECT count(*) AS n FROM relationship_observations").get())?.n)
  ).toBe(1);
  const prepare = vi.spyOn(database, "prepare");
  expect(
    await decodeStrictJsonObject(database, '{"confidence":0.76,"negative_zero":-0,"exponent":1e-2}')
  ).toEqual({ confidence: 0.76, negative_zero: -0, exponent: 0.01 });
  for (const raw of [
    '{"a":1,"a":2}',
    '{"nested":{"a":1,"\\u0061":2}}',
    '{"a":1e400}',
    "not JSON",
    "[]",
  ])
    await expect(decodeStrictJsonObject(database, raw)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  expect(prepare.mock.calls.every(([sql]) => sql.includes("json_tree(?)"))).toBe(true);
  prepare.mockRestore();
  expect(
    Number((await database.prepare("SELECT count(*) AS n FROM relationship_observations").get())?.n)
  ).toBe(1);
});
