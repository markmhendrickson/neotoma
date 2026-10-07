# `category_membership`

**Bundle:** `crm` · **Schema version:** 1.0

Places one entity type into a category and carries its presentation.

The schema file `../schemas/category_membership.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: `member_type`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field             | Type   | Required | Description                                                                                                                                                              |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `member_type`     | string | yes      | The entity type this row describes, e.g. 'task'. Unique across rows; the identity field. ('entity_type' is the store's own discriminator and cannot be a payload field.) |
| `category_slug`   | string | yes      | Slug of the category this type belongs to.                                                                                                                               |
| `label`           | string | no       | Display label for the type. Falls back to a humanised member_type.                                                                                                       |
| `icon`            | string | no       | Icon name within icon_collection.                                                                                                                                        |
| `icon_collection` | string | no       | Icon set the name resolves against, e.g. 'lucide'.                                                                                                                       |
| `sort_order`      | number | no       | Display order within the category, ascending.                                                                                                                            |

## Usage notes

Describes an entity TYPE, not an entity: `member_type` holds the type name because `entity_type` is the store's own discriminator. Relate it `PART_OF` its category.
