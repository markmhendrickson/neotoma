/**
 * Schemas the `crm` bundle registers when enabled.
 *
 * `company` and `person` are built-in types already defined in
 * `schema_definitions.ts`; the bundle reuses those definitions rather than
 * duplicating them (`organization` is an alias of `company`). `contact` is
 * provided by `core` and referenced as a shared schema, so it is not listed.
 */

import type { EntitySchema } from "../../../schema_definitions.js";
import { ENTITY_SCHEMAS } from "../../../schema_definitions.js";
import { categoryMembershipSchema } from "./category_membership.js";
import { contactGroupSchema } from "./contact_group.js";
import { icpSchema } from "./icp.js";
import { leadEvaluationSchema } from "./lead_evaluation.js";
import { leadUpdateSchema } from "./lead_update.js";
import { opportunitySchema } from "./opportunity.js";
import { outreachInteractionSchema } from "./outreach_interaction.js";

export const crmSchemas: EntitySchema[] = [
  ENTITY_SCHEMAS.company,
  ENTITY_SCHEMAS.person,
  leadUpdateSchema,
  leadEvaluationSchema,
  opportunitySchema,
  contactGroupSchema,
  icpSchema,
  categoryMembershipSchema,
  outreachInteractionSchema,
];

export default crmSchemas;
