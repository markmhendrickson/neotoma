/**
 * Scheduled Netlify Function running every 5 minutes. Drains two queues:
 *
 *   1. `webhooks_pending` — deferred POSTs of the current
 *      `get_feedback_status` body to submitter-supplied webhook URLs.
 *        - At-least-once delivery.
 *        - Up to 3 retries at 1m / 5m / 30m backoff.
 *        - HMAC signature via `X-Neotoma-Signature` when webhook_secret present.
 *
 *   2. `mirror_pending` — deferred forwards of `StoredFeedback` records to
 *      the local Neotoma instance over the Cloudflare tunnel.
 *        - Backoff schedule: 1m, 5m, 30m, 2h, 12h, 24h, then daily up to 7d.
 *        - Terminal failure leaves the task in the queue (for operator replay
 *          via `neotoma triage --mirror-replay`) and stamps `mirror_last_error`.
 *        - Success stamps `mirrored_to_neotoma=true` + `neotoma_entity_id`
 *          onto the Blobs-side record.
 */

import { createHmac } from "node:crypto";
import type { Config } from "@netlify/functions";
import { forwardToNeotoma, loadForwarderConfigFromEnv } from "../lib/forwarder.js";
import { projectStatus } from "../lib/project_status.js";
import {
  drainMirrorQueue,
  drainWebhookQueue,
  readFeedback,
  requeueMirror,
  requeueWebhook,
  writeFeedback,
  type MirrorTask,
  type WebhookTask,
} from "../lib/storage.js";

const WEBHOOK_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000];
const MAX_WEBHOOK_ATTEMPTS = WEBHOOK_BACKOFF_MS.length;

/**
 * Retry schedule for the Neotoma mirror queue. Chosen so a tunnel that's
 * down during a laptop sleep catches up within ~24h without hammering the
 * Cloudflare edge. After the final slot the task stays in the queue for
 * manual operator replay.
 */
const MIRROR_BACKOFF_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
/** Cap at 7d after the final backoff to keep operator replay viable. */
const MIRROR_DAILY_MAX_DAYS = 7;

async function deliverWebhook(task: WebhookTask, now: Date): Promise<void> {
  const record = await readFeedback(task.feedback_id);
  if (!record || !record.status_push) return;

  const body = projectStatus(record, now);
  const bodyText = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "agent.neotoma.io webhook/1.0",
    "x-neotoma-feedback-id": record.id,
  };
  if (record.status_push.webhook_secret) {
    const signature = createHmac("sha256", record.status_push.webhook_secret)
      .update(bodyText)
      .digest("hex");
    headers["x-neotoma-signature"] = `sha256=${signature}`;
  }

  try {
    const res = await fetch(record.status_push.webhook_url, {
      method: "POST",
      headers,
      body: bodyText,
    });
    if (!res.ok) throw new Error(`webhook returned ${res.status}`);
    console.log(`[push_webhook_worker] delivered feedback=${record.id} to ${record.status_push.webhook_url}`);
  } catch (err) {
    const nextAttempt = task.attempts + 1;
    if (nextAttempt >= MAX_WEBHOOK_ATTEMPTS) {
      console.error(
        `[push_webhook_worker] giving up on feedback=${record.id} after ${MAX_WEBHOOK_ATTEMPTS} attempts:`,
        (err as Error).message,
      );
      return;
    }
    const backoff =
      WEBHOOK_BACKOFF_MS[nextAttempt] ?? WEBHOOK_BACKOFF_MS[WEBHOOK_BACKOFF_MS.length - 1];
    await requeueWebhook({
      ...task,
      attempts: nextAttempt,
      next_try_at: new Date(now.getTime() + backoff).toISOString(),
    });
    console.warn(
      `[push_webhook_worker] retry ${nextAttempt}/${MAX_WEBHOOK_ATTEMPTS} scheduled for feedback=${record.id}`,
    );
  }
}

function mirrorBackoffForAttempt(attempt: number): number {
  if (attempt < MIRROR_BACKOFF_MS.length) {
    return MIRROR_BACKOFF_MS[attempt]!;
  }
  return 24 * 60 * 60 * 1000;
}

function isTerminalMirrorAttempt(attempt: number): boolean {
  return attempt >= MIRROR_BACKOFF_MS.length + MIRROR_DAILY_MAX_DAYS;
}

async function deliverMirror(task: MirrorTask, now: Date): Promise<void> {
  const record = await readFeedback(task.feedback_id);
  if (!record) {
    console.warn(`[push_webhook_worker] mirror task for missing feedback=${task.feedback_id}; dropping`);
    return;
  }

  // A concurrent submit/update path may have mirrored this record already.
  // Check before spending the forward budget.
  if (record.mirrored_to_neotoma === true && record.neotoma_entity_id) {
    return;
  }

  record.mirror_attempts = (record.mirror_attempts ?? 0) + 1;
  const op: "create" | "update" =
    task.op === "update" && record.neotoma_entity_id ? "update" : task.op;

  const forward = await forwardToNeotoma(record, op);
  if (forward.mirrored && forward.entity_id) {
    record.mirrored_to_neotoma = true;
    record.mirrored_at = new Date().toISOString();
    record.neotoma_entity_id = forward.entity_id;
    record.mirror_last_error = undefined;
    await writeFeedback(record);
    console.log(`[push_webhook_worker] mirrored feedback=${record.id} entity=${forward.entity_id}`);
    return;
  }

  record.mirror_last_error = forward.reason ?? "unknown";
  record.mirrored_to_neotoma = false;
  await writeFeedback(record);

  const nextAttempt = task.attempts + 1;
  if (isTerminalMirrorAttempt(nextAttempt)) {
    console.error(
      `[push_webhook_worker] mirror for feedback=${record.id} failed after ${nextAttempt} attempts; leaving in queue for manual replay. reason=${forward.reason}`,
    );
    // Leave it in the queue at a 24h cadence; an operator can clear it via
    // `neotoma triage --mirror-replay <feedback_id>`.
    await requeueMirror({
      ...task,
      attempts: nextAttempt,
      next_try_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      last_error: forward.reason,
    });
    return;
  }
  const backoff = mirrorBackoffForAttempt(nextAttempt);
  await requeueMirror({
    ...task,
    attempts: nextAttempt,
    next_try_at: new Date(now.getTime() + backoff).toISOString(),
    last_error: forward.reason,
  });
  console.warn(
    `[push_webhook_worker] mirror retry ${nextAttempt} scheduled for feedback=${record.id} reason=${forward.reason}`,
  );
}

export default async (): Promise<Response> => {
  const now = new Date();
  const webhooks = await drainWebhookQueue(now);
  for (const task of webhooks) {
    await deliverWebhook(task, now);
  }

  const forwarderMode = loadForwarderConfigFromEnv().mode;
  let mirrorProcessed = 0;
  if (forwarderMode !== "off") {
    const mirrors = await drainMirrorQueue(now);
    mirrorProcessed = mirrors.length;
    for (const task of mirrors) {
      await deliverMirror(task, now);
    }
  }

  return new Response(
    JSON.stringify({ webhooks_processed: webhooks.length, mirrors_processed: mirrorProcessed }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
};

export const config: Config = { schedule: "*/5 * * * *" };
