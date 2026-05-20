# Plans

The Plans subsystem makes plans first-class Neotoma entities. A `plan` row stores the full markdown body of a plan **and** structured metadata (identity, status, todos, source linkage, reproduction environment). One generic schema covers three categories of plans:

1. **Harness-authored plans** — markdown files written by AI coding harnesses:
   - Cursor: `.cursor/plans/<slug>_<hex>.plan.md`
   - Claude Code: `.claude/plans/<slug>.plan.md`
   - Codex: `.codex/plans/<slug>.plan.md`
   - OpenClaw: `.openclaw/plans/<slug>.plan.md`
2. **Issue-resolution plans** — produced by the [`process-issues` skill](../../.cursor/skills/process-issues/SKILL.md) when it analyses an open `issue` and proposes a fix. These carry reproduction-environment fields and link back to the source `issue` via `source_entity_id`.
3. **Skill / agent ad-hoc plans** — anything an agent sketches in a turn worth keeping (refactor outlines, research notes, `neotoma_repair` payloads).

## Why one schema for all three

Plans share more than they differ: a title, a markdown body, optional structured todos, an authoring agent, and (often) something the plan is "about". Splitting harness-authored plans from skill output would force the Inspector and retrieval surfaces to UNION two schemas; instead, identity rules let the generic shape cover every case without losing harness round-trip fidelity.

Identity is keyed by ordered rules in `canonical_name_fields`:

```text
[ { composite: ["harness", "harness_plan_id"] },
  { composite: ["source_entity_id", "title"] },
  "slug",
  "title" ]
```

- Harness plans dedupe per `(harness, harness_plan_id)` (e.g. Cursor's hex suffix).
- Issue-resolution plans dedupe per `(source_entity_id, title)` so the `process-issues` skill can be re-run idempotently against the same issue.
- `slug` and `title` are fallbacks for harness plans without a stable id.

## Schema

Defined in `src/services/plans/seed_schema.ts`. Seeded as a global schema at boot.

Key fields:

- `title`, `slug`, `body` (full verbatim markdown), `overview`, `todos[]`, `is_project`.
- `harness` (`cursor` | `claude_code` | `codex` | `openclaw` | `cli` | `agent` | `human` | `other`), `harness_plan_id`, `plan_file_path`.
- `plan_kind` (`harness_plan` | `issue_resolution` | `feature_implementation` | `refactor` | `research` | `neotoma_repair` | `other`).
- `status` (`draft` | `awaiting_input` | `approved` | `executing` | `executed` | `abandoned` | `superseded`).
- `outcome` (`pr_opened` | `worktree_created` | `commits_landed` | `input_requested` | `abandoned` | null).
- `decision_required` (boolean), `decision_blockers[]`.
- `public_overview`, `public_body` — REQUIRED when the source is private and the plan will produce public artifacts (PR, branch). Run `assertPublicEmissionIsClean` before populating.
- `source_entity_id`, `source_entity_type`, `source_message_entity_id`, `conversation_id`.
- Reproduction environment (for issue-resolution plans): `reproduction_environment_kind` (`public_release` | `local_commit` | `local_branch` | `not_applicable` | `unknown`), `git_sha`, `git_ref`, `release_tag`, `app_version`.
- Execution outcome: `worktree_path`, `branch_name`, `pr_url`, `github_issue_url`.
- Provenance: `data_source`, `agent_id`, `created_at`.

## Capture flows

### Harness plan files (`neotoma plans capture`)

Run `neotoma plans capture <file>` (or `--all` to walk `.cursor/plans/`, `.claude/plans/`, `.codex/plans/`, `.openclaw/plans/`) to ingest existing plan files. The CLI:

1. Reads the file.
2. Parses YAML frontmatter and splits the markdown body.
3. Detects the harness from the path.
4. Calls `POST /store` with a combined payload: structured `plan` row + raw markdown source (file_content + mime_type) + EMBEDS link from the plan to the resulting `file_asset`.

The helper lives at `src/services/plans/capture_harness_plan.ts`. It returns the constructed payload so the CLI, MCP harness shims, or programmatic callers can decide when and how to invoke `store`.

### Skill-generated plans (`process-issues`)

The [`process-issues` skill](../../.cursor/skills/process-issues/SKILL.md) writes plans directly via `store` (one combined call per plan), setting `harness: "agent"` and `plan_kind: "issue_resolution"`. The plan is linked to the source issue with `REFERS_TO`.

### Ad-hoc plans

Any agent can `store` a plan entity in a normal turn (e.g. when the user asks the agent to "draft a plan for X"). Use `harness: "agent"` and a descriptive `plan_kind`. Link the plan to the prompting `conversation_message` with `REFERS_TO` so retrieval can locate it from the chat.

## Reading plans

Use existing entity-retrieval surfaces — there is no plan-specific MCP tool:

- `retrieve_entities { entity_type: "plan", limit: N }` for bounded list queries.
- `retrieve_entity_snapshot { entity_id }` for the full markdown body.
- `retrieve_related_entities { entity_id: <issue_id>, relationship_types: ["REFERS_TO"], direction: "inbound" }` to list every plan linked to an issue.
- `neotoma plans list --source-entity-id <id>` (CLI shim over `retrieve_entities`).

## Confidentiality contract

Plans derived from **private** issues that will produce public artifacts (PRs, branch names, GitHub comments) MUST populate `public_overview` / `public_body` and pass them through `assertPublicEmissionIsClean` (in `src/services/issues/redaction_guard.ts`). The guard reuses Neotoma's existing `scanAndRedact` rule set so all surfaces agree on what counts as PII.

## Inspector follow-up

A separate PR against the inspector submodule will:

- Add a `Plans` panel on the issue detail page listing every linked plan.
- Render `public_body` (when present) instead of `body` for plans whose source issue is private.
- Surface per-message plan-reference affordances on the conversation timeline (a message that prompted a plan gets a "View plan" link).

This UI work is tracked separately so the schema, capture helper, skill, and reporter-env tightening can ship in v0.12.0 without coupling to inspector release timing.

## Components

- `src/services/plans/seed_schema.ts` — Schema seeder + `PLAN_FIELD_SPECS`.
- `src/services/plans/capture_harness_plan.ts` — Combined-store payload builder for any `.plan.md` file.
- `src/cli/plans.ts` — `neotoma plans capture` and `neotoma plans list` implementations.

## Related documents

- [`issues.md`](issues.md) — Issues subsystem and reporter provenance contract.
- [`../specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — Action catalog (entry for `plan` entity_type).
- [`../developer/cli_reference.md`](../developer/cli_reference.md) — `neotoma plans` command reference.
- [`../../.cursor/skills/process-issues/SKILL.md`](../../.cursor/skills/process-issues/SKILL.md) — Issue-resolution plan workflow.
