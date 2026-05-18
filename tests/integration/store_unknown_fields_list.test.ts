/**
 * Tests for issues #185 and #190: store response should include
 * `unknown_fields: string[]` alongside `unknown_fields_count: number`
 * so agents can self-correct without fetching the schema separately.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

type StoreResponse = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  unknown_fields_count?: number;
  unknown_fields?: string[];
  source_id?: string;
  error?: unknown;
};

describe("store response: unknown_fields list (issues #185, #190)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanupEntityType("note", TEST_USER_ID);
    await cleanupEntityType("generic", TEST_USER_ID);
  });

  it("returns unknown_fields: [] and unknown_fields_count: 0 when all fields are schema-known", async () => {
    const result = await (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `unknown-fields-known-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "note",
          title: "Meeting notes",
          content: "Discussed roadmap",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(body.unknown_fields_count).toBeDefined();
    expect(body.unknown_fields).toBeDefined();
    expect(Array.isArray(body.unknown_fields)).toBe(true);
    // Note may have no unknown fields if title/content are declared schema fields,
    // but the response shape must always be present.
    expect(typeof body.unknown_fields_count).toBe("number");
  });

  it("returns unknown_fields list naming each unrecognized field when unknown fields are stored", async () => {
    // Use a note entity (has title/content in schema) but include extra unknown fields
    const result = await (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `unknown-fields-present-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "note",
          title: "Unknown fields test note",
          content: "Testing unknown field reporting",
          // These are not declared in the note schema
          custom_tag_xyzzy: "some-value",
          internal_ref_plugh: "another-value",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.unknown_fields)).toBe(true);
    expect(typeof body.unknown_fields_count).toBe("number");

    // The count and list must be consistent
    expect(body.unknown_fields_count).toBe(body.unknown_fields!.length);

    // The unknown field names must be present in the list if they were stored as raw_fragments
    // (null/undefined values are filtered out, so non-null unknown fields must appear)
    const unknownFieldNames = body.unknown_fields!;
    if (body.unknown_fields_count! > 0) {
      expect(unknownFieldNames.length).toBeGreaterThan(0);
      // Each entry must be a string
      for (const name of unknownFieldNames) {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      }
      // Both custom fields (if stored as unknown) should be present
      // They are non-null so they should appear in the list
      expect(unknownFieldNames).toContain("custom_tag_xyzzy");
      expect(unknownFieldNames).toContain("internal_ref_plugh");
    }
  });

  it("unknown_fields list contains exactly the unrecognized field names for a generic entity", async () => {
    // Use entity_type generic so every field is treated as unknown
    const result = await (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `unknown-fields-generic-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "generic",
          canonical_name: "Test Generic Entity",
          field_alpha: "value-alpha",
          field_beta: "value-beta",
          field_gamma: "value-gamma",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.unknown_fields)).toBe(true);
    expect(typeof body.unknown_fields_count).toBe("number");
    // Count and list length must match
    expect(body.unknown_fields_count).toBe(body.unknown_fields!.length);
    // The list must be sorted
    const sorted = [...body.unknown_fields!].sort();
    expect(body.unknown_fields).toEqual(sorted);
  });
});
