/**
 * Regression tests for issues #72, #75, and #77:
 *
 * #72 — `neotoma_repair` store rejected with R2 validation error because the
 *       entity type had no entry in ENTITY_SCHEMAS and auto-inference produced
 *       a schema without identity_opt_out, triggering R2.
 *
 * #75 — `gist` store rejected with R2 validation error for the same reason.
 *
 * #77 — `transaction` store with an explicit `canonical_name` rejected because
 *       canonical_name was routed to unknownFields and R2 required it as an
 *       identity field.  Covered by PR #86 (same root fix as #84).
 *
 * All three entity types now have code-defined schemas in ENTITY_SCHEMAS with
 * `identity_opt_out: "heuristic_canonical_name"`, which satisfies R2 and allows
 * callers to supply explicit canonical_name values.
 */

import { describe, it, expect } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store: built-in identity_opt_out schemas (#72, #75, #77)", () => {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = TEST_USER_ID;

  // ── #75: gist ──────────────────────────────────────────────────────────────

  it("stores a gist entity without R2 rejection (#75)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-75-${randomUUID()}`,
      entities: [
        {
          entity_type: "gist",
          canonical_name: "my-gist-abc123",
          schema_version: "1.0",
          url: "https://gist.github.com/user/abc123",
          description: "A useful utility snippet",
          language: "TypeScript",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].canonical_name).toBe("my-gist-abc123");
  });

  it("stores a gist entity with title as identity when no canonical_name (#75)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-75-no-cn-${randomUUID()}`,
      entities: [
        {
          entity_type: "gist",
          schema_version: "1.0",
          title: "My Utility Gist",
          url: "https://gist.github.com/user/xyz789",
          language: "Python",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
  });

  // ── #72: neotoma_repair ────────────────────────────────────────────────────

  it("stores a neotoma_repair entity without R2 rejection (#72)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-72-${randomUUID()}`,
      entities: [
        {
          entity_type: "neotoma_repair",
          canonical_name: "repair-missing-scope-column",
          schema_version: "1.0",
          title: "Missing scope column on schema_registry inserts",
          diagnosis_classification: "class_1",
          diagnosis:
            "Test schemas inserted without scope column were invisible to loadUserSpecificSchema.",
          trigger: "Integration test auth failure on #84 regression",
          applied_fix: "Added scope: 'user' to all test schema inserts",
          proactive_remediation_required: false,
          remediation_status: "resolved",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].canonical_name).toBe(
      "repair-missing-scope-column"
    );
  });

  it("stores a neotoma_repair entity with title as identity when no canonical_name (#72)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-72-no-cn-${randomUUID()}`,
      entities: [
        {
          entity_type: "neotoma_repair",
          schema_version: "1.0",
          title: "Auth bypass field not public",
          diagnosis: "authenticatedUserId is private; tests cannot set it.",
          applied_fix: "Cast to any to set private field in tests.",
          remediation_status: "resolved",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
  });

  // ── #77: transaction with explicit canonical_name ──────────────────────────

  it("stores a transaction entity with explicit canonical_name without rejection (#77)", async () => {
    // #77: store was rejected with "Cannot derive canonical_name for transaction"
    // even when canonical_name was explicitly supplied.  The fix hoists canonical_name
    // out of unknownFields before the resolver runs.
    //
    // For schemas with canonical_name_fields declared (like transaction), the composite
    // derivation from those fields still wins; the explicit canonical_name is a fallback
    // only when canonical_name_fields are absent or return null.  The critical fix is
    // that the store no longer errors — it succeeds and canonical_name is not unknown.
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-77-${randomUUID()}`,
      entities: [
        {
          entity_type: "transaction",
          canonical_name: "stripe-charge-ch-abc123",
          schema_version: "1.0",
          posting_date: "2026-05-01",
          category: "subscription",
          amount_original: 99.0,
          bank_provider: "stripe",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    // Store must not error (was the original bug: rejected even with canonical_name supplied)
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
    // canonical_name must NOT appear as an unknown field
    expect(response.unknown_fields_count).toBe(0);
  });
});
