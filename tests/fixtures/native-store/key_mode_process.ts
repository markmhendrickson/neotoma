/** Owned test process; no application configuration or hosted connections. */
import { AsyncSqliteDatabase } from "../../../src/repositories/sqlite/sqlite_driver.js";
import { openLibsqlDatabase } from "../../../src/repositories/libsql/libsql_driver.js";
import {
  commitConditionalStoreKey,
  reserveLegacyStoreKeys,
} from "../../../src/services/store_condition_keys.js";
const [backend, file, mode] = process.argv.slice(2);
if (!file || !["sqlite", "libsql"].includes(backend) || !["legacy", "conditional"].includes(mode))
  throw Error("Invalid synthetic fixture arguments");
const database =
  backend === "sqlite" ? new AsyncSqliteDatabase(file) : openLibsqlDatabase(`file:${file}`);
await database.pragma("busy_timeout = 5000");
process.send?.({ ready: true });
await new Promise<void>((resolve) => process.once("message", () => resolve()));
try {
  if (mode === "legacy") {
    await reserveLegacyStoreKeys(database, "synthetic-owner", ["race-key"]);
    process.send?.({ mode, applied: true });
  } else {
    const receipt = await commitConditionalStoreKey(database, {
      owner: "synthetic-owner",
      key: "race-key",
      request: { entity: "SYNTHETIC", actor: "SYNTHETIC" },
      apply: async (tx, fingerprint) => {
        await tx.prepare("INSERT INTO effect VALUES ('RACE','original')").run();
        return {
          version: 1,
          status: "applied",
          request_fingerprint: fingerprint,
          source_id: "SOURCE",
          entity_id: "RACE",
          entity_type: "synthetic",
          observation_id: "OBS",
          schema_identity_digest: "SCHEMA",
          unknown_fields_count: 0,
          diagnostics: {},
        };
      },
      verify: async (tx, original) => {
        const row = (await tx
          .prepare("SELECT original FROM effect WHERE id = ?")
          .get(original.entity_id)) as { original?: string } | undefined;
        if (row?.original !== "original") throw Error("Synthetic original receipt mismatch");
      },
    });
    process.send?.({ mode, applied: true, status: receipt.status });
  }
} catch (error) {
  if ((error as { code?: string }).code !== "STORE_KEY_MODE_CONFLICT") throw error;
  process.send?.({ mode, applied: false, code: "STORE_KEY_MODE_CONFLICT" });
} finally {
  await database.close();
  process.disconnect?.();
}
