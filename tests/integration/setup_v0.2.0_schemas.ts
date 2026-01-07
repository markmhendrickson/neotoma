// Setup schemas for v0.2.0 tests

import { schemaRegistry } from "../../src/services/schema_registry";

export async function setupTestSchemas() {
  // Register note schema
  try {
    const noteSchema = await schemaRegistry.register({
      entity_type: "note",
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          content: { type: "string" },
          created_at: { type: "date" },
        },
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "highest_priority" },
          content: { strategy: "highest_priority" },
          created_at: { strategy: "last_write" },
        },
      },
    });

    await schemaRegistry.activate("note", "1.0");

    // Register person schema
    const personSchema = await schemaRegistry.register({
      entity_type: "person",
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          email: { type: "string" },
          phone: { type: "string" },
        },
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "highest_priority" },
          email: { strategy: "highest_priority" },
          phone: { strategy: "highest_priority" },
        },
      },
    });

    await schemaRegistry.activate("person", "1.0");

    return { noteSchema, personSchema };
  } catch (error) {
    // Schemas might already exist
    console.log("Schemas already registered:", error);
  }
}





