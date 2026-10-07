/**
 * `category_membership` (crm bundle) — places one entity TYPE into a
 * category and carries how that type is presented. One row per entity type,
 * related PART_OF its category. Field set matches production exactly.
 */

import { defineBundleSchema, num, str } from "../../schema_helpers.js";

export const categoryMembershipSchema = defineBundleSchema({
  entity_type: "category_membership",
  label: "Category Membership",
  description: "Places one entity type into a category and carries its presentation.",
  fields: {
    member_type: {
      type: "string",
      required: true,
      description:
        "The entity type this row describes, e.g. 'task'. Unique across rows; the identity field. " +
        "('entity_type' is the store's own discriminator and cannot be a payload field.)",
    },
    category_slug: {
      type: "string",
      required: true,
      description: "Slug of the category this type belongs to.",
    },
    label: str("Display label for the type. Falls back to a humanised member_type."),
    icon: str("Icon name within icon_collection."),
    icon_collection: str("Icon set the name resolves against, e.g. 'lucide'."),
    sort_order: num("Display order within the category, ascending."),
  },
  canonical_name_fields: ["member_type"],
});

export default categoryMembershipSchema;
