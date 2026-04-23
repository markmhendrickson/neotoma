/**
 * Blobs-backed storage for feedback records, token-to-id redirect keys, and
 * maintained indexes (pending list, per-submitter list, by-commit reverse
 * index, webhook queue, Neotoma mirror queue).
 *
 * Key shapes:
 *   feedback:{id}                    -> StoredFeedback JSON
 *   token:{sha256(access_token)}     -> feedback_id (redirect)
 *   index:pending                    -> string[] of feedback_ids with status in (submitted, triaged)
 *   index:submitter:{id}             -> string[] of feedback_ids
 *   index:commit:{sha}               -> string[] of feedback_ids whose resolution_links.commit_shas contain :sha
 *   webhooks_pending                 -> { feedback_id: string; attempts: number; next_try_at: string }[]
 *   mirror_pending                   -> { feedback_id: string; op: 'create'|'update'; attempts: number; next_try_at: string }[]
 */

import { getStore } from "@netlify/blobs";
import type { StoredFeedback } from "./types.js";

const STORE_NAME = "feedback";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function readFeedback(id: string): Promise<StoredFeedback | null> {
  const s = store();
  const raw = await s.get(`feedback:${id}`, { type: "json" });
  return (raw as StoredFeedback | null) ?? null;
}

export async function writeFeedback(record: StoredFeedback): Promise<void> {
  const s = store();
  await s.setJSON(`feedback:${record.id}`, record);
}

export async function writeTokenIndex(tokenHash: string, feedbackId: string): Promise<void> {
  const s = store();
  await s.set(`token:${tokenHash}`, feedbackId);
}

export async function lookupFeedbackIdByTokenHash(
  tokenHash: string,
): Promise<string | null> {
  const s = store();
  const raw = await s.get(`token:${tokenHash}`);
  return typeof raw === "string" ? raw : null;
}

async function readStringList(key: string): Promise<string[]> {
  const s = store();
  const raw = await s.get(key, { type: "json" });
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

async function writeStringList(key: string, list: string[]): Promise<void> {
  const s = store();
  await s.setJSON(key, Array.from(new Set(list)));
}

export async function addToPending(feedbackId: string): Promise<void> {
  const list = await readStringList("index:pending");
  if (!list.includes(feedbackId)) {
    list.push(feedbackId);
    await writeStringList("index:pending", list);
  }
}

export async function removeFromPending(feedbackId: string): Promise<void> {
  const list = await readStringList("index:pending");
  const next = list.filter((x) => x !== feedbackId);
  if (next.length !== list.length) {
    await writeStringList("index:pending", next);
  }
}

export async function listPending(limit = 100, offset = 0): Promise<string[]> {
  const list = await readStringList("index:pending");
  return list.slice(offset, offset + limit);
}

export async function addToSubmitterIndex(
  submitterId: string,
  feedbackId: string,
): Promise<void> {
  const key = `index:submitter:${submitterId}`;
  const list = await readStringList(key);
  if (!list.includes(feedbackId)) {
    list.push(feedbackId);
    await writeStringList(key, list);
  }
}

export async function countRecentBySubmitter(
  submitterId: string,
  windowMs: number,
  now: Date = new Date(),
): Promise<number> {
  const key = `index:submitter:${submitterId}`;
  const ids = await readStringList(key);
  const cutoff = now.getTime() - windowMs;
  let count = 0;
  for (const id of ids.slice(-200)) {
    const r = await readFeedback(id);
    if (!r) continue;
    if (new Date(r.submitted_at).getTime() >= cutoff) count += 1;
  }
  return count;
}

export async function addCommitIndex(sha: string, feedbackId: string): Promise<void> {
  const key = `index:commit:${sha}`;
  const list = await readStringList(key);
  if (!list.includes(feedbackId)) {
    list.push(feedbackId);
    await writeStringList(key, list);
  }
}

export async function readCommitIndex(sha: string): Promise<string[]> {
  return readStringList(`index:commit:${sha}`);
}

export interface WebhookTask {
  feedback_id: string;
  attempts: number;
  next_try_at: string;
  enqueued_at: string;
}

export async function enqueueWebhook(task: WebhookTask): Promise<void> {
  const s = store();
  const raw = (await s.get("webhooks_pending", { type: "json" })) as
    | WebhookTask[]
    | null;
  const queue = Array.isArray(raw) ? raw : [];
  queue.push(task);
  await s.setJSON("webhooks_pending", queue);
}

export async function drainWebhookQueue(
  now: Date = new Date(),
): Promise<WebhookTask[]> {
  const s = store();
  const raw = (await s.get("webhooks_pending", { type: "json" })) as
    | WebhookTask[]
    | null;
  const queue = Array.isArray(raw) ? raw : [];
  const due = queue.filter((t) => new Date(t.next_try_at).getTime() <= now.getTime());
  const remaining = queue.filter((t) => new Date(t.next_try_at).getTime() > now.getTime());
  await s.setJSON("webhooks_pending", remaining);
  return due;
}

export async function requeueWebhook(task: WebhookTask): Promise<void> {
  await enqueueWebhook(task);
}

/* -------------------------------------------------------------------------- */
/* Neotoma mirror queue                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One pending forward of a feedback record to the Neotoma tunnel. `op` lets
 * the drain loop decide whether a create (first-write) or an update (admin
 * patch) is required; useful when both land before a successful mirror.
 */
export interface MirrorTask {
  feedback_id: string;
  op: "create" | "update";
  attempts: number;
  next_try_at: string;
  enqueued_at: string;
  last_error?: string;
}

const MIRROR_KEY = "mirror_pending";

export async function enqueueMirror(task: MirrorTask): Promise<void> {
  const s = store();
  const raw = (await s.get(MIRROR_KEY, { type: "json" })) as
    | MirrorTask[]
    | null;
  const queue = Array.isArray(raw) ? raw : [];
  // Collapse duplicate (feedback_id, op) pairs to the newest entry so the
  // worker doesn't waste cycles re-sending the same thing.
  const filtered = queue.filter(
    (t) => !(t.feedback_id === task.feedback_id && t.op === task.op),
  );
  filtered.push(task);
  await s.setJSON(MIRROR_KEY, filtered);
}

export async function drainMirrorQueue(
  now: Date = new Date(),
): Promise<MirrorTask[]> {
  const s = store();
  const raw = (await s.get(MIRROR_KEY, { type: "json" })) as
    | MirrorTask[]
    | null;
  const queue = Array.isArray(raw) ? raw : [];
  const due = queue.filter((t) => new Date(t.next_try_at).getTime() <= now.getTime());
  const remaining = queue.filter(
    (t) => new Date(t.next_try_at).getTime() > now.getTime(),
  );
  await s.setJSON(MIRROR_KEY, remaining);
  return due;
}

export async function requeueMirror(task: MirrorTask): Promise<void> {
  await enqueueMirror(task);
}

export async function listMirrorQueue(): Promise<MirrorTask[]> {
  const s = store();
  const raw = (await s.get(MIRROR_KEY, { type: "json" })) as
    | MirrorTask[]
    | null;
  return Array.isArray(raw) ? raw : [];
}
