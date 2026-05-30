import { logger } from "../../utils/logger.js";
import type { SubstrateEvent } from "../../events/types.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "./seed_schema.js";
import { listAllSubscriptions, refreshSubscriptionInIndex } from "./subscription_index.js";
import { subscriptionMatchesEvent } from "./subscription_types.js";
import { queueWebhookDelivery } from "./webhook_delivery.js";
import { broadcastSubstrateEventToSse, pushSubstrateEventToRing } from "./sse_hub.js";
import { persistSubstrateEvent } from "./event_log.js";
import { queuePeerSyncDelivery } from "../sync/sync_webhook_outbound.js";

export async function handleSubstrateEventForSubscriptions(event: SubstrateEvent): Promise<void> {
  try {
    // Durable log (#1464 Tier 2): persist synchronously FIRST so the durable
    // monotonic `seq` becomes the event's id everywhere — ring, SSE frame, and
    // client Last-Event-ID. That id survives restarts (the in-memory ring's own
    // counter resets), which is what makes resume restart-safe. A log failure
    // must never break delivery, so fall back to the ring's own id.
    let durableSeq: number | null = null;
    try {
      durableSeq = persistSubstrateEvent(event, null);
    } catch (err) {
      logger.warn("[subscriptions] durable event persist failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // Use the durable seq as the ring id when available; otherwise fall back to
    // the ring's internal counter so delivery still works.
    const ringId =
      durableSeq !== null
        ? pushSubstrateEventToRing(event, String(durableSeq))
        : pushSubstrateEventToRing(event);
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
