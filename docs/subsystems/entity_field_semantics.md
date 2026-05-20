# Entity Field Semantics

## Scope

This document defines canonical semantics for cross-cutting fields that appear on multiple entity types. It is the single source of truth for field meaning when field names are reused across entity schemas.

This document does NOT cover:

- The `sources` table (rows holding raw bytes) — see `docs/subsystems/sources.md`
- Per-entity-type field definitions — see `src/services/schema_definitions.ts`
- Observation provenance fields (`source_id`, `interpretation_id`, `source_priority`) — see `docs/subsystems/observation_architecture.md`

## `source` — Originating System Slug

**Type:** `string` (optional unless declared required by the entity schema)

**Semantics:** The name of the system, integration, or channel that produced or delivered this entity's data. Always a lowercase slug. Never a URL, never a person name, never free text.

**Canonical values:**

| Value | Meaning |
|-------|---------|
| `gmail` | Gmail / Google Mail |
| `google_calendar` | Google Calendar |
| `chatgpt` | ChatGPT (chatgpt.com shared links, exports) |
| `claude` | Claude (claude.ai, Claude Code) |
| `github` | GitHub (issues, PRs, commits, comments) |
| `slack` | Slack |
| `notion` | Notion |
| `linear` | Linear |
| `airtable` | Airtable |
| `csv_import` | CSV or spreadsheet file upload |
| `manual` | Manually entered by the user (no integration) |

**Extension:** When a source system is not in the list above, use the lowercase domain slug (e.g. `"trello"`, `"asana"`, `"hubspot"`). Do not use a URL, a display name with spaces, or a person's name.

**Wrong usage (forbidden):**

```json
{ "source": "https://mail.google.com/..." }  // ← use source_url instead
{ "source": "Alice Johnson" }                 // ← use a contact entity + REFERS_TO
{ "source": "Exported from Notion on 2026-05-01" }  // ← free text is forbidden
{ "source": "Gmail" }                         // ← must be lowercase slug
```

**Correct usage:**

```json
{ "source": "gmail" }
{ "source": "github" }
{ "source": "manual" }
{ "source": "csv_import" }
```

## `source_url` — Direct URL to Originating Record

**Type:** `string` (always optional)

**Semantics:** A canonical URL pointing to the specific record in the originating system (e.g. a GitHub issue URL, a specific Gmail message deep-link, a Notion page URL, a ChatGPT shared conversation URL). Use this alongside `source` to provide a direct link to the upstream artifact.

**Correct usage:**

```json
{
  "source": "github",
  "source_url": "https://github.com/org/repo/issues/42"
}
{
  "source": "chatgpt",
  "source_url": "https://chatgpt.com/share/abc123"
}
```

Do NOT put a URL in the `source` field; put it in `source_url`.

## `source_ref` — External Identifier in the Originating System

**Note:** `source_ref` as a top-level entity field is distinct from the `interpretation.source_ref` parameter on the `store` MCP action (which selects the raw source artifact for interpretation — see `docs/developer/mcp/instructions.md`).

**Type:** `string` (always optional)

**Semantics as an entity field:** A stable identifier for this record in the originating system. Use this to enable idempotent re-ingestion and to power deduplication across imports.

**Examples by system:**

| System | `source_ref` value |
|--------|-------------------|
| Gmail | RFC 2822 Message-ID (e.g. `<CABcd123@mail.gmail.com>`) |
| GitHub | Issue/PR number as string (e.g. `"42"`) |
| Slack | Message timestamp (e.g. `"1716000000.000100"`) |
| Linear | Issue ID (e.g. `"ENG-123"`) |
| Notion | Page UUID (e.g. `"abc12345-..."`) |
| CSV | Row primary key or index (e.g. `"row_42"`) |

**Correct usage:**

```json
{
  "source": "gmail",
  "source_url": "https://mail.google.com/mail/u/0/#inbox/abc123",
  "source_ref": "<CABcd123@mail.gmail.com>"
}
```

## `data_source` — Provenance Audit String

**Type:** `string` (optional)

**Semantics:** A human-readable provenance string describing the exact tool call, endpoint, and date that produced this entity's data. Used for audit and disambiguation in batch stores. This is NOT the same as `source` (system slug) — it is a full traceability record.

**Format:** `"<Tool> <operation> <identifier> <ISO-date>"`

**Correct usage:**

```json
{
  "data_source": "Gmail API GET users.messages.get id=abc123 2026-05-19"
}
{
  "data_source": "GitHub API GET /repos/org/repo/issues/42 2026-05-19"
}
```

See `docs/developer/mcp/instructions.md` `[ENTITY TYPES & SCHEMA]` section for the full `data_source` rule, including the per-row uniqueness requirement for batch stores.

## Summary: Which Field to Use

| You want to record... | Use field |
|-----------------------|-----------|
| The integration/system name (gmail, github, manual) | `source` |
| A URL to the upstream record | `source_url` |
| A stable ID in the upstream system (message-id, issue number) | `source_ref` |
| A full audit string (tool + endpoint + date) | `data_source` |
| The raw bytes artifact | `sources` table row via `store` with file fields |

## Related Documents

- [`docs/subsystems/sources.md`](./sources.md) — `sources` table (raw byte storage)
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Observation provenance fields
- [`docs/developer/mcp/instructions.md`](../developer/mcp/instructions.md) — MCP instructions including `data_source` and `source_ref` (interpretation parameter) rules
- `src/services/schema_definitions.ts` — Per-entity field declarations
