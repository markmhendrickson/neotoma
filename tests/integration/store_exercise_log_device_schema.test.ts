/**
 * Regression tests for issues #204 and #188:
 *
 * #204 — `exercise_log` schema missing `canonical_name_fields` — storing an
 *        exercise_log entity without an explicit `name` field caused a hard
 *        "Cannot derive canonical_name" error. Fixed by adding a built-in
 *        `exercise_log` schema to ENTITY_SCHEMAS with
 *        `canonical_name_fields: [{ composite: ["exercise", "date", "set_number"] }, { composite: ["exercise", "date"] }]`.
 *
 * #188 — `device` schema blocked incremental field extension because it had no
 *        `canonical_name_fields` or `identity_opt_out` declaration. Fixed by
 *        adding a built-in `device` schema to ENTITY_SCHEMAS with
 *        `canonical_name_fields: ["name"]`.
 */

import { describe, it, expect } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import { getSchemaDefinition } from "../../src/services/schema_definitions.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store: exercise_log canonical_name_fields (#204)", () => {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = TEST_USER_ID;

  it("stores an exercise_log entity without an explicit name field (#204)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-204-${randomUUID()}`,
      entities: [
        {
          entity_type: "exercise_log",
          schema_version: "1.0",
          exercise: "Bench Press",
          reps: 10,
          set_number: 1,
          set_type: "warmup",
          weight_kg: 60,
          date: "2026-05-16",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
  });

  it("stores an exercise_log entity without set_number using the exercise+date fallback rule (#204)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-204-no-set-${randomUUID()}`,
      entities: [
        {
          entity_type: "exercise_log",
          schema_version: "1.0",
          exercise: "5k Run",
          date: "2026-05-16",
          duration_seconds: 1800,
          distance_meters: 5000,
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
  });

  it("exercise_log schema has canonical_name_fields declared in ENTITY_SCHEMAS (#204)", () => {
    const schema = getSchemaDefinition("exercise_log");
    expect(schema).not.toBeNull();
    expect(schema!.schema_definition.canonical_name_fields).toBeDefined();
    expect(schema!.schema_definition.identity_opt_out).toBeUndefined();
  });
});

describe("store: device canonical_name_fields (#188)", () => {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = TEST_USER_ID;

  it("stores a device entity without error (#188)", async () => {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-188-${randomUUID()}`,
      entities: [
        {
          entity_type: "device",
          schema_version: "1.0",
          name: "Nest Thermostat",
          brand: "Google",
          device_type: "thermostat",
          protocol: "wifi",
          local_api_available: false,
          cloud_dependent: true,
          floor: "1",
          location_in_home: "hallway",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeUndefined();
    expect(response.entities).toHaveLength(1);
    expect(response.entities[0].entity_id).toBeTruthy();
  });

  it("device schema has canonical_name_fields declared in ENTITY_SCHEMAS (#188)", () => {
    const schema = getSchemaDefinition("device");
    expect(schema).not.toBeNull();
    expect(schema!.schema_definition.canonical_name_fields).toBeDefined();
    expect(schema!.schema_definition.identity_opt_out).toBeUndefined();
  });
});
