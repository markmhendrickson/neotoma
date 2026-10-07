/**
 * Schemas the `communications` bundle registers when enabled (email only;
 * social and publishing types belong to a later content bundle).
 *
 * `email` is a built-in type already defined in `schema_definitions.ts`; the
 * bundle reuses that definition rather than duplicating it.
 */

import type { EntitySchema } from "../../../schema_definitions.js";
import { ENTITY_SCHEMAS } from "../../../schema_definitions.js";
import { emailDraftSchema } from "./email_draft.js";
import { emailMessageSchema } from "./email_message.js";
import { emailThreadSchema } from "./email_thread.js";

export const communicationsSchemas: EntitySchema[] = [
  emailMessageSchema,
  emailThreadSchema,
  emailDraftSchema,
  ENTITY_SCHEMAS.email,
];

export default communicationsSchemas;
