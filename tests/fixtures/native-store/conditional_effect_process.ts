/** Owned synthetic process fixture: an independent native connection, never hosted. */
import { getDb } from "../../../src/repositories/db/connection.js";
import { db } from "../../../src/db.js";
import { storeConditionalStructured } from "../../../src/services/store_conditional.js";
import { NeotomaServer } from "../../../src/server.js";
import { storeStructuredForApi } from "../../../src/actions.js";
import { substrateEventBus } from "../../../src/events/substrate_event_bus.js";
const [owner, mode, key, code, status] = process.argv.slice(2);
const database = await getDb();
let emitted = 0;
async function nativeState() {
  return {
    sources: await database
      .prepare("SELECT id,content_hash,idempotency_key FROM sources WHERE user_id=? ORDER BY id")
      .all(owner),
    receipts: await database
      .prepare(
        "SELECT key_hash,mode,request_hash,conditional_receipt FROM store_condition_keys WHERE user_id=? ORDER BY key_hash"
      )
      .all(owner),
    observations: await database
      .prepare(
        "SELECT id,source_id,fields,idempotency_key FROM observations WHERE user_id=? ORDER BY id"
      )
      .all(owner),
  };
}
substrateEventBus.onSubstrateEvent(() => {
  emitted++;
});
if (mode.startsWith("paused-legacy")) {
  // Pause the actual MCP legacy call at its first source replay lookup,
  // AFTER its mode precheck and BEFORE raw storage's authoritative claim.
  const originalFrom = db.from.bind(db);
  let paused = false;
  db.from = (table: string) => {
    const builder = originalFrom(table);
    if (table === "sources" && !paused) {
      paused = true;
      const originalMaybeSingle = builder.maybeSingle.bind(builder);
      builder.maybeSingle = async () => {
        const priorSource = await originalMaybeSingle();
        process.send?.({ ready: true });
        await new Promise<void>((resolve) => process.once("message", () => resolve()));
        return priorSource;
      };
    }
    return builder;
  };
} else {
  process.send?.({ ready: true });
  await new Promise<void>((resolve) => process.once("message", () => resolve()));
}
try {
  const entities = [{ entity_type: "conditional_process_test", code, status }];
  const result =
    mode === "conditional"
      ? await storeConditionalStructured({
          userId: owner,
          idempotencyKey: key,
          sourcePriority: 100,
          entities,
        })
      : mode === "paused-legacy-api"
        ? await storeStructuredForApi({
            userId: owner,
            idempotencyKey: key,
            sourcePriority: 100,
            entities,
          })
        : JSON.parse(
            (
              await new NeotomaServer().executeToolForCli(
                "store",
                { idempotency_key: key, entities, expected_entity_absent: false },
                owner
              )
            ).content[0].text
          );
  process.send?.({
    applied: true,
    emitted,
    receipt: result.operation_receipt ?? null,
    native_state: await nativeState(),
  });
} catch (error) {
  const code = (error as { code?: string }).code;
  process.send?.({ applied: false, emitted, code, native_state: await nativeState() });
} finally {
  await database.close();
  process.disconnect?.();
}
