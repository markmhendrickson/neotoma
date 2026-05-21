# Bundles

**Status:** Definition lock (m1 of the Bundles Strategy, plan `ent_089da2ecebc3bd804d63dcf2`). Runtime delivery lands in m2.

## Purpose

A **bundle** is the deliverable unit through which Neotoma ships schemas, record-type docs, and skills. Bundles compose to satisfy user use cases. The mapping between bundles and use cases is many-to-many: one use case is typically served by a set of bundles, and one bundle typically serves multiple use cases.

This document is the canonical reference for the bundle model. It locks the user-facing structure that m2 implements.

## Why bundles

Before bundles, Neotoma's deliverables fanned out across four loosely coordinated layers (use cases, skills, schemas, record types) with no single packaging unit. Bundles consolidate that hierarchy into one coherent delivery vehicle:

- Use cases stay user-goal-oriented.
- Bundles become the unit you install, disable, and version.
- Schemas, record-type docs, and skills travel together when they belong together.

A bundle is not the same as a use case. A use case is *what the user is trying to accomplish*; a bundle is *what Neotoma ships to make that possible*.

## Two bundle types

### Schema bundles

Primary contribution: entity types and record-type docs.

- `provides_entity_types`: non-empty
- May ship supporting skills
- Examples: `crm`, `financial_ops`, `contracts`, `communications`, `personal_data`

### Skill bundles

Primary contribution: skills.

- `provides_entity_types: []` by design
- MUST declare `requires_bundles:` for any schema dependencies
- Examples: `core_workflows`, `meeting_prep`, `weekly_review`

## Default install

Three bundles ship in every Neotoma install:

| Bundle | Type | Always active | Provides |
|---|---|---|---|
| `core` | schema | yes | `conversation`, `conversation_message`, `agent_message`, `note`, `task`, `event`, `contact`, `file_asset`, `document` |
| `infrastructure` | schema | yes | `issue`, `plan`, `subscription`, `submission_config`, `peer_config`, `sandbox_abuse_report` |
| `core_workflows` | skill | yes | Skills: `start-session`, `get-context`, `close-session`. Adds `interaction` and `session_close` to `core` shared schemas. |

## Bundle anatomy

```
<bundle_name>/
  manifest.yaml
  schemas/                   # references to shared schemas, or originated definitions
    <entity_type>.ts
  skills/                    # harness-portable SKILL.md files
    <skill_name>/SKILL.md
  record_types/              # canonical record-type docs
    <record_type>.md
  tests/
```

### manifest.yaml field reference

| Field | Type | Description |
|---|---|---|
| `name` | string | Bundle identifier (snake_case). |
| `version` | semver | Bundle version. |
| `description` | string | One-line summary. |
| `bundle_type` | `schema` \| `skill` | Bundle classification. |
| `requires_bundles` | list | Bundle dependencies. Resolved at install time. |
| `provides_entity_types` | list | Types this bundle *originates*. MUST be empty for skill bundles. |
| `references_shared_schemas` | list | Shared schemas this bundle reuses without re-registering. Triggers automatic ownership transfer (see below). |
| `extends_schemas` | list | Explicit field-level extensions to schemas owned elsewhere. |
| `provides_skills` | list | Skill names with their dependencies and depth tiers. |
| `compatible_modes` | list | Lock postures supported. Defaults to all three. |
| `category` | string | Populates the existing `SchemaMetadata.category` field. |
| `serves_use_cases` | list | Informational. Use case ids the bundle contributes to. |

### Shared schemas

Path: `src/services/bundles/_shared_schemas/`.

Holds the canonical `SchemaDefinition` for any entity type used by 2+ bundles. When bundle B declares `references_shared_schemas: [X]` for a schema X originated in bundle A, the loader (at build or install time) moves X to `_shared_schemas/X.ts` and records `originated_by: A`. The linter `npm run bundles:check` catches inconsistencies. Ownership transfer is automatic at the second reference; no manual coordination is required.

## Lock postures

Neotoma exposes three schema-evolution modes via the environment variable `NEOTOMA_SCHEMA_MODE`:

| Value | Behavior |
|---|---|
| `evolving` (default) | Any entity type may auto-create on first write. This is the historical default and current behavior. |
| `guided` | Only entity types provided by installed bundles may auto-create. Unknown types are rejected with a structured error pointing at the bundle that provides them. |
| `locked` | No auto-create. All entity types MUST be registered explicitly via an installed bundle. |

m1 introduces the env var with default `evolving` and no enforcement beyond surfacing the value. m2 gates the two auto-create points (`src/server.ts:4416` and `src/services/interpretation.ts:225`) on the mode.

See also: the public FAQ entry "What's the difference between evolving, guided, and locked schema modes in Neotoma?" at `docs/site/faq/schema_modes.md`.

## Skills and bundles

Skills are first-class bundle contents. Skill bundles deliver skills as their primary contribution; schema bundles MAY also ship supporting skills.

### Skill source attribution

Every skill carries a `source:` field in its SKILL.md frontmatter:

| Value | Meaning |
|---|---|
| `neotoma_core` | Ships with the Neotoma runtime itself. |
| `neotoma_bundle:<bundle_name>` | Ships from a named bundle. |
| `user` | Authored by the user in their workspace. |

Collision precedence: `user > neotoma_bundle > neotoma_core`. When two sources provide a skill with the same name, the higher-precedence source wins.

### Skill auto-loading and schema auto-install

Per the parallel plan `ent_b5a51d1395d206e10945b6b1` (Resolve #205), skills are harness-owned. When a skill is installed:

- If all required entity types are present: the skill registers and is available.
- If some are missing under `evolving`: the missing types auto-create on first write.
- If some are missing under `guided` or `locked`: the loader identifies the providing bundles and prompts the user to install them.

## Disable, not uninstall

Uninstall is not supported. Bundles MAY be **disabled**:

- Skills from disabled bundles stop auto-loading.
- Schemas from disabled bundles stay registered but become inactive for new auto-create under `guided`/`locked`.
- Existing data referencing disabled-bundle types is preserved.

This removes the orphan-data problem that uninstall would introduce.

## Use cases and bundles

Use cases and bundles are many-to-many. A use case lists the set of bundles that together serve it; a bundle lists the use cases it contributes to (`serves_use_cases`). This decoupling lets a single bundle (e.g. `financial_ops`) serve many use cases (`diligence`, `portfolio`, `procurement`, `trading`) without duplication.

The human-readable mapping for the 16 existing use case docs ships in this file (below). The machine-readable mapping (`use_cases/*.yaml`) lands in m2 under `src/services/bundles/use_cases/`.

## Reconciled bundle catalog

The 16 use cases under `docs/use_cases/` map to the following bundle compositions. Every use case includes `core_workflows` (the session-loop skill bundle in the default install). `core` and `infrastructure` are implicit (always active) and omitted from the schema-bundle column unless a use case depends on infrastructure types directly.

| Use case | Schema bundles | Skill bundles | Description |
|---|---|---|---|
| `agent_auth` | `infrastructure`, `agent_auth` | `core_workflows` | Agent authorization and capability scoping. |
| `cases` | `cases`, `crm` | `core_workflows` | Legal cases and investigation casework. |
| `compliance` | `contracts`, `compliance` | `core_workflows` | Vendor risk and regulatory compliance. |
| `contracts` | `contracts` | `core_workflows` | Contract lifecycle management. |
| `crm` | `crm`, `communications` | `core_workflows` | Customer relationship management. |
| `crypto_engineering` | `crypto_engineering` | `core_workflows` | Crypto and security engineering. |
| `customer_ops` | `crm`, `customer_ops` | `core_workflows` | Support and CX operations. |
| `diligence` | `crm`, `financial_ops`, `contracts`, `diligence` | `core_workflows` | M&A and investment diligence. |
| `financial_ops` | `financial_ops` | `core_workflows` | Financial operations and accounting. |
| `government` | `government`, `compliance` | `core_workflows` | Public sector and GovTech workflows. |
| `healthcare` | `healthcare`, `personal_data` | `core_workflows` | Healthcare operations. |
| `logistics` | `logistics`, `financial_ops` | `core_workflows` | Logistics and supply chain. |
| `personal_data` | `personal_data` | `core_workflows` | Personal agent state. |
| `portfolio` | `financial_ops`, `portfolio` | `core_workflows` | Portfolio monitoring. |
| `procurement` | `financial_ops`, `contracts`, `procurement` | `core_workflows` | Procurement and sourcing. |
| `trading` | `financial_ops`, `trading` | `core_workflows` | Autonomous trading agents. |

### Catalog notes

- `cases` is treated as a single use case covering both legal cases and support investigation casework, per the existing `docs/use_cases/cases.md`. If usage diverges, a future split is possible without breaking the bundle model.
- `communications` is referenced as a shared schema bundle by `crm`. It is not present as a standalone use case; its types are expected to live in `crm` until a second consumer triggers shared-schema ownership transfer.
- New schema bundles introduced by this catalog (not yet implemented; m2 deliverable): `agent_auth`, `cases`, `compliance`, `crypto_engineering`, `customer_ops`, `diligence`, `government`, `healthcare`, `logistics`, `portfolio`, `procurement`, `trading`.

## Related documents

- `docs/use_cases/README.md` — Use case index and Bundle composition section.
- `docs/skills/core_workflows/` — Specifications for the three default-install skills.
- `docs/site/faq/schema_modes.md` — Public FAQ entry on lock postures.
- Plan `ent_089da2ecebc3bd804d63dcf2` — Bundles Strategy.
- Plan `ent_b5a51d1395d206e10945b6b1` — Skill auto-loading (Resolve #205).
