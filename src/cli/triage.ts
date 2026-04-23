/**
 * Implementation of the `neotoma triage` subcommands for the agent-feedback
 * pipeline. Registered in `src/cli/index.ts` with:
 *
 *   neotoma triage                  # run one ingest pass
 *   neotoma triage --watch          # continuous ingest loop
 *   neotoma triage --list-pending   # dump pending items (use --json for machine-readable)
 *   neotoma triage --set-status ... # update a feedback's status + resolution_links
 *   neotoma triage --resolve ...    # shorthand for marking resolved with a commit/PR
 *   neotoma triage --health         # classification accuracy summary
 *
 * Transport follows `NEOTOMA_FEEDBACK_TRANSPORT` / `AGENT_SITE_BASE_URL`.
 */

import { LocalFeedbackStore, type LocalFeedbackRecord } from "../services/feedback/local_store.js";
import { deriveNextCheckAt } from "../services/feedback/next_check.js";
import type {
  FeedbackStatus,
  ResolutionLinks,
} from "../services/feedback/types.js";

export interface TriageOptions {
  watch?: boolean;
  remote?: boolean;
  listPending?: boolean;
  json?: boolean;
  health?: boolean;
  setStatus?: string;
  feedbackId?: string;
  classification?: string;
  triageNotes?: string;
  issueUrl?: string;
  prUrl?: string;
  commitSha?: string;
  resolve?: string;
  buildGuidanceFromRelease?: string;
  dryRun?: boolean;
  mirrorReplay?: string;
}

interface Printable {
  print(payload: unknown): void;
}

function makePrinter(json: boolean): Printable {
  return {
    print(payload: unknown) {
      if (json) {
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      } else {
        process.stdout.write(formatHuman(payload) + "\n");
      }
    },
  };
}

function formatHuman(payload: unknown): string {
  if (Array.isArray(payload)) {
    return payload.map((p) => formatHuman(p)).join("\n---\n");
  }
  if (typeof payload === "object" && payload != null) {
    return Object.entries(payload as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join("\n");
  }
  return String(payload);
}

async function listPending(opts: TriageOptions): Promise<void> {
  const printer = makePrinter(Boolean(opts.json));
  if (opts.remote || process.env.AGENT_SITE_BASE_URL) {
    const baseUrl = process.env.AGENT_SITE_BASE_URL;
    const bearer = process.env.AGENT_SITE_ADMIN_BEARER;
    if (!baseUrl || !bearer) throw new Error("remote triage requires AGENT_SITE_BASE_URL + AGENT_SITE_ADMIN_BEARER");
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/feedback/pending?limit=100`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) throw new Error(`list pending HTTP ${res.status}`);
    const body = await res.json();
    printer.print(body);
    return;
  }
  const store = new LocalFeedbackStore();
  const items = await store.listPending(200);
  printer.print({ items });
}

async function setStatus(opts: TriageOptions): Promise<void> {
  if (!opts.feedbackId) throw new Error("--feedback-id is required");
  if (!opts.setStatus) throw new Error("--set-status <status> is required");
  const store = new LocalFeedbackStore();
  const record = await store.getById(opts.feedbackId);
  if (!record) throw new Error(`feedback ${opts.feedbackId} not found`);
  const now = new Date();
  const newStatus = opts.setStatus as FeedbackStatus;
  const links: ResolutionLinks = {
    ...record.resolution_links,
    github_issue_urls: opts.issueUrl
      ? [...record.resolution_links.github_issue_urls, opts.issueUrl]
      : record.resolution_links.github_issue_urls,
    pull_request_urls: opts.prUrl
      ? [...record.resolution_links.pull_request_urls, opts.prUrl]
      : record.resolution_links.pull_request_urls,
    commit_shas: opts.commitSha
      ? [...record.resolution_links.commit_shas, opts.commitSha]
      : record.resolution_links.commit_shas,
    notes_markdown: opts.triageNotes ?? record.resolution_links.notes_markdown,
  };
  const updated: LocalFeedbackRecord = {
    ...record,
    status: newStatus,
    status_updated_at: now.toISOString(),
    classification: opts.classification ?? record.classification,
    triage_notes: opts.triageNotes ?? record.triage_notes,
    last_activity_at: now.toISOString(),
    consecutive_same_status_polls: 0,
    next_check_suggested_at: deriveNextCheckAt(newStatus, 0, now),
    resolution_links: links,
  };
  await store.upsert(updated);
  makePrinter(Boolean(opts.json)).print({ ok: true, feedback_id: updated.id, status: newStatus });
}

async function resolveFeedback(opts: TriageOptions): Promise<void> {
  const id = opts.resolve ?? opts.feedbackId;
  if (!id) throw new Error("--resolve <feedback_id> is required");
  const store = new LocalFeedbackStore();
  const record = await store.getById(id);
  if (!record) throw new Error(`feedback ${id} not found`);
  const now = new Date();
  const links: ResolutionLinks = {
    ...record.resolution_links,
    pull_request_urls: opts.prUrl
      ? [...record.resolution_links.pull_request_urls, opts.prUrl]
      : record.resolution_links.pull_request_urls,
    commit_shas: opts.commitSha
      ? [...record.resolution_links.commit_shas, opts.commitSha]
      : record.resolution_links.commit_shas,
    notes_markdown: opts.triageNotes ?? record.resolution_links.notes_markdown,
  };
  const updated: LocalFeedbackRecord = {
    ...record,
    status: "resolved",
    status_updated_at: now.toISOString(),
    last_activity_at: now.toISOString(),
    consecutive_same_status_polls: 0,
    next_check_suggested_at: deriveNextCheckAt("resolved", 0, now),
    resolution_links: links,
  };
  await store.upsert(updated);
  makePrinter(Boolean(opts.json)).print({ ok: true, feedback_id: id, status: "resolved" });
}

async function healthReport(opts: TriageOptions): Promise<void> {
  const store = new LocalFeedbackStore();
  const all = await store.listAll();
  const by: Record<string, number> = {};
  let classified = 0;
  let classifierOverrides = 0;
  for (const r of all) {
    by[r.status] = (by[r.status] ?? 0) + 1;
    if (r.classification) classified++;
    if (r.classifier_classification && r.classification && r.classifier_classification !== r.classification) {
      classifierOverrides++;
    }
  }
  const window = all
    .filter((r) => r.classifier_classification)
    .slice(-20);
  const windowAgreement = window.length === 0
    ? null
    : window.filter((r) => r.classifier_classification === r.classification).length / window.length;

  const config = await loadAutoPrConfig();
  const floor = config?.accuracy_floor ?? null;
  const belowFloor = floor != null && windowAgreement != null && windowAgreement < floor.threshold;

  const report = {
    total: all.length,
    classified,
    classification_rate: all.length > 0 ? classified / all.length : 0,
    by_status: by,
    classifier_vs_operator: {
      window_size: window.length,
      agreement_rate: windowAgreement,
      overrides_all_time: classifierOverrides,
    },
    accuracy_floor: floor
      ? {
          threshold: floor.threshold,
          window_size: floor.window_size,
          below_floor: belowFloor,
          recommended_action: belowFloor
            ? "degrade_to_phase_1_human_triage_until_reenabled"
            : "ok",
        }
      : null,
  };
  makePrinter(Boolean(opts.json)).print(report);
}

async function loadAutoPrConfig(): Promise<{
  accuracy_floor?: { threshold: number; window_size: number };
} | null> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.resolve(process.cwd(), "docs/subsystems/feedback_auto_pr_config.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function mirrorReplay(opts: TriageOptions): Promise<void> {
  const id = opts.mirrorReplay;
  if (!id) throw new Error("--mirror-replay <feedback_id> is required");
  const printer = makePrinter(Boolean(opts.json));

  const baseUrl = process.env.AGENT_SITE_BASE_URL;
  const bearer = process.env.AGENT_SITE_ADMIN_BEARER;
  if (!baseUrl || !bearer) {
    throw new Error(
      "mirror-replay requires remote transport (AGENT_SITE_BASE_URL + AGENT_SITE_ADMIN_BEARER). The mirror queue lives on the agent-site Netlify Blobs store.",
    );
  }
  const url = `${baseUrl.replace(/\/$/, "")}/feedback/${encodeURIComponent(id)}/mirror_replay`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({ ok: false, status: res.status }));
  printer.print({ http_status: res.status, response: body });
  if (!res.ok) {
    process.exit(2);
  }
}

async function runIngestOnce(opts: TriageOptions): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "scripts/cron/ingest_agent_incidents.ts", ...(opts.dryRun ? ["--dry-run"] : [])],
      { stdio: "inherit" },
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ingest exit ${code}`))));
  });
}

export async function runTriage(opts: TriageOptions): Promise<void> {
  if (opts.listPending) return listPending(opts);
  if (opts.setStatus) return setStatus(opts);
  if (opts.resolve) return resolveFeedback(opts);
  if (opts.health) return healthReport(opts);
  if (opts.mirrorReplay) return mirrorReplay(opts);
  if (opts.watch) {
    const intervalMs = 15 * 60 * 1000;
    for (;;) {
      try {
        await runIngestOnce(opts);
      } catch (err) {
        process.stderr.write(`[triage] ingest failed: ${String(err)}\n`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return runIngestOnce(opts);
}
