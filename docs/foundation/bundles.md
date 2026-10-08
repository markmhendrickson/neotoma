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

A bundle is not the same as a use case. A use case is _what the user is trying to accomplish_; a bundle is _what Neotoma ships to make that possible_.

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

| Bundle           | Type   | Always active | Provides                                                                                                                  |
| ---------------- | ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `core`           | schema | yes           | `conversation`, `conversation_message`, `agent_message`, `note`, `task`, `event`, `contact`, `file_asset`, `document`     |
| `infrastructure` | schema | yes           | `issue`, `plan`, `subscription`, `submission_config`, `peer_config`, `sandbox_abuse_report`                               |
| `core_workflows` | skill  | yes           | Skills: `start-session`, `get-context`, `close-session`. Adds `interaction` and `session_close` to `core` shared schemas. |

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

| Field                       | Type                | Description                                                                                                  |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `name`                      | string              | Bundle identifier (snake_case).                                                                              |
| `version`                   | semver              | Bundle version.                                                                                              |
| `description`               | string              | One-line summary.                                                                                            |
| `bundle_type`               | `schema` \| `skill` | Bundle classification.                                                                                       |
| `requires_bundles`          | list                | Bundle dependencies. Resolved at install time.                                                               |
| `provides_entity_types`     | list                | Types this bundle _originates_. MUST be empty for skill bundles.                                             |
| `references_shared_schemas` | list                | Shared schemas this bundle reuses without re-registering. Triggers automatic ownership transfer (see below). |
| `extends_schemas`           | list                | Explicit field-level extensions to schemas owned elsewhere.                                                  |
| `provides_skills`           | list                | Skill names with their dependencies and depth tiers.                                                         |
| `compatible_modes`          | list                | Lock postures supported. Defaults to all three.                                                              |
| `category`                  | string              | Populates the existing `SchemaMetadata.category` field.                                                      |
| `serves_use_cases`          | list                | Informational. Use case ids the bundle contributes to.                                                       |

### Shared schemas

Path: `src/services/bundles/_shared_schemas/`.

Holds the canonical `SchemaDefinition` for any entity type used by 2+ bundles. When bundle B declares `references_shared_schemas: [X]` for a schema X originated in bundle A, the loader (at build or install time) moves X to `_shared_schemas/X.ts` and records `originated_by: A`. The linter `npm run bundles:check` catches inconsistencies. Ownership transfer is automatic at the second reference; no manual coordination is required.

## Lock postures

Neotoma exposes three schema-evolution modes via the environment variable `NEOTOMA_SCHEMA_MODE`:

| Value                | Behavior                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evolving` (default) | Any entity type may auto-create on first write. This is the historical default and current behavior.                                                           |
| `guided`             | Only entity types provided by installed bundles may auto-create. Unknown types are rejected with a structured error pointing at the bundle that provides them. |
| `locked`             | No auto-create. All entity types MUST be registered explicitly via an installed bundle.                                                                        |

m1 introduces the env var with default `evolving` and no enforcement beyond surfacing the value. m2 gates the two auto-create points (`src/server.ts:4416` and `src/services/interpretation.ts:225`) on the mode.

See also: the public FAQ entry "What's the difference between evolving, guided, and locked schema modes in Neotoma?" at `docs/site/faq/schema_modes.md`, and the public-site guide `docs/site/pages/en/schemas/locked_vs_evolving.md` ("Locked vs evolving schemas") for an operator-facing walkthrough.

## Skills and bundles

Skills are first-class bundle contents. Skill bundles deliver skills as their primary contribution; schema bundles MAY also ship supporting skills.

### Skill source attribution

Every skill carries a `source:` field in its SKILL.md frontmatter:

| Value                          | Meaning                                  |
| ------------------------------ | ---------------------------------------- |
| `neotoma_core`                 | Ships with the Neotoma runtime itself.   |
| `neotoma_bundle:<bundle_name>` | Ships from a named bundle.               |
| `user`                         | Authored by the user in their workspace. |

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

## Opt-in schema bundles

Beyond the default install, these schema bundles ship today. Each is disabled until installed (`neotoma bundles install <name>` or the `manage_bundles` MCP tool). Their scope comes from a usage audit of production data: a type ships only if it has real usage, and its field set is the generic subset of how it is written today. Deployment-specific or provider-specific fields stay in `raw_fragments`.

| Bundle           | Provides                                                                                                                                                                        | References (shared)             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `crm`            | `company` (alias `organization`), `person`, `lead_update`, `lead_evaluation`, `opportunity`, `contact_group`, `icp`, `category_membership`, `outreach_interaction`              | `contact` (from `core`)         |
| `engineering`    | `repository`, `pull_request`, `pr_review`, `pr_comment`, `issue_spec`, `security_finding`, `release_result`, `deployment_configuration`, `architectural_decision`, `bug_report` | `issue` (from `infrastructure`) |
| `communications` | `email_message`, `email_thread`, `email_draft`, `email`                                                                                                                         | —                               |

Deliberately excluded: `deal`, `account`, `engagement`, and `pipeline_stage` (no real usage), and post/social types (a later content bundle). Per-type docs live in each bundle's `record_types/` directory.

### Bundle schemas and seeding

A bundle-originated schema lives at `<bundle>/schemas/<entity_type>.ts` and is mapped to its bundle in `src/services/bundles/bundle_schemas.ts`. It is **not** added to the built-in `ENTITY_SCHEMAS`: a built-in is a code-level fallback present on every install, so the `guided` gate never runs for it. Keeping bundle schemas out of it means a bundle type is unprovided (rejected under `guided`) until its bundle is enabled.

Some provided types already had built-in definitions (`company`, `person`, `pull_request`, `issue_spec`, `email`). The bundle reuses those definitions rather than duplicating them, and they stay built-ins, so they remain storable on every install whatever the bundle state. Moving them out of `ENTITY_SCHEMAS` would change behavior for existing `evolving` installs and is out of scope here.

Enabling a bundle registers its schemas through the same additive seeder as the built-ins (`seedSchemaRegistryIfEmpty`): a type with an active global schema is left untouched, so seeding is idempotent and never reverts an operator's custom schema. Registered rows carry `metadata.bundle` and `metadata.bundle_version`. Seeding runs:

- at server boot, for every enabled bundle (right after the built-in seeder);
- immediately on `manage_bundles install|enable`, reported as `schema_seed` in the response.

`manage_bundles` runs inside the server, so its changes apply at once. If seeding fails, the response keeps `ok: true` (the bundle is enabled), sets `schema_seed.ok: false`, and adds a top-level `warning`.

`neotoma bundles install|enable|disable` from the CLI only writes the local bundle state file. A running server reads that file once at startup, so a CLI change reaches it at its next restart (when enabled bundles are also seeded), and never reaches a server on another machine. The CLI says so in its output. Use `manage_bundles` for immediate effect.

`npm run bundles:check` enforces that a bundle's schemas and its `provides_entity_types` match exactly, and that every schema declares an identity rule.

### Aliases

A bundle schema's aliases are written to `schema_definition.aliases`, the field read for registered schemas: by the store path's type-equivalence check and by extraction-time alias resolution. After the bundle registers its schemas, a write under `contact_list`, `outreach_activity`, or `decision_record` lands on `contact_group`, `outreach_interaction`, or `architectural_decision`. Before that, these names are unknown types.

Built-in aliases work differently, and the split matters for three bundle types. `email_message` and `email_thread` are aliases of the built-in `email`, and `bug_report` is an alias of the built-in `product_feedback`. Until the owning bundle has registered its schema, writes under those names resolve to the built-in. Once registered, the registered schema takes priority over the built-in alias.

Enabling a bundle does not move existing data. Rows written under one of these names before the bundle registered its schema were stored as the built-in type (`email` or `product_feedback`) and stay there. Only writes after registration land on the bundle type. The same holds for a bundle alias such as `decision_record`: anything written under it before enabling became its own inferred type (or was rejected under `guided`) and is not re-typed.

### Existing schemas keep priority

Seeding registers GLOBAL schemas and never touches an existing one. Schema lookup prefers a schema scoped to the writing user over a global one. So on an instance where a type was already in use, the existing schema keeps governing that user's writes, whether it is a global row or a per-user schema inferred on first write. The bundle's curated field set applies to users and instances that had none.

### Disable

Disabling a bundle removes its types from the `guided` provided set. That gate only applies to types with no registered schema, so schemas the bundle already registered stay registered, and writes of those types still succeed. Disable does not block writes; it stops new auto-creation of the bundle's unregistered types. The `disable` message says this.

In `guided` mode, the rejection for a type whose bundle is not enabled names that bundle and how to enable it. The same hint is given for a bundle alias (for example `contact_list`), naming the canonical type and its bundle.

The `guided` gate runs on the MCP `store` handler and on extraction-time interpretation. The REST `POST /store` route does not consult the schema mode today, so a REST write of an unprovided type still auto-creates. That gap predates these bundles and is tracked as a follow-up.

## Use cases and bundles

Use cases and bundles are many-to-many. A use case lists the set of bundles that together serve it; a bundle lists the use cases it contributes to (`serves_use_cases`). This decoupling lets a single bundle (e.g. `financial_ops`) serve many use cases (`diligence`, `portfolio`, `procurement`, `trading`) without duplication.

The human-readable mapping for the 16 existing use case docs ships in this file (below). The machine-readable mapping (`use_cases/*.yaml`) lands in m2 under `src/services/bundles/use_cases/`.

## Reconciled bundle catalog

The 16 use cases under `docs/use_cases/` map to the following bundle compositions. Every use case includes `core_workflows` (the session-loop skill bundle in the default install). `core` and `infrastructure` are implicit (always active) and omitted from the schema-bundle column unless a use case depends on infrastructure types directly.

| Use case             | Schema bundles                                   | Skill bundles    | Description                                 |
| -------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------- |
| `agent_auth`         | `infrastructure`, `agent_auth`                   | `core_workflows` | Agent authorization and capability scoping. |
| `cases`              | `cases`, `crm`                                   | `core_workflows` | Legal cases and investigation casework.     |
| `compliance`         | `contracts`, `compliance`                        | `core_workflows` | Vendor risk and regulatory compliance.      |
| `contracts`          | `contracts`                                      | `core_workflows` | Contract lifecycle management.              |
| `crm`                | `crm`, `communications`                          | `core_workflows` | Customer relationship management.           |
| `crypto_engineering` | `engineering`                                    | `core_workflows` | Crypto and security engineering.            |
| `customer_ops`       | `crm`, `customer_ops`                            | `core_workflows` | Support and CX operations.                  |
| `diligence`          | `crm`, `financial_ops`, `contracts`, `diligence` | `core_workflows` | M&A and investment diligence.               |
| `financial_ops`      | `financial_ops`                                  | `core_workflows` | Financial operations and accounting.        |
| `government`         | `government`, `compliance`                       | `core_workflows` | Public sector and GovTech workflows.        |
| `healthcare`         | `healthcare`, `personal_data`                    | `core_workflows` | Healthcare operations.                      |
| `logistics`          | `logistics`, `financial_ops`                     | `core_workflows` | Logistics and supply chain.                 |
| `personal_data`      | `personal_data`                                  | `core_workflows` | Personal agent state.                       |
| `portfolio`          | `financial_ops`, `portfolio`                     | `core_workflows` | Portfolio monitoring.                       |
| `procurement`        | `financial_ops`, `contracts`, `procurement`      | `core_workflows` | Procurement and sourcing.                   |
| `trading`            | `financial_ops`, `trading`                       | `core_workflows` | Autonomous trading agents.                  |

### Catalog notes

- `cases` is treated as a single use case covering both legal cases and support investigation casework, per the existing `docs/use_cases/cases.md`. If usage diverges, a future split is possible without breaking the bundle model.
- `communications` ships as its own schema bundle (email only) and is composed with `crm` by the `crm` use case. It is not present as a standalone use case.
- `engineering` replaces the planned `devops` and `crypto_engineering` bundles; the `crypto_engineering` use case is served by it.
- Schema bundles in this catalog not yet implemented: `agent_auth`, `cases`, `compliance`, `customer_ops`, `diligence`, `government`, `healthcare`, `logistics`, `portfolio`, `procurement`, `trading`.

## Related documents

- `docs/use_cases/README.md` — Use case index and Bundle composition section.
- `docs/skills/core_workflows/` — Specifications for the three default-install skills.
- `docs/site/faq/schema_modes.md` — Public FAQ entry on lock postures.
- Plan `ent_089da2ecebc3bd804d63dcf2` — Bundles Strategy.
- Plan `ent_b5a51d1395d206e10945b6b1` — Skill auto-loading (Resolve #205).
