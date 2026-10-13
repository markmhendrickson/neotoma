// Setup schemas for v0.2.0 tests

import { schemaRegistry } from "../../src/services/schema_registry";

// `note` and `person` are BUILT-IN entity types, and the built-in definitions
// are seeded at version "1.0" with their own field sets (note keys on
// title/content, not name). Registering these fixtures at "1.0" therefore
// collided with the seeded rows, `register` rejected the duplicate, the old
// catch-all below swallowed that rejection, and the built-in schema stayed
// active. The tests then extracted a `name` field that the ACTIVE schema did
// not declare, so every field was dropped as unknown and interpretation runs
// produced zero observations — surfacing only as `expected 0 to be greater
// than 0` in IT-003 and IT-009, far from the real cause.
//
// Registering at a fixture-specific version keeps these schemas distinct from
// the built-ins, and activating them makes them win schema resolution.
const FIXTURE_SCHEMA_VERSION = "0.2.0-test";

export async function setupTestSchemas() {
  const noteSchema = await schemaRegistry.register({
    entity_type: "note",
    schema_version: FIXTURE_SCHEMA_VERSION,
    schema_definition: {
      fields: {
        name: { type: "string", required: true },
        content: { type: "string" },
        created_at: { type: "date" },
      },
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        content: { strategy: "highest_priority" },
        created_at: { strategy: "last_write" },
      },
    },
  });

  await schemaRegistry.activate("note", FIXTURE_SCHEMA_VERSION);

  const personSchema = await schemaRegistry.register({
    entity_type: "person",
    schema_version: FIXTURE_SCHEMA_VERSION,
    schema_definition: {
      fields: {
        name: { type: "string", required: true },
        email: { type: "string" },
        phone: { type: "string" },
      },
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        email: { strategy: "highest_priority" },
        phone: { strategy: "highest_priority" },
      },
    },
  });

  await schemaRegistry.activate("person", FIXTURE_SCHEMA_VERSION);

  return { noteSchema, personSchema };
}
