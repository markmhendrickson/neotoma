/**
 * Singleton in-process bus for post-write substrate events (Phase 1 nervous system).
 * Listeners MUST NOT throw into the write path — errors are logged only.
 */

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { getEmbeddedRuntimeContext } from "../core/runtime_context.js";

import { logger } from "../utils/logger.js";
import type { SubstrateEvent } from "./types.js";

const CHANNEL = "substrate_event" as const;

function stableEventId(payload: Omit<SubstrateEvent, "event_id">): string {
  const parts = [
    payload.event_type,
    payload.user_id,
    payload.entity_id,
    payload.entity_type,
    payload.observation_id ?? "",
    payload.relationship_type ?? "",
    payload.source_entity_id ?? "",
    payload.target_entity_id ?? "",
    payload.action,
    payload.source_id ?? "",
    payload.idempotency_key ?? "",
    payload.agent_thumbprint ?? "",
    payload.observation_source ?? "",
    payload.source_peer_id ?? "",
    (payload.fields_changed ?? []).join("\0"),
    payload.timestamp,
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 40);
}

class SubstrateEventBus extends EventEmitter {
  /**
   * Deliver one event to all `substrate_event` listeners; swallow listener errors.
   */
  emitSubstrateEvent(partial: Omit<SubstrateEvent, "event_id">): void {
    const event_id = stableEventId(partial);
    const payload: SubstrateEvent = { ...partial, event_id };
    const listeners = this.listeners(CHANNEL) as Array<(ev: SubstrateEvent) => void>;
    for (const fn of listeners) {
      try {
        fn(payload);
      } catch (err) {
        logger.error("[substrate_event_bus] listener threw", {
          event_type: payload.event_type,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  onSubstrateEvent(listener: (ev: SubstrateEvent) => void): this {
    return super.on(CHANNEL, listener);
  }
}

const legacyEventBus = new SubstrateEventBus();
const runtimeEventBuses = new WeakMap<object, SubstrateEventBus>();
let legacyDebugInitialized = false;

function currentEventBus(): SubstrateEventBus {
  const runtime = getEmbeddedRuntimeContext();
  if (runtime) {
    let bus = runtimeEventBuses.get(runtime);
    if (!bus) {
      bus = new SubstrateEventBus();
      runtimeEventBuses.set(runtime, bus);
    }
    return bus;
  }
  if (!legacyDebugInitialized) {
    legacyDebugInitialized = true;
    if (process.env.NEOTOMA_DEBUG_SUBSTRATE_EVENTS === "1") {
      legacyEventBus.onSubstrateEvent((ev) => {
        logger.debug("[substrate_event]", {
          event_id: ev.event_id,
          event_type: ev.event_type,
          entity_id: ev.entity_id,
          entity_type: ev.entity_type,
          action: ev.action,
        });
      });
    }
  }
  return legacyEventBus;
}

// Resolve at invocation, including a saved method reference. Returning the
// facade from chaining methods prevents retaining a runtime's underlying bus.
export const substrateEventBus: SubstrateEventBus = new Proxy(legacyEventBus, {
  get(_target, key) {
    const value = Reflect.get(currentEventBus(), key);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      const bus = currentEventBus();
      const result: unknown = Reflect.apply(Reflect.get(bus, key), bus, args);
      return result === bus ? substrateEventBus : result;
    };
  },
});

if (!getEmbeddedRuntimeContext()) currentEventBus();
