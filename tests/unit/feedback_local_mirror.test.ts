/**
 * Unit tests for the self-contained local feedback pipeline mirror.
 *
 * Covers:
 *   - `localRecordToStoredFeedback` adapter: round-trips LocalFeedbackRecord
 *     fields onto the shared `StoredFeedback` shape the projector expects,
 *     respecting submitter override semantics.
 *   - `mirrorLocalFeedbackToEntity`: idempotency-key stability, the
 *     user-scoping invariant (mirror writes under the submitter_id, not a
 *     global service user), best-effort failure swallowing, and the
 *     injected `store` dependency contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  localRecordToStoredFeedback,
  storedFeedbackToEntity,
} from "../../src/services/feedback/neotoma_payload.js";
import {
  mirrorLocalFeedbackToEntity,
  __resetMirrorStoreCacheForTests,
  type MirrorStore,
} from "../../src/services/feedback/mirror_local_to_entity.js";
import type { LocalFeedbackRecord } from "../../src/services/feedback/local_store.js";

function makeLocalRecord(
  overrides: Partial<LocalFeedbackRecord> = {},
): LocalFeedbackRecord {
  return {
    id: "fbk_local_abc123",
    submitter_id: "11111111-1111-1111-1111-111111111111",
    kind: "incident",
    title: "Local submit_feedback flow breaks on fresh install",
    body: "Body with <EMAIL:xyz1> redacted.",
    metadata: {
      source_repo: "github.com/markmhendrickson/neotoma",
      environment: {
        neotoma_version: "0.7.0-dev",
        client_name: "cursor-agent",
        client_version: "3.4.5",
        os: "darwin",
        os_version: "25.3.0",
        tool_name: "submit_feedback",
        hit_count: 1,
      },
    },
    submitted_at: "2026-04-24T12:34:56.000Z",
    status: "submitted",
    status_updated_at: "2026-04-24T12:34:56.000Z",
    classification: null,
    resolution_links: {
      github_issue_urls: [],
      pull_request_urls: [],
      commit_shas: [],
      duplicate_of_feedback_id: null,
      related_entity_ids: [],
      notes_markdown: "",
      verifications: [],
    },
    upgrade_guidance: null,
    triage_notes: null,
    last_activity_at: null,
    next_check_suggested_at: null,
    access_token_hash: "tokenhash0001",
    redaction_applied: true,
    redaction_backstop_hits: [],
    consecutive_same_status_polls: 0,
    ...overrides,
  };
}

describe("localRecordToStoredFeedback", () => {
  it("preserves every shared field by default", () => {
    const record = makeLocalRecord();
    const stored = localRecordToStoredFeedback(record);
    expect(stored.id).toBe(record.id);
    expect(stored.submitter_id).toBe(record.submitter_id);
    expect(stored.title).toBe(record.title);
    expect(stored.body).toBe(record.body);
    expect(stored.kind).toBe(record.kind);
    expect(stored.metadata).toBe(record.metadata);
    expect(stored.submitted_at).toBe(record.submitted_at);
    expect(stored.status).toBe(record.status);
    expect(stored.access_token_hash).toBe(record.access_token_hash);
    expect(stored.redaction_applied).toBe(record.redaction_applied);
    expect(stored.redaction_backstop_hits).toBe(record.redaction_backstop_hits);
    expect(stored.resolution_links).toBe(record.resolution_links);
  });

  it("honors an explicit submitter override without mutating the record", () => {
    const record = makeLocalRecord();
    const stored = localRecordToStoredFeedback(record, "override-user");
    expect(stored.submitter_id).toBe("override-user");
    expect(record.submitter_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("round-trips through storedFeedbackToEntity with a stable idempotency key", () => {
    const record = makeLocalRecord({
      status: "triaged",
      classification: "cli_bug",
      triage_notes: "Assigned to maintainer.",
    });
    const stored = localRecordToStoredFeedback(record);
    const projection = storedFeedbackToEntity(stored, {
      dataSource: "neotoma local test 2026-04-24",
      sourceFile: null,
    });
    expect(projection.entity.feedback_id).toBe(record.id);
    expect(projection.entity.status).toBe("triaged");
    expect(projection.entity.classification).toBe("cli_bug");
    expect(projection.entity.triage_notes).toBe("Assigned to maintainer.");
    expect(projection.idempotency_key).toBe(`neotoma_feedback-${record.id}`);
  });

  it("forwards fix_verification envelope fields when present", () => {
    const record = makeLocalRecord({
      kind: "fix_verification",
      parent_feedback_id: "fbk_parent_9",
      verification_outcome: "verified_working",
      verified_at_version: "0.7.1",
    });
    const stored = localRecordToStoredFeedback(record);
    expect(stored.kind).toBe("fix_verification");
    expect(stored.parent_feedback_id).toBe("fbk_parent_9");
    expect(stored.verification_outcome).toBe("verified_working");
    expect(stored.verified_at_version).toBe("0.7.1");
    const { entity } = storedFeedbackToEntity(stored);
    expect(entity.kind).toBe("fix_verification");
    expect(entity.parent_feedback_id).toBe("fbk_parent_9");
    expect(entity.verification_outcome).toBe("verified_working");
    expect(entity.verified_at_version).toBe("0.7.1");
  });
});

describe("mirrorLocalFeedbackToEntity", () => {
  afterEach(() => {
    __resetMirrorStoreCacheForTests();
    vi.restoreAllMocks();
  });

  function makeFakeStore(
    response: unknown = {
      structured: {
        entities: [{ entity_id: "ent_nf_1", action: "created" }],
      },
    },
  ): { store: MirrorStore; calls: Array<{ entities: unknown; idempotency_key: string }> } {
    const calls: Array<{ entities: unknown; idempotency_key: string }> = [];
    const store: MirrorStore = {
      async storeStructured(input) {
        calls.push({
          entities: input.entities,
          idempotency_key: input.idempotency_key,
        });
        return response as Awaited<ReturnType<MirrorStore["storeStructured"]>>;
      },
    };
    return { store, calls };
  }

  it("mirrors a submitted record under the submitter_id and returns the entity_id", async () => {
    const record = makeLocalRecord();
    const { store, calls } = makeFakeStore();
    const result = await mirrorLocalFeedbackToEntity(record, { store });
    expect(result.mirrored).toBe(true);
    expect(result.entity_id).toBe("ent_nf_1");
    expect(result.action).toBe("created");
    expect(result.idempotency_key).toBe(`neotoma_feedback-${record.id}`);
    expect(calls).toHaveLength(1);
    const [sent] = calls;
    expect(sent.idempotency_key).toBe(`neotoma_feedback-${record.id}`);
    const entity = (sent.entities as Array<Record<string, unknown>>)[0];
    expect(entity.entity_type).toBe("neotoma_feedback");
    expect(entity.submitter_id).toBe(record.submitter_id);
    expect(entity.status).toBe("submitted");
    expect(entity.data_source).toBe(
      `neotoma local transport ${record.submitted_at.slice(0, 10)}`,
    );
  });

  it("produces a stable idempotency key across status transitions", async () => {
    const submitted = makeLocalRecord();
    const triaged = makeLocalRecord({
      status: "triaged",
      status_updated_at: "2026-04-24T13:00:00.000Z",
      classification: "cli_bug",
    });
    const { store, calls } = makeFakeStore();
    const a = await mirrorLocalFeedbackToEntity(submitted, { store });
    const b = await mirrorLocalFeedbackToEntity(triaged, {
      store,
      dataSource: "neotoma triage set-status 2026-04-24",
    });
    expect(a.idempotency_key).toBe(`neotoma_feedback-${submitted.id}`);
    expect(b.idempotency_key).toBe(a.idempotency_key);
    expect(calls).toHaveLength(2);
    expect(calls[0].idempotency_key).toBe(calls[1].idempotency_key);
    const entityB = (calls[1].entities as Array<Record<string, unknown>>)[0];
    expect(entityB.status).toBe("triaged");
    expect(entityB.classification).toBe("cli_bug");
    expect(entityB.data_source).toBe("neotoma triage set-status 2026-04-24");
  });

  it("honors an explicit userId override for the Neotoma write", async () => {
    const record = makeLocalRecord();
    const { store, calls } = makeFakeStore();
    await mirrorLocalFeedbackToEntity(record, {
      store,
      userId: "22222222-2222-2222-2222-222222222222",
    });
    const entity = (calls[0].entities as Array<Record<string, unknown>>)[0];
    expect(entity.submitter_id).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("swallows store errors, returns mirrored=false, and keeps the idempotency key", async () => {
    const record = makeLocalRecord();
    const failing: MirrorStore = {
      async storeStructured() {
        throw new Error("downstream exploded");
      },
    };
    const result = await mirrorLocalFeedbackToEntity(record, { store: failing });
    expect(result.mirrored).toBe(false);
    expect(result.reason).toBe("downstream exploded");
    expect(result.idempotency_key).toBe(`neotoma_feedback-${record.id}`);
  });
});
