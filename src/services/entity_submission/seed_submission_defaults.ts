/**
 * Submission intake bootstrap: registers the `submission_config` entity schema only.
 * Default `submission_config` rows (per target entity_type) are operator-owned — not repo-seeded.
 */

import { logger } from "../../utils/logger.js";
import { seedSubmissionConfigSchema } from "./seed_schema.js";

export async function seedSubmissionDefaults(): Promise<void> {
  try {
    await seedSubmissionConfigSchema();
  } catch (err) {
    logger.warn(`[entity_submission] seedSubmissionDefaults: ${(err as Error).message}`);
  }
}
