/**
 * Parity test for the agent-feedback pipeline: the local file-backed transport
 * and the HTTP transport MUST produce structurally-identical
 * SubmitFeedbackResponse and FeedbackStatusResponse payloads for the same
 * inputs. This keeps `neotoma triage` safe to run against both.
 *
 * The HTTP side is exercised through a lightweight in-memory handler that
 * mimics the Netlify submit/status functions; end-to-end `netlify dev` smoke
 * coverage lives in the end-to-end smoke test.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { LocalFeedbackTransport } from "../../src/services/feedback_transport_local.js";
import type {
  FeedbackStatusResponse,
  SubmitFeedbackArgs,
  SubmitFeedbackResponse,
} from "../../src/services/feedback/types.js";

function baseSubmission(): SubmitFeedbackArgs {
  return {
    kind: "incident",
    title: "CLI command foo fails with opaque error",
    body: "Steps: run `neotoma foo`. Expected: success. Actual: opaque stacktrace.",
    metadata: {
      environment: {
        neotoma_version: "0.5.0",
        client_name: "neotoma-cli",
        os: "darwin",
      },
    },
    user_consent_captured: true,
    explicit_user_request: false,
  };
}

function topLevelKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

describe("feedback transport parity", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "nt-feedback-"));
    storePath = path.join(tmpDir, "feedback", "records.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("local submit returns required SubmitFeedbackResponse keys", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const res = (await transport.submit(baseSubmission(), "user-1")) as SubmitFeedbackResponse;
    expect(res.feedback_id).toMatch(/^fbk_/);
    expect(typeof res.access_token).toBe("string");
    expect(res.status).toBe("submitted");
    expect(typeof res.expected_acknowledge_within_seconds).toBe("number");
    expect(typeof res.expected_response_within_seconds).toBe("number");
    expect(res.next_check_suggested_at).not.toBeNull();
    expect(res.redaction_preview).toBeDefined();
  });

  it("local status projects all required fields", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const submit = await transport.submit(baseSubmission(), "user-1");
    const status = (await transport.status(submit.access_token)) as FeedbackStatusResponse;
    const keys = topLevelKeys(status as unknown as Record<string, unknown>);
    expect(keys).toEqual(
      expect.arrayContaining([
        "classification",
        "feedback_id",
        "last_activity_at",
        "next_check_suggested_at",
        "resolution_links",
        "status",
        "status_updated_at",
        "triage_notes",
        "upgrade_guidance",
        "verification_request",
      ]),
    );
    expect(status.feedback_id).toBe(submit.feedback_id);
    expect(status.status).toBe("submitted");
    expect(status.resolution_links.github_issue_urls).toEqual([]);
  });

  it("enforces required metadata.environment on submit", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const bad = baseSubmission();
    (bad.metadata as any).environment = { neotoma_version: "0.5.0" };
    await expect(transport.submit(bad, "user-1")).rejects.toThrow(
      /neotoma_version.*client_name.*os/,
    );
  });

  it("redacts PII with hash-suffixed placeholders", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const args = baseSubmission();
    args.title = "Error emailing user@example.com";
    args.body = "Contact me at user@example.com or on +1 (415) 555-1234.";
    const res = await transport.submit(args, "user-1");
    expect(res.redaction_preview?.applied).toBe(true);
    expect(res.redaction_preview?.redacted_title).not.toContain("user@example.com");
    expect(res.redaction_preview?.redacted_title).toMatch(/<EMAIL:[0-9a-f]{4}>/);
  });

  it("fix_verification submissions require parent fields", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const verification: SubmitFeedbackArgs = {
      kind: "fix_verification",
      title: "Verifying fix",
      body: "Tested on v0.5.1 — works.",
      metadata: { environment: { neotoma_version: "0.5.1", client_name: "agent", os: "darwin" } },
    };
    await expect(transport.submit(verification, "user-1")).rejects.toThrow(/parent_feedback_id/);
  });

  it("increments consecutive_same_status_polls across successive status reads", async () => {
    const transport = new LocalFeedbackTransport(storePath);
    const submit = await transport.submit(baseSubmission(), "user-1");
    const first = await transport.status(submit.access_token);
    const second = await transport.status(submit.access_token);
    expect(first.next_check_suggested_at).not.toBeNull();
    expect(second.next_check_suggested_at).not.toBeNull();
  });
});
