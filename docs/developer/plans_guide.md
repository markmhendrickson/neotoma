# Plans

Plans let you store engineering and design plans as Neotoma entities. This is optional. You can keep using regular markdown plan files in your harness directory (`.cursor/plans/`, `.claude/plans/`, etc.) and Neotoma works the same as before.

## Why store plans in Neotoma

When plans are entities, you can:

- Link them to issues, tasks, conversations, and other entities in the graph.
- Query them across harnesses and repos (`retrieve_entities { entity_type: "plan" }`).
- Read them from any MCP client, the CLI, or the Inspector.
- Get a markdown mirror back to disk via the `neotoma-plans` mirror profile, so file-based workflows still work.

If you do not need any of that, skip this guide. Regular plan files work as they always have.

## Storing plans

### From existing harness plan files

Capture one file or all plan files from your harness directories:

```bash
# Capture a single plan file
neotoma plans capture .cursor/plans/my-plan_a1b2c3d4.plan.md

# Capture all plan files from all known harness directories
neotoma plans capture --all
```

The CLI reads the file, parses YAML frontmatter, detects the harness from the path, and stores a structured `plan` entity alongside the raw markdown as an attached source.

Supported harness paths: `.cursor/plans/`, `.claude/plans/`, `.codex/plans/`, `.openclaw/plans/`.

### From an agent conversation

Any agent with MCP access can store a plan during a conversation turn:

```json
{
  "entity_type": "plan",
  "title": "Migrate auth to OAuth",
  "body": "## Overview\n...",
  "plan_kind": "feature_implementation",
  "harness": "agent",
  "status": "draft"
}
```

The MCP instructions tell agents to store plans when a concrete plan is approved or finalized in conversation, so this happens automatically with compliant agents.

### From issue processing

The `process-issues` skill produces `issue_resolution` plans linked back to the source issue. These are created automatically when that skill runs.

## Reading plans

There are no plan-specific MCP tools. Use the standard entity retrieval surfaces:

```bash
# List recent plans
neotoma plans list

# List plans linked to a specific issue
neotoma plans list --source-entity-id <issue-entity-id>

# Filter by status or harness
neotoma plans list --status draft --harness cursor
```

Via MCP:
- `retrieve_entities { entity_type: "plan", limit: 10 }` for list queries.
- `retrieve_entity_snapshot { entity_id: "<id>" }` for the full plan body.

## Mirror to disk

The `neotoma-plans` mirror profile writes plan entities back to `plans/` in your repo as markdown files with YAML frontmatter. This profile is separate from the general markdown mirror (which writes to `data/mirror/`).

When the plans mirror is active, plan entities produce files like `plans/migrate-auth-to-oauth.md` that you can read with standard tools, commit to git, or browse in your editor.

The mirror is write-through: changes to plan entities regenerate the corresponding file. Manual edits to mirrored files are overwritten on the next write. To modify a plan, use `neotoma edit <entity-id>`, the Inspector, or the MCP `correct` action.

## Plan fields

Key fields on a plan entity:

| Field | Description |
|-------|-------------|
| `title` | Plan title |
| `body` | Full markdown content |
| `status` | `draft`, `awaiting_input`, `approved`, `executing`, `executed`, `abandoned`, `superseded` |
| `plan_kind` | `harness_plan`, `issue_resolution`, `feature_implementation`, `refactor`, `research`, `other` |
| `harness` | `cursor`, `claude_code`, `codex`, `openclaw`, `cli`, `agent`, `human`, `other` |
| `source_entity_id` | Links the plan to the entity it addresses (e.g. an issue) |
| `todos` | Structured todo items extracted from the plan body |

For the full schema, see [`docs/subsystems/plans.md`](../subsystems/plans.md).

## Related

- [`docs/subsystems/plans.md`](../subsystems/plans.md) for the subsystem internals.
- [`docs/developer/cli_reference.md`](cli_reference.md) for the `neotoma plans` CLI reference.
