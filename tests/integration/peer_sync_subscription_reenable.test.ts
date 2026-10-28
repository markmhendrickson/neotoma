/**
 * Re-enabling a peer-sync subscription that was deactivated after repeated
 * delivery failures (for example by a sender on an older release whose peer
 * refused an entity type). The documented operator procedure is two
 * corrections on the subscription entity, `active: true` and
 * `consecutive_failures: 0`; the next index rebuild (server start, or
 * `list_subscriptions`) serves it again.
 */
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { createCorrection } from "../../src/services/correction.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  listSubscriptionsForUser,
  subscribeUser,
} from "../../src/services/subscriptions/subscription_actions.js";

const USER_ID = LOCAL_DEV_USER_ID;
const created: string[] = [];

async function correct(entityId: string, field: string, value: unknown, key: string) {
  await createCorrection({
    entity_id: entityId,
    entity_type: "subscription",
    field,
    value,
    schema_version: "1.0",
    user_id: USER_ID,
    idempotency_key: key,
  });
}

describe("re-enabling a deactivated peer-sync subscription", () => {
  afterAll(async () => {
    if (created.length === 0) return;
    await db.from("timeline_events").delete().in("entity_id", created);
    await db.from("entity_snapshots").delete().in("entity_id", created);
    await db.from("observations").delete().in("entity_id", created);
    await db.from("entities").delete().in("id", created);
  });

  it("serves the subscription again after active and consecutive_failures are corrected", async () => {
    const { subscription_id, entity_id } = await subscribeUser({
      userId: USER_ID,
      input: {
        entity_types: ["issue"],
        delivery_method: "webhook",
        webhook_url: "https://central.example/sync/webhook",
        sync_peer_id: "central-reenable-test",
      },
    });
    created.push(entity_id);
    const listed = async () =>
      (await listSubscriptionsForUser(USER_ID)).find((s) => s.subscription_id === subscription_id);

    // What the outbound delivery does after max_failures.
    await correct(entity_id, "consecutive_failures", 10, `reenable-test-fail:${entity_id}`);
    await correct(entity_id, "active", false, `reenable-test-deact:${entity_id}`);
    expect(await listed()).toBeUndefined();

    // The documented operator procedure.
    await correct(entity_id, "active", true, `reenable-test-act:${entity_id}`);
    await correct(entity_id, "consecutive_failures", 0, `reenable-test-reset:${entity_id}`);

    const again = await listed();
    expect(again?.active).toBe(true);
    expect(again?.consecutive_failures).toBe(0);
  });
});
