/**
 * End-to-end smoke test for the local feedback pipeline.
 *
 *   submit_feedback → ingest cron classifies via the upgrade_guidance map →
 *   status reflects the resolved / triaged transition → verification_request
 *   appears when min_version_including_fix is assigned.
 *
 * The cron step is exercised in-process by importing the classifier and the
 * local store, matching how `scripts/cron/ingest_agent_incidents.ts` runs.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LocalFeedbackTransport } from "../../src/services/feedback_transport_local.js";
import { LocalFeedbackStore } from "../../src/services/feedback/local_store.js";
import { findUpgradeGuidance } from "../../src/services/feedback/upgrade_guidance_map.js";
import { deriveNextCheckAt } from "../../src/services/feedback/next_check.js";
import type { SubmitFeedbackArgs } from "../../src/services/feedback/types.js";

function version(v: string, client = "neotoma-cli"): SubmitFeedbackArgs["metadata"] {
  return { environment: { neotoma_version: v, client_name: client, os: "darwin" } };
}

describe("feedback pipeline smoke (submit → cron → status)", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "nt-feedback-smoke-"));
    storePath = path.join(tmpDir, "feedback", "records.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves a submission already shipped in min_version_including_fix", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const submitResp = await transport.submit(
      {
        kind: "primitive_ask",
        title: "Please add a store --plan dry-run so I can preview without side effects",
        body: "Would like `store --plan` to return a diff-like payload without persisting.",
        metadata: version("0.4.8"),
      },
      "user-smoke",
    );
    expect(submitResp.status).toBe("submitted");

    const store = new LocalFeedbackStore(storePath);
    const pending = await store.listPending();
    expect(pending.length).toBe(1);
    const rec = pending[0]!;
    const guidanceEntry = findUpgradeGuidance(`${rec.title}\n${rec.body}`);
    expect(guidanceEntry).not.toBeNull();
    const now = new Date();
    const updated = {
      ...rec,
      status: "resolved" as const,
      status_updated_at: now.toISOString(),
      classification: "duplicate_of_shipped_work",
      triage_notes: "Shipped in 0.5.0 — upgrade and use `store --plan`.",
      last_activity_at: now.toISOString(),
      consecutive_same_status_polls: 0,
      next_check_suggested_at: deriveNextCheckAt("resolved", 0, now),
      upgrade_guidance: {
        ...guidanceEntry!.guidance,
        current_version_seen_at_submit: "0.4.8",
      },
    };
    await store.upsert(updated);

    const status = await transport.status(submitResp.access_token);
    expect(status.status).toBe("resolved");
    expect(status.upgrade_guidance?.min_version_including_fix).toBe("0.5.0");
    expect(status.upgrade_guidance?.install_commands.neotoma_cli).toContain("0.5.0");
    expect(status.verification_request).not.toBeNull();
    expect(status.verification_request?.report_kind).toBe("fix_verification");
    expect(status.verification_request?.parent_feedback_id).toBe(submitResp.feedback_id);
    expect(status.next_check_suggested_at).toBeNull();
  });

  it("triages a submission with no matching shipped surface", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const submitResp = await transport.submit(
      {
        kind: "incident",
        title: "Unrelated thing broke with some obscure behavior",
        body: "Does not match any known shipped surface.",
        metadata: version("0.5.0"),
      },
      "user-smoke",
    );
    const store = new LocalFeedbackStore(storePath);
    const pending = await store.listPending();
    expect(pending.length).toBe(1);
    const rec = pending[0]!;
    expect(findUpgradeGuidance(`${rec.title}\n${rec.body}`)).toBeNull();

    const status = await transport.status(submitResp.access_token);
    expect(status.status).toBe("submitted");
    expect(status.upgrade_guidance).toBeNull();
    expect(status.verification_request).toBeNull();
  });
});
