/** Native key arbitration only: transport/store adoption is tested separately. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { STORE_CONDITION_KEYS_SCHEMA } from "../../src/repositories/db/store_condition_schema.js";
import {
  commitConditionalStoreKey,
  reserveLegacyStoreKeys,
  storeConditionKeyHash,
  type ConditionalOperationReceipt,
} from "../../src/services/store_condition_keys.js";
const directory = mkdtempSync(path.join(tmpdir(), "store-key-arbitration-"));
const connections: DbDatabase[] = [];
let serial = 0;
afterAll(async () => {
  for (const db of connections) await db.close();
  rmSync(directory, { recursive: true, force: true });
});
async function fixture(backend: "sqlite" | "libsql") {
  const name = path.join(directory, `${backend}-${++serial}.db`);
  const db =
    backend === "sqlite" ? new AsyncSqliteDatabase(name) : openLibsqlDatabase(`file:${name}`);
  connections.push(db);
  await db.exec(STORE_CONDITION_KEYS_SCHEMA);
  await db.exec(
    "CREATE TABLE sources (id TEXT PRIMARY KEY,user_id TEXT,idempotency_key TEXT); CREATE TABLE effect (id TEXT PRIMARY KEY,original TEXT)"
  );
  return db;
}
function operation(db: DbDatabase, overrides: Record<string, unknown> = {}) {
  return {
    owner: "synthetic-owner",
    key: "key",
    request: {
      owner: "synthetic-owner",
      entities: [{ entity_type: "synthetic", code: "ONE" }],
      condition: true,
      actor: { id: "ACTOR" },
    },
    apply: async (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
      fingerprint: string
    ): Promise<ConditionalOperationReceipt> => {
      // Physical absence is checked by the production conditional handler. This
      // test callback exercises transaction rollback/receipt ownership, not that handler.
      await tx.prepare("INSERT INTO effect VALUES ('ONE','original')").run();
      return {
        version: 1,
        status: "applied",
        request_fingerprint: fingerprint,
        source_id: "SOURCE",
        entity_id: "ONE",
        entity_type: "synthetic",
        observation_id: "OBS",
        schema_identity_digest: "SCHEMA",
        unknown_fields_count: 0,
        diagnostics: {},
      };
    },
    verify: async (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
      original: ConditionalOperationReceipt
    ) => {
      expect(
        await tx.prepare("SELECT original FROM effect WHERE id = ?").get(original.entity_id)
      ).toEqual({ original: "original" });
    },
    ...overrides,
  } as Parameters<typeof commitConditionalStoreKey>[1];
}
describe.each(["sqlite", "libsql"] as const)("native store-key modes (%s)", (backend) => {
  it("replays the original marked receipt without a second business effect", async () => {
    const db = await fixture(backend),
      args = operation(db);
    const applied = await commitConditionalStoreKey(db, args);
    const replayed = await commitConditionalStoreKey(db, {
      ...args,
      apply: async () => {
        throw Error("Replay must not apply");
      },
    });
    expect(replayed).toEqual({ ...applied, status: "replayed" });
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({ n: 1 });
  });
  it("refuses changed request actor before any effect", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await commitConditionalStoreKey(db, args);
    await expect(
      commitConditionalStoreKey(db, {
        ...args,
        request: { ...(args.request as object), actor: { id: "OTHER" } },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
  });
  it("prevents conditional-to-legacy reuse and rolls back a combined-key claim", async () => {
    const db = await fixture(backend);
    await commitConditionalStoreKey(db, operation(db));
    await expect(
      reserveLegacyStoreKeys(db, "synthetic-owner", ["second", "key"])
    ).rejects.toMatchObject({ code: "STORE_KEY_MODE_CONFLICT" });
    expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({ n: 1 });
  });
  it("preserves legacy mode without pinning a failed legacy payload", async () => {
    const db = await fixture(backend);
    await reserveLegacyStoreKeys(db, "synthetic-owner", [" ", "long-" + "x".repeat(3000)]);
    await reserveLegacyStoreKeys(db, "synthetic-owner", [" "]);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM store_condition_keys WHERE mode='legacy' AND request_hash IS NULL"
        )
        .get()
    ).toEqual({ n: 2 });
    await expect(commitConditionalStoreKey(db, operation(db, { key: " " }))).rejects.toMatchObject({
      code: "STORE_KEY_MODE_CONFLICT",
    });
  });
  it("recognizes a pre-migration source and isolates owners", async () => {
    const db = await fixture(backend);
    await db.prepare("INSERT INTO sources VALUES ('OLD','synthetic-owner','key')").run();
    await expect(commitConditionalStoreKey(db, operation(db))).rejects.toMatchObject({
      code: "STORE_KEY_MODE_CONFLICT",
    });
    const result = await commitConditionalStoreKey(
      db,
      operation(db, { owner: "other-owner", request: { owner: "other-owner" } })
    );
    expect(result.status).toBe("applied");
  });
  it("rolls back mode and business rows when apply or receipt verification fails", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await expect(
      commitConditionalStoreKey(db, {
        ...args,
        verify: async () => {
          throw Error("Invalid original provenance");
        },
      })
    ).rejects.toThrow("Invalid original provenance");
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 0 });
    expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({ n: 0 });
    expect((await commitConditionalStoreKey(db, args)).status).toBe("applied");
  });
  it("refuses a missing receipt rather than treating uncertainty as absence", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await commitConditionalStoreKey(db, args);
    await db.prepare("UPDATE store_condition_keys SET conditional_receipt=NULL").run();
    await expect(commitConditionalStoreKey(db, args)).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
  });
  it("refuses corrupted immutable original values even if current mode says replay", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await commitConditionalStoreKey(db, args);
    await db.prepare("UPDATE effect SET original='changed'").run();
    await expect(commitConditionalStoreKey(db, args)).rejects.toThrow();
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
  });
});
it("hashes exact UTF-8 keys without trimming or imposing an invented maximum", () => {
  expect(storeConditionKeyHash(" ")).not.toBe(storeConditionKeyHash("  "));
  expect(storeConditionKeyHash("x".repeat(2000))).toMatch(/^[a-f0-9]{64}$/);
  expect(() => storeConditionKeyHash("")).toThrow();
});
