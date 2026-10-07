# `contact_group`

**Bundle:** `crm` · **Schema version:** 1.0

**Aliases:** `contact_list`

A contact's membership in a named group or list.

The schema file `../schemas/contact_group.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: (`title` + `source_contact_id`), then (`title` + `full_name`). When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field               | Type   | Required | Description                                                 |
| ------------------- | ------ | -------- | ----------------------------------------------------------- |
| `title`             | string | no       | Name of the group.                                          |
| `full_name`         | string | no       | Name of the member.                                         |
| `source_contact_id` | string | no       | Identifier of the member in the source system.              |
| `year`              | number | no       | Year the membership applies to, when the group is periodic. |

## Usage notes

One row per (group, member). Relate it `REFERS_TO` the member `contact`. `contact_list` is an alias.
