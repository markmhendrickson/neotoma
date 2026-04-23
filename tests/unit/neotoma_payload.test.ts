/**
 * Unit tests for the Netlify -> Neotoma `neotoma_feedback` entity mapper.
 *
 * The mapper must:
 *   - Flatten the nested `EnvironmentBlock` onto top-level entity fields so
 *     `neotoma_feedback` schema typing applies.
 *   - Preserve redaction state (never re-expose raw PII on the Neotoma side).
 *   - Unfold `resolution_links.verifications` and `related_entity_ids`.
 *   - Stamp `data_source` + `source_file` provenance per the forwarder doc.
 *   - Produce a deterministic `idempotency_key` so mirror retries never
 *     double-write.
 *   - Never leak bearer / webhook / access_token values (access_token isn't
 *     even on `StoredFeedback`, but the mapper should not fabricate one).
 */

import { describe, expect, it } from "vitest";

import { storedFeedbackToEntity } from "../../services/agent-site/netlify/lib/neotoma_payload.js";
import type { StoredFeedback } from "../../services/agent-site/netlify/lib/types.js";

function makeRecord(overrides: Partial<StoredFeedback> = {}): StoredFeedback {
  return {
    id: "fbk_test_123",
    submitter_id: "agent-cursor-mark",
    kind: "incident",
    title: "CLI command foo fails with opaque error",
    body: "Redacted body preserves <EMAIL:a3f9> placeholders.",
    metadata: {
      source_repo: "github.com/markmhendrickson/neotoma",
      environment: {
        neotoma_version: "0.5.1",
        client_name: "cursor-agent",
        client_version: "1.2.3",
        os: "darwin",
        os_version: "25.3.0",
        tool_name: "submit_feedback",
        error_message: "pipeline error <EMAIL:a3f9>",
        error_class: "TypeError",
        hit_count: 2,
      },
    },
    submitted_at: "2026-04-22T10:00:00.000Z",
    status: "submitted",
    status_updated_at: "2026-04-22T10:00:00.000Z",
    classification: null,
    resolution_links: {
      github_issue_urls: ["https://github.com/markmhendrickson/neotoma/issues/42"],
      pull_request_urls: [],
      commit_shas: ["deadbeef"],
      duplicate_of_feedback_id: null,
      related_entity_ids: ["ent_task_abc", "ent_conversation_xyz", ""],
      notes_markdown: "Triage note.",
      verifications: ["fbk_v_1"],
    },
    upgrade_guidance: null,
    triage_notes: null,
    last_activity_at: null,
    next_check_suggested_at: "2026-04-22T11:00:00.000Z",
    access_token_hash: "aaaaaaaabbbbbbbb",
    redaction_applied: true,
    redaction_backstop_hits: ["EMAIL"],
    consecutive_same_status_polls: 0,
    ...overrides,
  };
}

describe("storedFeedbackToEntity", () => {
  it("projects every top-level feedback field onto the entity payload", () => {
    const record = makeRecord();
    const { entity, related_entity_ids, idempotency_key, canonical_name } =
      storedFeedbackToEntity(record);

    expect(entity.entity_type).toBe("neotoma_feedback");
    expect(entity.feedback_id).toBe(record.id);
    expect(entity.access_token_hash).toBe(record.access_token_hash);
    expect(entity.submitter_id).toBe(record.submitter_id);
    expect(entity.title).toBe(record.title);
    expect(entity.body).toBe(record.body);
    expect(entity.kind).toBe(record.kind);
    expect(entity.redaction_applied).toBe(true);
    expect(entity.redaction_backstop_hits).toEqual(["EMAIL"]);
    expect(entity.status).toBe(record.status);
    expect(entity.status_updated_at).toBe(record.status_updated_at);
    expect(entity.submitted_at).toBe(record.submitted_at);
    expect(entity.next_check_suggested_at).toBe(record.next_check_suggested_at);
    expect(canonical_name.startsWith(record.id)).toBe(true);
    expect(idempotency_key).toBe(`neotoma_feedback-${record.id}`);

    expect(related_entity_ids).toEqual(["ent_task_abc", "ent_conversation_xyz"]);
  });

  it("flattens EnvironmentBlock onto top-level fields", () => {
    const record = makeRecord();
    const { entity } = storedFeedbackToEntity(record);
    expect(entity.neotoma_version).toBe("0.5.1");
    expect(entity.client_name).toBe("cursor-agent");
    expect(entity.client_version).toBe("1.2.3");
    expect(entity.os).toBe("darwin");
    expect(entity.os_version).toBe("25.3.0");
    expect(entity.tool_name).toBe("submit_feedback");
    expect(entity.error_message).toBe("pipeline error <EMAIL:a3f9>");
    expect(entity.error_class).toBe("TypeError");
    expect(entity.hit_count).toBe(2);
  });

  it("unfolds resolution_links into list-typed fields", () => {
    const record = makeRecord();
    const { entity } = storedFeedbackToEntity(record);
    expect(entity.github_issue_urls).toEqual([
      "https://github.com/markmhendrickson/neotoma/issues/42",
    ]);
    expect(entity.pull_request_urls).toEqual([]);
    expect(entity.commit_shas).toEqual(["deadbeef"]);
    expect(entity.verifications).toEqual(["fbk_v_1"]);
    expect(entity.notes_markdown).toBe("Triage note.");
    expect(entity.duplicate_of_feedback_id).toBeNull();
  });

  it("stamps provenance with a dated default data_source and null source_file", () => {
    const record = makeRecord();
    const { entity } = storedFeedbackToEntity(record);
    expect(entity.data_source).toBe("agent-site netlify submit 2026-04-22");
    expect(entity.source_file).toBeNull();
  });

  it("honors explicit provenance overrides", () => {
    const record = makeRecord();
    const { entity } = storedFeedbackToEntity(record, {
      dataSource: "agent-site netlify backfill 2026-04-23",
      sourceFile: null,
    });
    expect(entity.data_source).toBe("agent-site netlify backfill 2026-04-23");
  });

  it("preserves the fix_verification envelope when kind=fix_verification", () => {
    const record = makeRecord({
      kind: "fix_verification",
      parent_feedback_id: "fbk_parent_1",
      verification_outcome: "verified_working",
      verified_at_version: "0.5.2",
    });
    const { entity } = storedFeedbackToEntity(record);
    expect(entity.kind).toBe("fix_verification");
    expect(entity.parent_feedback_id).toBe("fbk_parent_1");
    expect(entity.verification_outcome).toBe("verified_working");
    expect(entity.verified_at_version).toBe("0.5.2");
  });

  it("never includes access_token, bearer, or webhook secret", () => {
    const record = makeRecord({
      status_push: {
        webhook_url: "https://example.com/hook",
        webhook_secret: "topsecret",
      },
    });
    const { entity } = storedFeedbackToEntity(record);
    const serialized = JSON.stringify(entity);
    expect(serialized).not.toContain("topsecret");
    expect(serialized).not.toContain("access_token\"");
  });

  it("produces the same idempotency_key across calls for the same id", () => {
    const a = storedFeedbackToEntity(makeRecord());
    const b = storedFeedbackToEntity(makeRecord({ status: "triaged" }));
    expect(a.idempotency_key).toBe(b.idempotency_key);
  });
});
