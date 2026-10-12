/**
 * `icp` (crm bundle) — an ideal customer profile: who to pursue, who not to,
 * and how fit is weighed. Persona/industry tier columns are deployment-specific
 * and stay in raw_fragments.
 */

import { defineBundleSchema, str, text } from "../../schema_helpers.js";

export const icpSchema = defineBundleSchema({
  entity_type: "icp",
  label: "Ideal Customer Profile",
  description: "An ideal customer profile: target buyers, non-buyers, and fit weighting.",
  fields: {
    name: { type: "string", required: true, preserveCase: true, description: "Profile name." },
    version: str("Profile version."),
    status: str("e.g. draft, active, superseded."),
    company: text("Company the profile is for."),
    positioning: text("Positioning the profile assumes."),
    services: text("Offerings the profile targets."),
    scenarios: text("Buying scenarios that fit."),
    company_profile: text("Firmographic profile of a good-fit company."),
    non_buyers: text("Who is explicitly not a fit."),
    scoring_weights: text("How fit signals are weighted."),
    outreach_constraints: text("Constraints on outreach."),
    known_gaps: text(),
    open_questions: text(),
    source_material: text("Material the profile was derived from."),
  },
  canonical_name_fields: ["name"],
});

export default icpSchema;
