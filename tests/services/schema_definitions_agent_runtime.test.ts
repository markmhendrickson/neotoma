/**
 * Registration + shape tests for the fleet-general agent runtime
 * schema family (v0.1) — fleet-general write integrity layer,
 * item-2-fleet-schemas.
 *
 * These tests exist to:
 *   1. Lock the six entity_types (agent_task, agent_attempt,
 *      agent_outcome, agent_artifact, agent_sensor_signal,
 *      agent_cycle_summary) so a later rename / accidental delete is
 *      caught immediately.
 *   2. Enforce the cross-cutting LCD contract: singular names, schema
 *      version pinned at `0.1.0`, category `agent_runtime`, required
 *      identity fields present, and canonical_name_fields declared.
 *   3. Assert the sensor schema locks its `observation_source_priority`
 *      override so sensor emissions keep beating LLM summaries for this
 *      entity type even if the registry default is relaxed later.
 */

import { describe, expect, it } from "vitest";
import {
  getSchemaDefinition,
  getRegisteredEntityTypes,
} from "../../src/services/schema_definitions.js";

const AGENT_RUNTIME_TYPES = [
  "agent_task",
  "agent_attempt",
  "agent_outcome",
  "agent_artifact",
  "agent_sensor_signal",
  "agent_cycle_summary",
] as const;

const REQUIRED_IDENTITY_FIELD: Record<(typeof AGENT_RUNTIME_TYPES)[number], string> = {
  agent_task: "task_id",
  agent_attempt: "attempt_id",
  agent_outcome: "outcome_id",
  agent_artifact: "artifact_id",
  agent_sensor_signal: "sensor_id",
  agent_cycle_summary: "cycle_id",
};

describe("fleet-general agent_* schemas v0.1", () => {
  it("registers all six entity types", () => {
    const registered = getRegisteredEntityTypes();
    for (const entityType of AGENT_RUNTIME_TYPES) {
      expect(
        registered,
        `expected ${entityType} to be registered`,
      ).toContain(entityType);
    }
  });

  it.each(AGENT_RUNTIME_TYPES)(
    "%s follows the fleet-general v0.1 contract (singular name, schema_version 0.1.0, category agent_runtime, identity field present, canonical_name_fields declared)",
    (entityType) => {
      const schema = getSchemaDefinition(entityType);
      expect(schema, `${entityType} schema missing`).not.toBeNull();
      expect(schema!.entity_type).toBe(entityType);
      expect(entityType.endsWith("s")).toBe(false);
      expect(schema!.schema_version).toBe("0.1.0");
      expect(schema!.metadata?.category).toBe("agent_runtime");

      const identityField = REQUIRED_IDENTITY_FIELD[entityType];
      const fieldDef = schema!.schema_definition.fields[identityField];
      expect(
        fieldDef,
        `${entityType} is missing required identity field ${identityField}`,
      ).toBeDefined();
      expect(fieldDef!.required).toBe(true);

      expect(
        schema!.schema_definition.canonical_name_fields,
        `${entityType} must declare canonical_name_fields`,
      ).toBeDefined();
    },
  );

  it("agent_attempt.task_id and agent_outcome.attempt_id are declared as required link fields", () => {
    const attempt = getSchemaDefinition("agent_attempt")!;
    expect(attempt.schema_definition.fields.task_id?.required).toBe(true);

    const outcome = getSchemaDefinition("agent_outcome")!;
    expect(outcome.schema_definition.fields.attempt_id?.required).toBe(true);

    const artifact = getSchemaDefinition("agent_artifact")!;
    expect(artifact.schema_definition.fields.outcome_id?.required).toBe(true);
  });

  it("agent_sensor_signal locks observation_source_priority so sensor emissions outrank LLM summaries", () => {
    const sensor = getSchemaDefinition("agent_sensor_signal")!;
    expect(sensor.reducer_config.observation_source_priority).toEqual([
      "sensor",
      "workflow_state",
      "llm_summary",
      "human",
      "import",
    ]);
  });

  it("does NOT declare agent_sub / agent_id as a schema field (identity lives in provenance via AAuth)", () => {
    for (const entityType of AGENT_RUNTIME_TYPES) {
      const schema = getSchemaDefinition(entityType)!;
      const fields = schema.schema_definition.fields;
      expect(Object.keys(fields)).not.toContain("agent_id");
      expect(Object.keys(fields)).not.toContain("agent_sub");
    }
  });
});
