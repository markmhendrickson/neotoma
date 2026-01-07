#!/usr/bin/env tsx
/**
 * Register and activate contact schema version 1.1 with missing fields
 * Fixes: ingest_structured creates 0 observations due to missing name, email, phone fields
 */

import { schemaRegistry } from "../src/services/schema_registry.js";
import { EXPANDED_RECORD_TYPE_SCHEMAS } from "../src/services/schema_definitions.js";

async function registerContactSchemaV1_1() {
  const contactSchema = EXPANDED_RECORD_TYPE_SCHEMAS.contact;
  
  if (!contactSchema || contactSchema.entity_type !== "contact") {
    throw new Error("Contact schema not found in EXPANDED_RECORD_TYPE_SCHEMAS");
  }

  if (contactSchema.schema_version !== "1.1") {
    throw new Error(`Expected schema version 1.1, got ${contactSchema.schema_version}`);
  }

  console.log("Registering contact schema v1.1...");
  
  try {
    // Register the schema
    const registered = await schemaRegistry.register({
      entity_type: contactSchema.entity_type!,
      schema_version: contactSchema.schema_version!,
      schema_definition: contactSchema.schema_definition!,
      reducer_config: contactSchema.reducer_config!,
    });

    console.log(`✓ Registered contact schema v${contactSchema.schema_version} (ID: ${registered.id})`);

    // Activate the schema
    await schemaRegistry.activate(contactSchema.entity_type!, contactSchema.schema_version!);
    
    console.log(`✓ Activated contact schema v${contactSchema.schema_version}`);
    console.log("\nSchema fields:", Object.keys(contactSchema.schema_definition!.fields).join(", "));
    
    return registered;
  } catch (error: any) {
    if (error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
      console.log("Schema already registered, activating...");
      await schemaRegistry.activate(contactSchema.entity_type!, contactSchema.schema_version!);
      console.log(`✓ Activated contact schema v${contactSchema.schema_version}`);
      return;
    }
    throw error;
  }
}

registerContactSchemaV1_1()
  .then(() => {
    console.log("\n✓ Contact schema v1.1 registration complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("✗ Failed to register contact schema:", error);
    process.exit(1);
  });
