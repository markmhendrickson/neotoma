#!/usr/bin/env tsx
/**
 * Walk the agent.neotoma.io pending feedback list and, for each item that
 * has not yet mirrored into Neotoma (`mirrored_to_neotoma !== true`),
 * trigger a `mirror_replay` through the admin endpoint.
 *
 * Operator-side fallback: individual ids can be replayed via
 *   neotoma triage --mirror-replay <feedback_id>
 *
 * Required env:
 *   AGENT_SITE_BASE_URL
 *   AGENT_SITE_ADMIN_BEARER
 *
 * Optional:
 *   FEEDBACK_MIRROR_BACKFILL_IDS   comma-separated feedback ids to replay in
 *                                  addition to the pending list (useful for
 *                                  resolved-but-not-mirrored records, which
 *                                  aren't surfaced via /feedback/pending).
 */

interface PendingResponse {
  items?: Array<{ id: string; mirrored_to_neotoma?: boolean }>;
}

interface ReplayResult {
  feedback_id: string;
  ok: boolean;
  status: number;
  body: unknown;
}

async function listPending(baseUrl: string, bearer: string): Promise<string[]> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/feedback/pending?limit=200`,
    { headers: { authorization: `Bearer ${bearer}` } },
  );
  if (!res.ok) {
    throw new Error(`list pending: HTTP ${res.status}`);
  }
  const body = (await res.json()) as PendingResponse;
  const items = body.items ?? [];
  return items
    .filter((item) => item.mirrored_to_neotoma !== true)
    .map((item) => item.id);
}

async function replayOne(
  baseUrl: string,
  bearer: string,
  id: string,
): Promise<ReplayResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/feedback/${encodeURIComponent(
    id,
  )}/mirror_replay`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  return { feedback_id: id, ok: res.ok, status: res.status, body };
}

(async () => {
  const baseUrl = process.env.AGENT_SITE_BASE_URL;
  const bearer = process.env.AGENT_SITE_ADMIN_BEARER;
  if (!baseUrl || !bearer) {
    process.stderr.write(
      "[feedback_mirror_backfill] AGENT_SITE_BASE_URL and AGENT_SITE_ADMIN_BEARER are required.\n",
    );
    process.exit(1);
  }

  const extraIds = (process.env.FEEDBACK_MIRROR_BACKFILL_IDS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  try {
    const pendingIds = await listPending(baseUrl, bearer);
    const targets = Array.from(new Set([...pendingIds, ...extraIds]));
    if (targets.length === 0) {
      process.stdout.write(
        JSON.stringify({ ok: true, replayed: 0, note: "nothing to backfill" }, null, 2) + "\n",
      );
      return;
    }

    const results: ReplayResult[] = [];
    for (const id of targets) {
      const result = await replayOne(baseUrl, bearer, id);
      results.push(result);
      process.stderr.write(
        `[feedback_mirror_backfill] ${result.ok ? "OK " : "FAIL"} ${result.status} ${id}\n`,
      );
    }

    const mirrored = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    process.stdout.write(
      JSON.stringify(
        {
          ok: failed.length === 0,
          total: results.length,
          mirrored,
          failed: failed.map((f) => ({
            feedback_id: f.feedback_id,
            status: f.status,
            body: f.body,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    if (failed.length > 0) process.exit(2);
  } catch (err) {
    process.stderr.write(
      `[feedback_mirror_backfill] failed: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }
})();
