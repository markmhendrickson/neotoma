#!/usr/bin/env tsx
/**
 * One-shot CLI that seeds (or extends) the global `neotoma_feedback` entity
 * schema. Used during initial deployment of the Netlify -> Neotoma
 * forwarder (see docs/subsystems/feedback_neotoma_forwarder.md).
 *
 * Usage:
 *   npm run feedback:seed-schema
 *   # or
 *   tsx scripts/seed_product_feedback_schema.ts
 */

import { seedNeotomaFeedbackSchema } from "../src/services/feedback/seed_schema.js";

(async () => {
  try {
    const result = await seedNeotomaFeedbackSchema();
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          entity_type: result.entity_type,
          schema_version: result.schema_version,
          scope: result.scope ?? "global",
          active: result.active,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (err) {
    process.stderr.write(
      `[seed_product_feedback_schema] failed: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }
})();
