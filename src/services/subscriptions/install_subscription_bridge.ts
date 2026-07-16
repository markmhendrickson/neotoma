import { substrateEventBus } from "../../events/substrate_event_bus.js";
import { logger } from "../../utils/logger.js";
import { handleSubstrateEventForSubscriptions } from "./subscription_bridge.js";
import { rebuildSubscriptionIndex } from "./subscription_index.js";
import { pruneEventLog } from "./event_log.js";

let installed = false;

const EVENT_LOG_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export function installSubscriptionBridge(): void {
  if (installed) return;
  installed = true;
  void rebuildSubscriptionIndex();
  substrateEventBus.onSubstrateEvent((ev) => {
    void handleSubstrateEventForSubscriptions(ev);
  });

  // Durable event-log retention (#1464 Tier 2): prune on startup and on a slow
  // interval. Best-effort — a prune failure must never affect delivery.
  const runPrune = (): void => {
    void pruneEventLog()
      .then((removed) => {
        if (removed > 0) logger.info("[subscriptions] pruned durable event log", { removed });
      })
      .catch((err: unknown) => {
        logger.warn("[subscriptions] event-log prune failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
  };
  runPrune();
  const timer = setInterval(runPrune, EVENT_LOG_PRUNE_INTERVAL_MS);
  // Do not keep the process alive solely for pruning.
  if (typeof timer.unref === "function") timer.unref();
}
