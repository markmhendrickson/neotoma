/**
 * Unit tests for usage_digest entity schema registration (issue #1569).
 *
 * Verifies that:
 * - The `usage_digest` schema is present in ENTITY_SCHEMAS after bootstrap
 * - period_start and period_end are declared as string type (NOT date) — lexicographic
 *   sort must match temporal order for sort_by: "snapshot.period_end" to work correctly
 * - All required fields are declared as required
 * - canonical_name_fields covers the three-part composite identity
 * - name_collision_policy is "reject" (prevents silent merge of replayed digests)
 * - temporal_fields emits UsageDigestClosed on period_end
 * - reducer_config has merge policies for all relevant fields
 */

import { describe, it, expect } from "vitest";
import {
  ENTITY_SCHEMAS,
  getRegisteredEntityTypes,
  getSchemaDefinition,
} from "../../src/services/schema_definitions.js";

describe("usage_digest schema (#1569)", () => {
  const schema = ENTITY_SCHEMAS["usage_digest"];

  it("is registered in ENTITY_SCHEMAS", () => {
    expect(schema).toBeDefined();
    expect(schema.entity_type).toBe("usage_digest");
  });

  it("is retrievable via getSchemaDefinition", () => {
    const result = getSchemaDefinition("usage_digest");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("usage_digest");
  });

  it("appears in list of registered entity types", () => {
    const types: string[] = getRegisteredEntityTypes();
    expect(types).toContain("usage_digest");
  });

  describe("required fields", () => {
    it("schema_version is a required string", () => {
      const { fields } = schema.schema_definition;
      expect(fields.schema_version).toBeDefined();
      expect(fields.schema_version.type).toBe("string");
      expect(fields.schema_version.required).toBe(true);
    });

    it("period_start is a required STRING (not date) — lexicographic sort must match temporal order", () => {
      const { fields } = schema.schema_definition;
      expect(fields.period_start).toBeDefined();
      expect(fields.period_start.type).toBe("string");
      expect(fields.period_start.type).not.toBe("date");
      expect(fields.period_start.required).toBe(true);
    });

    it("period_end is a required STRING (not date) — used as sort_by: snapshot.period_end key", () => {
      const { fields } = schema.schema_definition;
      expect(fields.period_end).toBeDefined();
      expect(fields.period_end.type).toBe("string");
      expect(fields.period_end.type).not.toBe("date");
      expect(fields.period_end.required).toBe(true);
    });

    it("reporter_channel is a required string", () => {
      const { fields } = schema.schema_definition;
      expect(fields.reporter_channel).toBeDefined();
      expect(fields.reporter_channel.type).toBe("string");
      expect(fields.reporter_channel.required).toBe(true);
    });
  });

  describe("optional fields", () => {
    it("has all expected optional scalar fields with correct types", () => {
      const { fields } = schema.schema_definition;
      expect(fields.aauth_sub?.type).toBe("string");
      expect(fields.reporter_app_version?.type).toBe("string");
      expect(fields.reporter_git_sha?.type).toBe("string");
      expect(fields.error_rate?.type).toBe("number");
      expect(fields.effectiveness_signal?.type).toBe("string");
      expect(fields.notes?.type).toBe("string");
      expect(fields.redaction_salt?.type).toBe("string");
    });

    it("has all expected opaque object fields", () => {
      const { fields } = schema.schema_definition;
      expect(fields.operation_counts?.type).toBe("object");
      expect(fields.error_counts?.type).toBe("object");
      expect(fields.entity_type_usage?.type).toBe("object");
      expect(fields.tool_usage?.type).toBe("object");
      expect(fields.compliance_signals?.type).toBe("object");
    });

    it("compliance_signals is an optional opaque object with a last_write merge policy", () => {
      const { fields } = schema.schema_definition;
      expect(fields.compliance_signals?.type).toBe("object");
      expect(fields.compliance_signals?.required).not.toBe(true);
      expect(schema.reducer_config.merge_policies.compliance_signals?.strategy).toBe("last_write");
    });

    it("friction_notes is an array field", () => {
      const { fields } = schema.schema_definition;
      expect(fields.friction_notes?.type).toBe("array");
    });

    it("notes has preserveCase: true", () => {
      const { fields } = schema.schema_definition;
      expect((fields.notes as { preserveCase?: boolean })?.preserveCase).toBe(true);
    });
  });

  describe("canonical identity", () => {
    it("canonical_name_fields contains reporter_channel, period_start, and period_end", () => {
      const cnf = schema.schema_definition.canonical_name_fields;
      expect(cnf).toBeDefined();
      expect(Array.isArray(cnf)).toBe(true);
      const cnfArr = cnf as Array<string | { composite: string[] }>;
      expect(cnfArr).toContain("reporter_channel");
      expect(cnfArr).toContain("period_start");
      expect(cnfArr).toContain("period_end");
    });

    it("name_collision_policy is 'reject' (prevents silent merge of replayed digests)", () => {
      expect(schema.schema_definition.name_collision_policy).toBe("reject");
    });
  });

  describe("temporal fields", () => {
    it("temporal_fields emits UsageDigestClosed on period_end", () => {
      const tf = schema.schema_definition.temporal_fields;
      expect(tf).toBeDefined();
      expect(Array.isArray(tf)).toBe(true);
      const entry = tf?.find(
        (t: { field: string; event_type: string }) => t.field === "period_end"
      );
      expect(entry).toBeDefined();
      expect(entry?.event_type).toBe("UsageDigestClosed");
    });
  });

  describe("reducer config", () => {
    it("merge_policies reference only declared fields (no dangling policies)", () => {
      const fields = schema.schema_definition.fields;
      const policies = schema.reducer_config.merge_policies;
      for (const key of Object.keys(policies)) {
        expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
      }
    });

    it("operation_counts, error_counts, entity_type_usage, tool_usage use last_write", () => {
      const policies = schema.reducer_config.merge_policies;
      expect(policies.operation_counts?.strategy).toBe("last_write");
      expect(policies.error_counts?.strategy).toBe("last_write");
      expect(policies.entity_type_usage?.strategy).toBe("last_write");
      expect(policies.tool_usage?.strategy).toBe("last_write");
    });

    it("period_start, period_end, error_rate, effectiveness_signal use last_write", () => {
      const policies = schema.reducer_config.merge_policies;
      expect(policies.period_start?.strategy).toBe("last_write");
      expect(policies.period_end?.strategy).toBe("last_write");
      expect(policies.error_rate?.strategy).toBe("last_write");
      expect(policies.effectiveness_signal?.strategy).toBe("last_write");
    });

    it("friction_notes uses last_write (supersede, not accumulate)", () => {
      const policies = schema.reducer_config.merge_policies;
      expect(policies.friction_notes?.strategy).toBe("last_write");
    });
  });

  describe("metadata", () => {
    it("has correct label and category", () => {
      expect(schema.metadata.label).toBe("Usage Digest");
      expect(schema.metadata.category).toBe("agent_runtime");
    });

    it("declares guest_access_policy 'submit_only' (external observers write, cannot read back)", () => {
      expect((schema.metadata as { guest_access_policy?: string }).guest_access_policy).toBe(
        "submit_only"
      );
    });
  });
});
