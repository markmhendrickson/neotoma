# Skills

Skills are reusable agent workflows stored as Neotoma entities and mirrored to your harness skill directory. This is optional. You can keep writing skill files by hand and Neotoma works the same as before.

## Why store skills in Neotoma

When skills are entities, you can:

- Query and retrieve them across harnesses (`retrieve_entities { entity_type: "skill" }`).
- Surface them in the harness slash-command palette automatically via the `user_invocable` field.
- Mirror them to disk via the `neotoma-skills` mirror profile so your harness picks them up as `<name>/SKILL.md` files.
- Link them to issues, plans, and other entities in the graph.

If you do not need any of that, skip this guide. Hand-authored skill files work as they always have.

## Storing skills

### From an agent conversation

Any agent with MCP access can store a skill during a conversation turn:

```json
{
  "entity_type": "skill",
  "name": "import-audio",
  "description": "Import and transcribe audio files from desktop.",
  "triggers": ["import audio", "transcribe audio from desktop"],
  "content": "# Import Audio\n\n...",
  "user_invocable": true
}
```

`name` is the canonical identifier (kebab-case). Storing the same `name` again updates the existing skill entity rather than creating a duplicate.

### From existing skill files

You can capture an existing `SKILL.md` file by parsing its frontmatter and body and storing the result as a `skill` entity:

```bash
neotoma store --entity-type skill \
  --file .cursor/skills/import-audio/SKILL.md
```

The CLI reads `name`, `description`, `triggers`, and `user_invocable` from the YAML frontmatter and `content` from the markdown body.

## Reading skills

Use standard entity retrieval:

```bash
# List all skill entities
neotoma list --entity-type skill

# Show a specific skill by name
neotoma retrieve --entity-type skill --name import-audio
```

Via MCP:
- `retrieve_entities { entity_type: "skill" }` for list queries.
- `retrieve_entity_by_identifier { entity_type: "skill", identifier: "import-audio" }` for lookup by name.
- `retrieve_entity_snapshot { entity_id: "<id>" }` for the full skill body and all fields.

## Mirror to disk

The `neotoma-skills` mirror profile writes skill entities back to your harness skill directory as `<name>/SKILL.md` files with YAML frontmatter. When the mirror is active, any change to a skill entity regenerates the corresponding file automatically.

Mirror layout example:

```
.cursor/skills/
  import-audio/
    SKILL.md        ← generated from the skill entity
  process-issues/
    SKILL.md
```

Each `SKILL.md` file contains:

```yaml
---
name: import-audio
description: "Import and transcribe audio files from desktop."
triggers:
  - import audio
  - transcribe audio from desktop
user_invocable: true
entity_id: ent_f971d8f20a9d26cc15acdf10
---

# Import Audio

...workflow instructions...
```

The `entity_id` field in the frontmatter lets Neotoma match the file back to its entity on the next sync. Do not edit mirrored files directly — changes are overwritten on the next mirror write. To modify a skill, use the Inspector, `neotoma edit <entity-id>`, or the MCP `correct` action.

## Slash-command palette

Setting `user_invocable: true` on a skill entity causes the harness to surface it as an invocable slash command. In Claude Code, skills with this field set appear in the `/` palette and can be triggered by name (e.g. `/import-audio`).

When the mirror is enabled, setting `user_invocable: true` on a skill entity and rebuilding the mirror is all that is needed — no manual frontmatter editing required.

## Skill fields

Key fields on a skill entity:

| Field | Description |
|-------|-------------|
| `name` | Kebab-case canonical identifier (e.g. `import-audio`). Used as the subdirectory name. |
| `description` | One-sentence description shown in the slash-command palette and used for intent matching. |
| `triggers` | Natural-language phrases that activate the skill (e.g. `["import audio", "transcribe audio"]`). |
| `content` | Full markdown workflow body, written as the content section of `SKILL.md`. |
| `user_invocable` | When `true`, the skill appears in the harness slash-command palette. |
| `enabled` | When `false`, the skill is excluded from mirror output. Defaults to active. |
| `version` | Semver or free-form version string. Informational only. |
| `supported_harnesses` | List of harnesses this skill is compatible with (e.g. `["cursor", "claude-code"]`). Empty means all. |
| `harness_config` | Per-harness configuration overrides. |
| `synced_at` | Timestamp of the last mirror write or external sync. |

For the full schema, see [`src/services/skills/seed_schema.ts`](../../src/services/skills/seed_schema.ts).

## Related

- [`docs/developer/mirror_guide.md`](mirror_guide.md) for the mirror profile system.
- [`docs/developer/cli_reference.md`](cli_reference.md) for the `neotoma` CLI reference.
