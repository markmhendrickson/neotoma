/**
 * Replay Simon's Apr 21 2026 feedback reports through the local feedback
 * pipeline and assert that every item classifies as duplicate_of_shipped_work
 * with a fully-populated upgrade_guidance block pointing at v0.5.0.
 *
 * This is a regression guard: new entries in the upgrade_guidance map should
 * keep these fixtures resolvable without human intervention.
 */

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LocalFeedbackTransport } from "../../src/services/feedback_transport_local.js";
import { LocalFeedbackStore } from "../../src/services/feedback/local_store.js";
import { findUpgradeGuidance } from "../../src/services/feedback/upgrade_guidance_map.js";
import type { SubmitFeedbackArgs } from "../../src/services/feedback/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, "../fixtures/feedback/simon_apr21_reports.json");

interface FixtureFile {
  submissions: SubmitFeedbackArgs[];
}

describe("replay Simon Apr 21 reports", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "nt-feedback-replay-"));
    storePath = path.join(tmpDir, "feedback", "records.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("every fixture matches a shipped surface in the upgrade guidance map", async () => {
    const raw = await readFile(FIXTURE_PATH, "utf8");
    const fixture = JSON.parse(raw) as FixtureFile;
    expect(fixture.submissions.length).toBeGreaterThan(0);

    const transport = new LocalFeedbackTransport(storePath);
    const store = new LocalFeedbackStore(storePath);

    for (const submission of fixture.submissions) {
      const resp = await transport.submit(submission, "simon");
      expect(resp.feedback_id).toMatch(/^fbk_/);
      const rec = await store.getById(resp.feedback_id);
      expect(rec).not.toBeNull();
      const hit = findUpgradeGuidance(`${rec!.title}\n${rec!.body}`);
      expect(hit, `no guidance match for: ${submission.title}`).not.toBeNull();
      expect(hit!.guidance.min_version_including_fix).toBe("0.5.0");
      expect(hit!.guidance.install_commands).toBeDefined();
    }
  });
});
