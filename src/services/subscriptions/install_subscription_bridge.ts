import { substrateEventBus } from "../../events/substrate_event_bus.js";
import { logger } from "../../utils/logger.js";
import { handleSubstrateEventForSubscriptions } from "./subscription_bridge.js";
import { rebuildSubscriptionIndex } from "./subscription_index.js";
import { pruneEventLog } from "./event_log.js";

let installed = false;

const EVENT_LOG_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Whether a *persisting* substrate-event listener has been registered in this
 * process (#2326).
 *
 * Counting raw bus listeners is not sufficient: the
 * `NEOTOMA_DEBUG_SUBSTRATE_EVENTS=1` listener registered in
 * `substrate_event_bus.ts` would satisfy a naive count while persisting
 * nothing. This flag tracks the bridge specifically.
 */
export function isSubscriptionBridgeInstalled(): boolean {
  return installed;
}

/**
 * Assert that this process will actually persist substrate events, and fail
 * loudly when it will not (#2326).
 *
 * Why throw rather than warn: the MCP stdio entrypoint suppresses logging to
 * protect JSON-RPC framing, so a warning there is functionally identical to
 * the silence this assertion exists to remove. The failure mode being closed
 * is that "no listener" and "healthy" are indistinguishable — events are
 * emitted into a bus with no persisting listener, `pushSubstrateEventToRing`
 * is never called, and subscription resume has no durable floor.
 *
 * This is a *startup wiring* assertion, not a per-event delivery guarantee.
 * `philosophy.md` §5.9 bars the substrate from adding retry queues,
 * dead-letter queues, delivery acks, ordering, or exactly-once semantics;
 * asserting once that the wire exists stays clear of that line. Reacting to a
 * runtime persist failure by retrying would cross it — do not.
 *
 * Escape hatch for embedded/library use: `NEOTOMA_ALLOW_NO_EVENT_LISTENER=1`.
 * Tests that construct `NeotomaServer` directly are unaffected without it,
 * because the assertion lives in the entrypoints rather than the constructor.
 */
export function assertSubstrateListenerInstalled(): void {
  if (installed) return;
  if (process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER === "1") return;
  throw new Error(
    "[subscriptions] No persisting substrate-event listener is registered. " +
      "Every substrate event in this process would be emitted into a bus with " +
      "no listener and silently discarded, leaving subscription resume with no " +
      "durable log. Call installSubscriptionBridge() during startup, after " +
      "initDatabase(). Set NEOTOMA_ALLOW_NO_EVENT_LISTENER=1 for embedded use " +
      "that deliberately has no subscriptions."
  );
}

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
