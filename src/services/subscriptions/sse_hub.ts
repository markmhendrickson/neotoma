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

export function pushSubstrateEventToRing(event: SubstrateEvent, explicitId?: string): string {
  // Prefer a caller-supplied id so the ring shares the durable event log's id
  // space (the AUTOINCREMENT `seq`). That id never resets across restarts,
  // which is what makes a client's Last-Event-ID a stable, restart-surviving
  // cursor. The internal counter is only a fallback for callers without a
  // durable seq (e.g. tests that push directly).
  let id: string;
  if (explicitId !== undefined) {
    id = explicitId;
  } else {
    seq += 1n;
    id = seq.toString();
  }
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
  // Collect dead clients to evict after the pass. A client whose socket is gone
  // (e.g. a daemon that dropped without `req.on("close")` firing — common on
  // `incomplete chunked read` disconnects) would otherwise linger in `clients`
  // forever: `res.write()` on a destroyed socket throws or reports the stream
  // is no longer writable, and the accumulation degrades fan-out on a
  // long-running process. Prune them so delivery stays healthy across the
  // lifetime of the server, not just after a restart.
  const dead: SseClient[] = [];
  for (const c of clients) {
    if (c.subscription.delivery_method !== "sse") continue;
    if (!subscriptionMatchesEvent(c.subscription, event)) continue;
    if (c.res.writableEnded || c.res.destroyed) {
      dead.push(c);
      continue;
    }
    try {
      c.res.write(`id: ${eventRingId}\n`);
      c.res.write(`event: ${event.event_type}\n`);
      c.res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      dead.push(c);
      logger.warn("[subscriptions] sse write failed; evicting client", {
        subscription_id: c.subscription.subscription_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  for (const c of dead) {
    const i = clients.indexOf(c);
    if (i >= 0) clients.splice(i, 1);
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

/** True when the given event id is currently present in the in-memory ring. */
export function ringHasId(eventId: string): boolean {
  return ring.some((e) => e.id === eventId);
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
