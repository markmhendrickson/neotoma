# GitHub Entities

When email records, calendar invites, or other external sources reference GitHub resources (issues, pull requests, organizations, or projects), agents extract and store those resources as first-class Neotoma entities and link them to the originating record via REFERS_TO.

## Scope

This document covers:

- Canonical entity types and field names for GitHub resources extracted from external records.
- Extraction rules for each resource class.
- Linking conventions (email entity as source, REFERS_TO edges, observation `data_source`).

It does NOT cover:

- The `issue` subsystem's Neotoma-native issue tracking and GitHub mirror pipeline. See [`issues.md`](issues.md).
- Generic external-entity submission. See [`entity_submission.md`](entity_submission.md).

## Entity Types

### GitHub Issue (`issue`)

Use `entity_type: "issue"` for GitHub issues referenced in email or other external records. This is the same type used by the Neotoma issue subsystem; identity is `(github_number, repo)`.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `github_number` | number | Issue number (e.g. `42`) |
| `repo` | string | `owner/name` (e.g. `markmhendrickson/neotoma`) |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `github_url` | string | Full issue URL |
| `title` | string | Issue title when parseable |
| `status` | string | `open` or `closed` when known |
| `data_source` | string | Provenance string (tool + id + date) |
| `source_quote` | string | Verbatim snippet from the email body supporting extraction |

**Identity rule:** `[{ composite: ["github_number", "repo"] }]` — re-stores update the existing row rather than creating a duplicate.

**Do NOT use** a generic `note` or invent ad hoc fields (`github_issue_number`, `repository`, `url`) when the canonical fields are recoverable. If only partial context is available and `github_number` + `repo` cannot be populated, store a `note` or `technical_research` entity instead until canonical fields are known. See `[ISSUE REPORTING]` GitHub issue URL extraction rule in MCP instructions.

### Pull Request (`pull_request`)

Use `entity_type: "pull_request"` for GitHub pull requests referenced in email or other external records.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `github_number` | number | PR number (e.g. `57`) |
| `repo` | string | `owner/name` (e.g. `markmhendrickson/neotoma`) |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `github_url` | string | Full PR URL |
| `title` | string | PR title when parseable |
| `status` | string | `open`, `merged`, or `closed` when known |
| `author` | string | GitHub login of PR author |
| `base_branch` | string | Target branch |
| `head_branch` | string | Source branch |
| `created_at` | date | PR creation timestamp |
| `merged_at` | date | Merge timestamp |
| `closed_at` | date | Close timestamp |
| `data_source` | string | Provenance string |
| `source_quote` | string | Verbatim snippet from the email body |

**Identity rule:** `[{ composite: ["github_number", "repo"] }]` with `github_url` as fallback.

**URL pattern for recognition:** `github.com/<owner>/<repo>/pull/<github_number>`.

**FORBIDDEN:** using ad hoc fields (`number`, `url`) instead of `github_number` + `github_url` when the canonical fields are recoverable.

**Aliases accepted by resolver:** `pr`, `github_pr`, `merge_request`.

### GitHub Organization (`organization` / `company`)

Use `entity_type: "organization"` (or reuse `company` per entity-type reuse check) for GitHub organizations mentioned as email senders, vendors, sponsors, or named collaborators.

**Fields (from `company` schema):**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Organization display name (required) |
| `website` | string | `https://github.com/<login>` |
| `external_id` | string | GitHub login (e.g. `octocat`) — use as the stable identifier |
| `description` | string | Organization description when available |
| `data_source` | string | Provenance string |

**Identity rule:** `["external_id", "website", "email", "legal_name", "name"]` in priority order. Use `external_id` = GitHub login for the most stable deduplication key.

**Do NOT** create a new `github_org` type. Use the established `organization` / `company` type with `external_id` set to the GitHub login and `website` set to the GitHub URL.

### GitHub Project (`project`)

Use `entity_type: "project"` for GitHub Projects referenced in email (e.g. project board links or project-context subject lines). This is a general-purpose project type shared with non-GitHub projects; disambiguate using `data_source`.

**Fields (from `project` schema):**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Project name (required) |
| `status` | string | `active`, `closed`, etc. (required by schema) |
| `description` | string | Project description |
| `notes` | string | GitHub project URL or other notes |
| `data_source` | string | Provenance string (e.g. `GitHub Projects email reference 2026-05-19`) |

**Identity rule:** `["name"]`.

**Do NOT** create a new `github_project` type. Use `project` with `data_source` to distinguish GitHub Projects from other project types.

## Extraction Rules

### When to Extract

Run the GitHub entity extraction pass as part of the per-record scan (see `[COMMUNICATION & DISPLAY]` per-record extraction checklist) whenever an email, calendar invite, chat message, or web page body contains:

- A GitHub issue URL: `github.com/<owner>/<repo>/issues/<number>`
- A GitHub PR URL: `github.com/<owner>/<repo>/pull/<number>`
- An issue or PR reference: `#<number>` (when repo context is available from subject or sender)
- A GitHub organization name or `github.com/<login>` URL
- A GitHub Projects board link: `github.com/orgs/<org>/projects/<id>` or `github.com/users/<login>/projects/<id>`

### Extraction per Entity Class

**GitHub issue from URL:**

```
entity_type: "issue"
github_number: <number from URL>
repo: "<owner>/<name>"
github_url: "<full URL>"
title: "<title if in subject or body>"
data_source: "email message_id=<id> <ISO-date>"
source_quote: "<verbatim URL or surrounding sentence>"
```

**GitHub PR from URL:**

```
entity_type: "pull_request"
github_number: <number from URL>
repo: "<owner>/<name>"
github_url: "<full URL>"
title: "<title if parseable>"
data_source: "email message_id=<id> <ISO-date>"
source_quote: "<verbatim URL or surrounding sentence>"
```

**GitHub organization from sender or body:**

```
entity_type: "organization"
name: "<org display name>"
external_id: "<github login>"
website: "https://github.com/<login>"
data_source: "email message_id=<id> <ISO-date>"
```

**GitHub project from URL or subject:**

```
entity_type: "project"
name: "<project name>"
status: "active"
notes: "<full GitHub Projects URL>"
data_source: "GitHub Projects email reference <ISO-date>"
```

### Linking

After storing the extracted entity, link it to the originating email record in the **same `store` call** using the `relationships` array:

```
{ relationship_type: "REFERS_TO", source_entity_id: "<email_entity_id>", target_entity_id: "<github_entity_id>" }
```

Or, when batching in one store call, use index-based references:

```
{ relationship_type: "REFERS_TO", source_index: <email_index>, target_index: <github_entity_index> }
```

Use the email entity (e.g. `email_message`) as the **source** on the REFERS_TO edge and the GitHub entity as the target. This matches the `[STORE RECIPES]` user-phase relationship convention (message → extracted entity).

### Observation `data_source`

Every GitHub entity stored from email MUST carry a per-entity `data_source` field identifying the originating email:

```
"email message_id=<gmail_message_id> <ISO-date>"
```

When the `message_id` is unavailable, use the sender address and date:

```
"email from=<sender> <ISO-date>"
```

This satisfies the multi-row `data_source` identity requirement in `[PROVENANCE]` and prevents distinct email records from collapsing into the same GitHub entity row when the same issue is mentioned in multiple emails.

## Schema Registration

- `issue` — defined in `src/services/issues/seed_schema.ts` (global, seeded at startup).
- `pull_request` — defined in `src/services/schema_definitions.ts` (static bootstrap, `ENTITY_SCHEMAS`).
- `organization` / `company` — defined in `src/services/schema_definitions.ts`.
- `project` — defined in `src/services/schema_definitions.ts`.

## Related Documents

- [`issues.md`](issues.md) — Neotoma-native issue tracking and GitHub mirror pipeline
- [`docs/developer/mcp/instructions.md`](../developer/mcp/instructions.md) — `[GITHUB ENTITY EXTRACTION]` section with inline extraction rules for agents
- [`record_types.md`](record_types.md) — Full catalog of application-level entity types
- [`relationships.md`](relationships.md) — Relationship types (REFERS_TO, EMBEDS, PART_OF)
