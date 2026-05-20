import { logger } from "../../utils/logger.js";
import type { SubstrateEvent } from "../../events/types.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "./seed_schema.js";
import { listAllSubscriptions, refreshSubscriptionInIndex } from "./subscription_index.js";
import { subscriptionMatchesEvent } from "./subscription_types.js";
import { queueWebhookDelivery } from "./webhook_delivery.js";
import { broadcastSubstrateEventToSse, pushSubstrateEventToRing } from "./sse_hub.js";
import { queuePeerSyncDelivery } from "../sync/sync_webhook_outbound.js";

export async function handleSubstrateEventForSubscriptions(event: SubstrateEvent): Promise<void> {
  try {
    const ringId = pushSubstrateEventToRing(event);
    broadcastSubstrateEventToSse(event, ringId);

    if (event.entity_type === SUBSCRIPTION_ENTITY_TYPE) {
      await refreshSubscriptionInIndex(event.entity_id);
      return;
    }

    for (const sub of listAllSubscriptions()) {
      if (!subscriptionMatchesEvent(sub, event)) continue;
      if (sub.delivery_method === "webhook") {
        if (sub.sync_peer_id) {
          queuePeerSyncDelivery(sub, event);
          continue;
        }
        queueWebhookDelivery(sub, event);
      }
    }
  } catch (err) {
    logger.error("[subscriptions] bridge handler error", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
