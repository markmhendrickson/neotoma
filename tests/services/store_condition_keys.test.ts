/** Native key arbitration only: transport/store adoption is tested separately. */
import { mkdtempSync, rmSync } from "node:fs";
import { fork } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { STORE_CONDITION_KEYS_SCHEMA } from "../../src/repositories/db/store_condition_schema.js";
import {
  canonicalStoreRequest,
  commitConditionalStoreKey,
  assertConditionalEntityAbsent,
  reserveLegacyStoreKeys,
  storeConditionKeyHash,
  storeConditionKeyIdentity,
  storeConditionObservationKey,
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
  it("matches 121 actual source-column key comparisons, including parsed Unicode and long keys", async () => {
    const db = await fixture(backend);
    const keys = JSON.parse(
      JSON.stringify([
        "\ud800",
        "\ud801",
        "\ufffd",
        "😀",
        "é",
        "e\u0301",
        " ",
        "  ",
        "long-" + "x".repeat(4000),
        "KEY",
        "key",
      ])
    ) as string[];
    for (let i = 0; i < keys.length; i++)
      await db
        .prepare("INSERT INTO sources VALUES (?,?,?)")
        .run(String(i), "synthetic-owner", keys[i]);
    const identities = await db.transaction((tx) =>
      Promise.all(keys.map((key) => storeConditionKeyIdentity(tx, key)))
    );
    for (let i = 0; i < keys.length; i++)
      for (let j = 0; j < keys.length; j++) {
        const actual = (await db
          .prepare(
            "SELECT COUNT(*) n FROM sources WHERE id = ? AND user_id = ? AND idempotency_key = ?"
          )
          .get(String(i), "synthetic-owner", keys[j])) as { n: number };
        expect(identities[i].keyHash === identities[j].keyHash).toBe(actual.n === 1);
        expect(identities[i].identityHash === identities[j].identityHash).toBe(actual.n === 1);
        expect(
          storeConditionObservationKey("synthetic-owner", identities[i]) ===
            storeConditionObservationKey("synthetic-owner", identities[j])
        ).toBe(actual.n === 1);
      }
  });
  it.each([
    ["\ud800", "\ud801"],
    ["\ud801", "\ud800"],
    ["\ud800", "\ufffd"],
    ["\ufffd", "\ud800"],
    ["\ud801", "\ufffd"],
    ["\ufffd", "\ud801"],
  ])("binds actual native equality for escaped surrogate pair %j/%j", async (a, b) => {
    const db = await fixture(backend);
    await db.prepare("INSERT INTO sources VALUES ('A','synthetic-owner',?)").run(a);
    const actual = (await db
      .prepare("SELECT COUNT(*) n FROM sources WHERE id='A' AND idempotency_key=?")
      .get(b)) as { n: number };
    const [left, right] = await db.transaction((tx) =>
      Promise.all([storeConditionKeyIdentity(tx, a), storeConditionKeyIdentity(tx, b)])
    );
    expect(left.keyHash === right.keyHash).toBe(actual.n === 1);
  });
  it("refuses a forced primary hash collision or missing secondary proof before apply/claim", async () => {
    const db = await fixture(backend);
    const identity = await db.transaction((tx) => storeConditionKeyIdentity(tx, "key"));
    await db
      .prepare(
        "INSERT INTO store_condition_keys(user_id,key_hash,key_identity_hash,mode,request_hash,created_at,conditional_receipt) VALUES (?,?,?,'legacy',NULL,'synthetic',NULL)"
      )
      .run("synthetic-owner", identity.keyHash, "f".repeat(128));
    const before = await db.prepare("SELECT * FROM store_condition_keys").all();
    await expect(commitConditionalStoreKey(db, operation(db))).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
    await expect(
      reserveLegacyStoreKeys(db, "synthetic-owner", ["key", "another"])
    ).rejects.toMatchObject({ code: "STORE_RECEIPT_UNCERTAIN" });
    expect(await db.prepare("SELECT * FROM store_condition_keys").all()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 0 });
    await db.prepare("UPDATE store_condition_keys SET key_identity_hash=''").run();
    await expect(commitConditionalStoreKey(db, operation(db))).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
  });
  it("never replays an applied receipt whose secondary key identity differs", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await commitConditionalStoreKey(db, args);
    await db.prepare("UPDATE store_condition_keys SET key_identity_hash=?").run("f".repeat(128));
    const before = await db.prepare("SELECT * FROM store_condition_keys").all();
    await expect(commitConditionalStoreKey(db, args)).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
    expect(await db.prepare("SELECT * FROM store_condition_keys").all()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
  });
  it("refuses unsupported source collation before mode or business effects", async () => {
    const db = await fixture(backend);
    await db.exec(
      "DROP TABLE sources;CREATE TABLE sources(id TEXT PRIMARY KEY,user_id TEXT,idempotency_key TEXT COLLATE NOCASE)"
    );
    await expect(commitConditionalStoreKey(db, operation(db))).rejects.toMatchObject({
      code: "STORE_RECEIPT_UNCERTAIN",
    });
    expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({ n: 0 });
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 0 });
  });
  it("uses native aliases for replay and opposite-mode refusal without pinning raw key spelling", async () => {
    const db = await fixture(backend);
    const args = operation(db, { key: "\ud800" });
    const original = await commitConditionalStoreKey(db, args);
    const actual = await db.transaction(async (tx) => {
      const a = await storeConditionKeyIdentity(tx, "\ud800"),
        b = await storeConditionKeyIdentity(tx, "\ud801");
      return a.keyHash === b.keyHash;
    });
    if (actual) {
      expect((await commitConditionalStoreKey(db, { ...args, key: "\ud801" })).status).toBe(
        "replayed"
      );
      await expect(reserveLegacyStoreKeys(db, "synthetic-owner", ["\ud801"])).rejects.toMatchObject(
        { code: "STORE_KEY_MODE_CONFLICT" }
      );
    } else {
      await reserveLegacyStoreKeys(db, "synthetic-owner", ["\ud801"]);
      expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({
        n: 2,
      });
    }
    await expect(
      commitConditionalStoreKey(db, { ...args, request: { changed: true } })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await commitConditionalStoreKey(db, args)).observation_id).toBe(
      original.observation_id
    );
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 1 });
  });
  it("arbitrates legacy and conditional modes across separate native processes", async () => {
    const db = await fixture(backend);
    // fixture() owns the current serial's file; children open independent handles.
    const file = path.join(directory, `${backend}-${serial}.db`);
    await db.pragma("journal_mode = WAL");
    const states: Array<{ mode: string; applied: boolean; code?: string }> = [];
    const workers = ["legacy", "conditional"].map((mode) => {
      const child = fork(
        path.resolve("tests/fixtures/native-store/key_mode_process.ts"),
        [backend, file, mode],
        {
          execArgv: ["--import", "tsx"],
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS },
        }
      );
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const ready = new Promise<void>((resolve, reject) => {
        child.once("message", (message) => {
          if ((message as { ready?: boolean }).ready) resolve();
          else reject(Error("Missing ready witness"));
        });
        child.once("error", reject);
      });
      const finished = new Promise<void>((resolve, reject) => {
        child.on("message", (message) => {
          if ("mode" in (message as object)) states.push(message as (typeof states)[number]);
        });
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(Error(`Owned race child failed (${code}): ${stderr}`))
        );
        child.once("error", reject);
      });
      return { child, ready, finished };
    });
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      for (const worker of workers) worker.child.send("go");
      await Promise.all(workers.map((worker) => worker.finished));
      expect(states).toHaveLength(2);
      expect(states.filter((row) => row.applied)).toHaveLength(1);
      expect(states.filter((row) => !row.applied)).toEqual([
        expect.objectContaining({ code: "STORE_KEY_MODE_CONFLICT" }),
      ]);
      const winning = states.find((row) => row.applied)!;
      expect(await db.prepare("SELECT mode FROM store_condition_keys").get()).toEqual({
        mode: winning.mode,
      });
      expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({
        n: winning.mode === "conditional" ? 1 : 0,
      });
    } finally {
      for (const worker of workers)
        if (worker.child.exitCode === null) worker.child.kill("SIGKILL");
    }
  }, 15000);
  it("refuses physical live/deleted/merged/unowned identities and foreign owners", async () => {
    const db = await fixture(backend);
    await db.exec("CREATE TABLE entities (id TEXT PRIMARY KEY,user_id TEXT,lifecycle TEXT)");
    for (const [id, owner, state] of [
      ["LIVE", "synthetic-owner", "live"],
      ["DELETED", "synthetic-owner", "deleted"],
      ["MERGED", "synthetic-owner", "merged"],
      ["UNOWNED", null, "live"],
      ["FOREIGN", "other-owner", "live"],
    ]) {
      await db.prepare("INSERT INTO entities VALUES (?,?,?)").run(id, owner, state);
      await expect(
        db.transaction((tx) =>
          assertConditionalEntityAbsent(tx, {
            owner: "synthetic-owner",
            entityId: id!,
            entityType: "synthetic",
          })
        )
      ).rejects.toMatchObject({ code: id === "FOREIGN" ? "entity_owner_conflict" : "CONFLICT" });
    }
    await db.transaction((tx) =>
      assertConditionalEntityAbsent(tx, {
        owner: "synthetic-owner",
        entityId: "ABSENT",
        entityType: "synthetic",
      })
    );
    expect(await db.prepare("SELECT COUNT(*) n FROM entities").get()).toEqual({ n: 5 });
  });
  it("fresh authoritative refusal occurs before a mode claim, replay skips fresh-only guards", async () => {
    const db = await fixture(backend),
      args = operation(db);
    await expect(
      commitConditionalStoreKey(db, {
        ...args,
        beforeClaim: async (tx) => {
          expect(await tx.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({
            n: 0,
          });
          throw Error("Synthetic pure schema refusal");
        },
      })
    ).rejects.toThrow("Synthetic pure schema refusal");
    expect(await db.prepare("SELECT COUNT(*) n FROM store_condition_keys").get()).toEqual({ n: 0 });
    expect(await db.prepare("SELECT COUNT(*) n FROM effect").get()).toEqual({ n: 0 });
    await commitConditionalStoreKey(db, args);
    expect(
      (
        await commitConditionalStoreKey(db, {
          ...args,
          beforeClaim: async () => {
            throw Error("Replay cannot become a fresh write");
          },
        })
      ).status
    ).toBe("replayed");
  });
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
it("rejects sparse, nonplain, cyclic, accessor and undefined requests before effects", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      throw Error("Accessor must not execute");
    },
  });
  for (const bad of [
    new Array(1),
    new Date(),
    { value: undefined },
    { value: Infinity },
    cyclic,
    accessor,
    { value: Symbol("synthetic") },
  ])
    expect(() => canonicalStoreRequest(bad)).toThrow("finite plain JSON");
  expect(canonicalStoreRequest(JSON.parse('{"b":[null,true,1],"a":"synthetic"}'))).toBe(
    '{"a":"synthetic","b":[null,true,1]}'
  );
});
