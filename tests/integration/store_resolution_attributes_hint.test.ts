/**
 * v0.5.1 regression test: `ERR_STORE_RESOLUTION_FAILED` issues MUST include
 * a `hint` field guiding callers to flatten their payload when the request
 * nests fields under `attributes`.
 *
 * Context: v0.5.0 introduced a breaking change requiring entity fields at
 * the top level (no more `attributes: { ... }` nesting). Callers that still
 * send the pre-v0.5.0 shape get canonical-name resolution failures with
 * `seen_fields: ["attributes"]` (or `["entity_type", "attributes"]`). The
 * hint tells them exactly what to do.
 */

import { describe, expect, it, beforeAll } from "vitest";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

describe("POST /store attributes-nested payload hint", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("returns ERR_STORE_RESOLUTION_FAILED with an attributes hint when fields are nested under `attributes`", async () => {
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `attrs-hint-${Date.now()}`,
        commit: true,
        entities: [
          {
            entity_type: "task",
            attributes: {
              title: "Nested-under-attributes task (should be rejected)",
              canonical_name: "nested-under-attributes-task",
            },
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error?: {
        code?: string;
        issues?: Array<{
          code?: string;
          details?: { seen_fields?: unknown };
          hint?: string;
        }>;
      };
    };

    expect(body.error?.code).toBe("ERR_STORE_RESOLUTION_FAILED");
    expect(Array.isArray(body.error?.issues)).toBe(true);
    expect(body.error!.issues!.length).toBeGreaterThan(0);

    const issue = body.error!.issues![0]!;
    expect(issue.code).toBe("ERR_CANONICAL_NAME_UNRESOLVED");
    // seen_fields should include `attributes` and no other non-meta keys.
    expect(Array.isArray(issue.details?.seen_fields)).toBe(true);
    expect(issue.details?.seen_fields).toContain("attributes");
    // Hint must be present and mention both `attributes` and the v0.5.0
    // top-level convention.
    expect(typeof issue.hint).toBe("string");
    expect(issue.hint).toMatch(/attributes/);
    expect(issue.hint).toMatch(/top level|top-level/);
  });

  it("does NOT emit the attributes hint when the payload has other top-level fields", async () => {
    // A payload with normal top-level fields will either succeed or fail
    // with a different issue — but if it fails resolution, the hint MUST
    // NOT fire (seen_fields would include real keys, not just `attributes`).
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `no-attrs-hint-${Date.now()}`,
        commit: true,
        entities: [
          {
            // Intentionally unresolvable: provide only a throwaway field
            // that is not a canonical_name_field for any schema.
            entity_type: "task",
            some_arbitrary_throwaway_field_xyz: "value",
          },
        ],
      }),
    });

    if (res.status !== 400) {
      // If the server happened to accept this shape for any reason (e.g.
      // auto-resolution), the hint check is trivially satisfied — the test
      // only asserts the hint is not falsely injected when seen_fields is
      // NOT the attributes-only pattern.
      return;
    }
    const body = (await res.json()) as {
      error?: { issues?: Array<{ hint?: string }> };
    };
    const hints = (body.error?.issues ?? [])
      .map((i) => i?.hint)
      .filter((h): h is string => typeof h === "string");
    for (const hint of hints) {
      // Any other hint is fine; the specific attributes-nesting hint must
      // not appear for this payload shape.
      expect(hint).not.toMatch(/nests fields under `attributes`/);
    }
  });
});
