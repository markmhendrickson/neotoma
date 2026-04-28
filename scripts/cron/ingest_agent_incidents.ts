#!/usr/bin/env npx tsx
/**
 * Agent-feedback ingest cron.
 *
 * Runs every 15 min on Mark's laptop via launchd/cron. For each pending
 * feedback item pulled from either the local file-backed store or the remote
 * agent.neotoma.io admin endpoint, this script:
 *
 *   1. Classifies the feedback via a deterministic keyword-based classifier.
 *   2. If the feedback describes a behavior already shipped (per
 *      `feedback_upgrade_guidance_map.json`), marks it resolved and attaches
 *      a full `upgrade_guidance` payload so the agent can self-upgrade.
 *   3. Otherwise, moves it to `triaged` and records classification + the
 *      partial `resolution_links` populated so far. Human review + issue/PR
 *      drafting happens in the `process_feedback` skill.
 *
 * Transport selection mirrors `NEOTOMA_FEEDBACK_TRANSPORT`: `local` reads
 * and writes the on-disk JSON store; `http` calls admin endpoints with
 * `AGENT_SITE_ADMIN_BEARER`.
 *
 * Usage:
 *   tsx scripts/cron/ingest_agent_incidents.ts            # single pass
 *   tsx scripts/cron/ingest_agent_incidents.ts --dry-run  # print decisions only
 *
 * Launchd example: see scripts/cron/com.neotoma.feedback-ingest.plist.template
 */

import { mirrorLocalFeedbackToEntity } from "../../src/services/feedback/mirror_local_to_entity.js";
import {
  LocalFeedbackStore,
  type LocalFeedbackRecord,
} from "../../src/services/feedback/local_store.js";
import { deriveNextCheckAt } from "../../src/services/feedback/next_check.js";
import {
  findUpgradeGuidance,
  type GuidanceMapEntry,
} from "../../src/services/feedback/upgrade_guidance_map.js";
import type {
  FeedbackStatus,
  ResolutionLinks,
  UpgradeGuidance,
} from "../../src/services/feedback/types.js";

interface ClassificationResult {
  classification: string;
  triage_notes: string;
  upgrade_guidance: UpgradeGuidance | null;
  resolves_at_submit: boolean;
}

const KIND_TO_CLASSIFICATION: Record<string, string> = {
  incident: "cli_bug",
  report: "report",
  primitive_ask: "primitive_ask",
  doc_gap: "doc_gap",
  contract_discrepancy: "contract_discrepancy",
  fix_verification: "fix_verification",
};

function classifyRecord(record: LocalFeedbackRecord): ClassificationResult {
  const defaultClass = KIND_TO_CLASSIFICATION[record.kind] ?? "other";
  const text = `${record.title}\n${record.body}`;
  const guidanceEntry: GuidanceMapEntry | null = findUpgradeGuidance(text);

  if (guidanceEntry) {
    const submittedVersion =
      (record.metadata as any)?.environment?.neotoma_version ?? null;
    const guidance: UpgradeGuidance = {
      ...guidanceEntry.guidance,
      current_version_seen_at_submit: submittedVersion,
    };
    const resolvesNow =
      submittedVersion != null &&
      guidanceEntry.guidance.min_version_including_fix != null &&
      compareVersions(submittedVersion, guidanceEntry.guidance.min_version_including_fix) < 0;
    return {
      classification: "duplicate_of_shipped_work",
      triage_notes: resolvesNow
        ? `Matched shipped surface; guidance points submitter at ${guidanceEntry.guidance.min_version_including_fix}.`
        : "Matched shipped surface; submitter already on or past min_version_including_fix.",
      upgrade_guidance: guidance,
      resolves_at_submit: resolvesNow,
    };
  }

  return {
    classification: defaultClass,
    triage_notes: "No shipped-surface match; queued for human triage in the process_feedback skill.",
    upgrade_guidance: null,
    resolves_at_submit: false,
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function nextStatusFor(result: ClassificationResult): FeedbackStatus {
  return result.resolves_at_submit ? "resolved" : "triaged";
}

async function processLocalStore(dryRun: boolean): Promise<void> {
  const store = new LocalFeedbackStore();
  const pending = await store.listPending(100);
  if (pending.length === 0) {
    console.log("[ingest] no pending feedback");
    return;
  }
  console.log(`[ingest] processing ${pending.length} pending item(s) (dryRun=${dryRun})`);

  for (const record of pending) {
    const result = classifyRecord(record);
    const newStatus = nextStatusFor(result);
    console.log(
      `[ingest] ${record.id}: ${record.kind} → ${result.classification} → status=${newStatus}`,
    );
    if (dryRun) continue;

    const now = new Date();
    const links: ResolutionLinks = {
      ...record.resolution_links,
      notes_markdown: result.triage_notes,
    };
    const updated: LocalFeedbackRecord = {
      ...record,
      status: newStatus,
      status_updated_at: now.toISOString(),
      classification: result.classification,
      classifier_classification: result.classification,
      resolution_links: links,
      upgrade_guidance: result.upgrade_guidance,
      triage_notes: result.triage_notes,
      last_activity_at: now.toISOString(),
      consecutive_same_status_polls: 0,
      next_check_suggested_at: deriveNextCheckAt(newStatus, 0, now),
    };
    await store.upsert(updated);
    await mirrorLocalFeedbackToEntity(updated, {
      dataSource: `neotoma ingest cron ${now.toISOString().slice(0, 10)}`,
      userId: updated.submitter_id,
    });
  }
}

async function processRemote(dryRun: boolean): Promise<void> {
  const baseUrl = process.env.AGENT_SITE_BASE_URL;
  const bearer = process.env.AGENT_SITE_ADMIN_BEARER;
  if (!baseUrl || !bearer) {
    throw new Error(
      "http transport requires AGENT_SITE_BASE_URL and AGENT_SITE_ADMIN_BEARER",
    );
  }
  const listUrl = baseUrl.replace(/\/$/, "") + "/feedback/pending?limit=100";
  const listRes = await fetch(listUrl, { headers: { authorization: `Bearer ${bearer}` } });
  if (!listRes.ok) throw new Error(`list pending failed: HTTP ${listRes.status}`);
  const body = (await listRes.json()) as { items?: LocalFeedbackRecord[] };
  const items = body.items ?? [];
  console.log(`[ingest] processing ${items.length} pending remote item(s) (dryRun=${dryRun})`);

  for (const record of items) {
    const result = classifyRecord(record);
    const newStatus = nextStatusFor(result);
    console.log(
      `[ingest] ${record.id}: ${record.kind} → ${result.classification} → status=${newStatus}`,
    );
    if (dryRun) continue;

    const updateUrl = `${baseUrl.replace(/\/$/, "")}/feedback/${record.id}/status`;
    const payload = {
      status: newStatus,
      classification: result.classification,
      triage_notes: result.triage_notes,
      upgrade_guidance: result.upgrade_guidance,
      resolution_links: {
        notes_markdown: result.triage_notes,
      },
    };
    const upd = await fetch(updateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(payload),
    });
    if (!upd.ok) {
      const text = await upd.text().catch(() => "");
      console.error(`[ingest] update ${record.id} failed: HTTP ${upd.status} ${text}`);
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const transport =
    (process.env.NEOTOMA_FEEDBACK_TRANSPORT ?? "").toLowerCase() ||
    (process.env.AGENT_SITE_BASE_URL ? "http" : "local");
  if (transport === "http") {
    await processRemote(dryRun);
  } else {
    await processLocalStore(dryRun);
  }
}

main().catch((err) => {
  console.error("[ingest] fatal:", err);
  process.exit(1);
});
