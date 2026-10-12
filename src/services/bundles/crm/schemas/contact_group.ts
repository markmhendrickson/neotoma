/**
 * `contact_group` (crm bundle) — membership of a contact in a named group or
 * list (e.g. an imported cohort). One row per (group, member), as written
 * today; relate it to the member with REFERS_TO contact.
 */

import { defineBundleSchema, num, str, text } from "../../schema_helpers.js";

export const contactGroupSchema = defineBundleSchema({
  entity_type: "contact_group",
  label: "Contact Group",
  description: "A contact's membership in a named group or list.",
  aliases: ["contact_list"],
  fields: {
    title: text("Name of the group."),
    full_name: text("Name of the member."),
    source_contact_id: str("Identifier of the member in the source system."),
    year: num("Year the membership applies to, when the group is periodic."),
  },
  canonical_name_fields: [
    { composite: ["title", "source_contact_id"] },
    { composite: ["title", "full_name"] },
  ],
});

export default contactGroupSchema;
