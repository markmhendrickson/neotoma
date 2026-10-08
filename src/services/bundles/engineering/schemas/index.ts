/**
 * Schemas the `engineering` bundle registers when enabled.
 *
 * `pull_request` and `issue_spec` are built-in types already defined in
 * `schema_definitions.ts`; the bundle reuses those definitions. `issue` is
 * provided by `infrastructure` and referenced as a shared schema.
 */

import type { EntitySchema } from "../../../schema_definitions.js";
import { ENTITY_SCHEMAS } from "../../../schema_definitions.js";
import { architecturalDecisionSchema } from "./architectural_decision.js";
import { bugReportSchema } from "./bug_report.js";
import { deploymentConfigurationSchema } from "./deployment_configuration.js";
import { prCommentSchema } from "./pr_comment.js";
import { prReviewSchema } from "./pr_review.js";
import { releaseResultSchema } from "./release_result.js";
import { repositorySchema } from "./repository.js";
import { securityFindingSchema } from "./security_finding.js";

export const engineeringSchemas: EntitySchema[] = [
  repositorySchema,
  ENTITY_SCHEMAS.pull_request,
  prReviewSchema,
  prCommentSchema,
  ENTITY_SCHEMAS.issue_spec,
  securityFindingSchema,
  releaseResultSchema,
  deploymentConfigurationSchema,
  architecturalDecisionSchema,
  bugReportSchema,
];

export default engineeringSchemas;
