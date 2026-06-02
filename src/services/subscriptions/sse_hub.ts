import type { Response } from "express";

import { logger } from "../../utils/logger.js";
import type { SubstrateEvent } from "../../events/types.js";
import type { SubscriptionRecord } from "./subscription_types.js";
import { subscriptionMatchesEvent } from "./subscription_types.js";

const BUFFER_CAP = Math.min(
  10_000,
  Math.max(100, parseInt(process.env.NEOTOMA_SSE_EVENT_BUFFER ?? "1000", 10) || 1000)
);

type RingEntry = { id: string; event: SubstrateEvent };
const ring: RingEntry[] = [];
let seq = 0n;

export function pushSubstrateEventToRing(event: SubstrateEvent): string {
  seq += 1n;
  const id = seq.toString();
  ring.push({ id, event });
  while (ring.length > BUFFER_CAP) {
    ring.shift();
  }
  return id;
}

export interface SseClient {
  userId: string;
  subscription: SubscriptionRecord;
  res: Response;
  lastEventId: string | undefined;
}

const clients: SseClient[] = [];

export function registerSseClient(client: SseClient): () => void {
  clients.push(client);
  return () => {
    const i = clients.indexOf(client);
    if (i >= 0) clients.splice(i, 1);
  };
}

export function broadcastSubstrateEventToSse(event: SubstrateEvent, eventRingId: string): void {
  for (const c of clients) {
    if (c.subscription.delivery_method !== "sse") continue;
    if (!subscriptionMatchesEvent(c.subscription, event)) continue;
    try {
      c.res.write(`id: ${eventRingId}\n`);
      c.res.write(`event: ${event.event_type}\n`);
      c.res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      logger.warn("[subscriptions] sse write failed", {
        subscription_id: c.subscription.subscription_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function replayRingAfterLastId(
  lastEventId: string | undefined,
  filter: (ev: SubstrateEvent) => boolean
): void {
  const startIdx = lastEventId === undefined ? 0 : ring.findIndex((e) => e.id === lastEventId) + 1;
  const from = startIdx < 0 ? 0 : startIdx;
  for (let i = from; i < ring.length; i++) {
    const e = ring[i]!;
    if (filter(e.event)) {
      // Caller writes to res
      void e;
    }
  }
}

export function getRingEntriesAfter(
  lastEventId: string | undefined,
  filter: (ev: SubstrateEvent) => boolean
): RingEntry[] {
  const startIdx = lastEventId === undefined ? 0 : ring.findIndex((e) => e.id === lastEventId) + 1;
  const from = startIdx < 0 ? 0 : startIdx;
  const out: RingEntry[] = [];
  for (let i = from; i < ring.length; i++) {
    const e = ring[i]!;
    if (filter(e.event)) out.push(e);
  }
  return out;
}

/**
 * Result of a resume attempt against the in-memory ring.
 *
 * `gap_detected` is true when the caller supplied a `lastEventId` that is no
 * longer present in the ring — i.e. it was evicted past the buffer cap, or the
 * server restarted (the ring is in-memory and does not survive a restart). In
 * that case the entries returned are the full filtered buffer from its current
 * head, NOT a true continuation from the requested cursor. A consumer that
 * needs gap-free delivery (e.g. a projection into an external index) must treat
 * a gap as "reconcile via a full read" rather than trusting the replayed slice.
 *
 * When `lastEventId` is undefined (a fresh subscriber) `gap_detected` is false:
 * there is no prior position to have missed.
 */
export interface RingResumeResult {
  entries: RingEntry[];
  gap_detected: boolean;
  /** The newest ring id at read time, or null when the ring is empty. */
  latest_ring_id: string | null;
}

export function resumeRingAfter(
  lastEventId: string | undefined,
  filter: (ev: SubstrateEvent) => boolean
): RingResumeResult {
  const latestRingId = ring.length > 0 ? ring[ring.length - 1]!.id : null;

  if (lastEventId === undefined) {
    return {
      entries: getRingEntriesAfter(undefined, filter),
      gap_detected: false,
      latest_ring_id: latestRingId,
    };
  }

  const idx = ring.findIndex((e) => e.id === lastEventId);
  if (idx === -1) {
    // Cursor not in the ring: evicted past the cap or lost to a restart.
    // Resume from the current head but flag the gap so the consumer can
    // reconcile rather than silently trust a discontinuous slice.
    return {
      entries: getRingEntriesAfter(undefined, filter),
      gap_detected: true,
      latest_ring_id: latestRingId,
    };
  }

  return {
    entries: getRingEntriesAfter(lastEventId, filter),
    gap_detected: false,
    latest_ring_id: latestRingId,
  };
}
