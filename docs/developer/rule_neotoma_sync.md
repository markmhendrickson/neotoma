# Rule ↔ Neotoma sync (design spec)

Status: **proposed** (2026-06-01). Companion decision record: Neotoma `decision_record` "Handle rules like skills: sync repo rule files to standing_rule entities".

## Problem

Skills already follow a two-layer model: the **Neotoma `skill` entity is the source of truth**, and the repo file (`.cursor/skills/<slug>/SKILL.md`) is a **read mirror** with the entity's `entity_id` stamped into frontmatter. 41/41 skills are synced this way; an Ateles-side syncer owns the round-trip.

Rules do **not** follow this model. They live only as repo files — `.claude/rules/*.md` (and `docs/<location>/<name>_rules.md`), symlinked into `.cursor/rules/` by `foundation/scripts/setup-cursor-rules.sh`. There is no Neotoma entity per rule, so rules are invisible to cross-session retrieval, aggregate analysis, and graph queries ("what rules govern plan formatting?", "which rules changed this month?", "which rules overlap?").

This asymmetry is the gap. The fix is to mirror the skill pattern for rules.

## What already exists (do NOT mint new types)

Neotoma already registers the needed entity types:

- **`standing_rule`** (schema 1.1.0) — fields: `title`, `instruction`, `scope`, `domain`, `status`, `priority`, `content`, `rule`, `summary`. This IS the rule entity. Use it.
- **`rule_update`** (schema 1.1.0) — fields: `title`, `artifact`, `change_summary`, `updated_at`. This is the structured rule change-log entry.

Adjacent governance types (`agent_policy`, `core_principle`, `user_preference`) exist but are distinct — do not conflate. The reuse check that this whole effort came out of (the `skill_learnings` mistake) applies: reuse `standing_rule` + `rule_update` + `note`; do not create a new `rule` type.

## The model

Two layers, mirroring skills exactly:

1. **Source of truth — `standing_rule` entity in Neotoma.** Holds the rule's normative content (`content`/`instruction`), `scope`, `domain`, `status`, `priority`, `summary`. Versioned via observations (every edit is a new observation; `correct` for high-priority overrides).
2. **Read mirror — repo file.** `.claude/rules/<name>.md` (or `docs/<location>/<name>_rules.md`), what Cursor/Claude actually load at runtime. The `standing_rule` `entity_id` is stamped into the file's frontmatter as the back-reference, exactly as `.cursor/skills/<slug>/SKILL.md` carries `entity_id:`.

Plus the learnings layer, consistent with the skills decision:

3. **Rule learnings — `note` linked `REFERS_TO` the `standing_rule`.** When a session reveals a rule is too strict, ambiguous, or missing a case, capture it as a `note` (full content) linked by graph edge to the rule entity. Reserve `rule_update` for structured change-log rows (what changed, when, which artifact), not free-form learnings.

### Field mapping (repo rule file → standing_rule)

| Repo rule file | `standing_rule` field |
|---|---|
| filename / `# Title` heading | `title` |
| frontmatter `description` / first paragraph | `summary` |
| full body | `content` (and/or `instruction`) |
| directory (`conventions`, `subsystems`, `architecture`, …) | `domain` |
| repo-wide vs submodule vs foundation | `scope` |
| active / deprecated | `status` |
| (optional) enforcement weight | `priority` |
| `.cursor/rules/` symlink target path | store on the entity as a non-identity field (e.g. `mirror_path`) |

Identity: key the `standing_rule` by `title` (+ `domain` to disambiguate same-named rules across locations), matching how skills key by `name`/`slug`.

## Sync direction & ownership

To genuinely "handle rules like skills," the rule syncer should live **alongside the skill syncer (Ateles)** and reuse its machinery — file-walk, frontmatter parse/stamp, Neotoma `store`/`correct`, `entity_id` write-back. Building a separate, divergent syncer in this repo would repeat the `skill_learnings`-class mistake at the tooling layer.

Round-trip (identical shape to skills):

1. Walk `.claude/rules/*.md` + `docs/**/<name>_rules.md`.
2. Parse frontmatter + body; map to `standing_rule` fields above.
3. `store` (or `correct` when `entity_id` already present) the `standing_rule`; capture returned `entity_id`.
4. Stamp `entity_id` back into the rule file's frontmatter.
5. Re-run `setup-cursor-rules.sh` so `.cursor/rules/` symlinks stay current.

Source-of-truth direction matches skills: **Neotoma is authoritative**; the file is regenerated/stamped from it. For bulk first-import, the repo files seed the entities (file → Neotoma once), then Neotoma leads.

## Phasing

- **Phase 0 (this session):** spec + decision record; backfill a representative `standing_rule` or two by hand via MCP to prove the mapping. No file write-back yet.
- **Phase 1 (in Ateles):** generalize the skill syncer to also handle rules, or factor a shared sync core both call. Stamp `entity_id` into rule frontmatter.
- **Phase 2:** wire the `note → standing_rule` learnings flow into `/learn` so rule retrospectives land as linked notes automatically.

## Open questions

- **`mirror_path` field:** `standing_rule` has no declared field for the repo file / symlink path. Either fold it into `content` frontmatter, or evolve the schema once (it needs a `canonical_name_fields`/`identity_opt_out` baseline first — see `ERR_SCHEMA_MISSING_IDENTITY_CONFIG`). Decide before Phase 1.
- **Submodule rules** (foundation `.mdc`) vs repo rules (`.md`) — same entity, different `scope` value, or separate handling? Lean: same entity, `scope: foundation`.
- **No `write_to_file` MCP primitive** — the file-mirror write-back is a host/script step, same limitation as the skill mirror. Tracked separately.

## Related

- `docs/developer/mcp/instructions.md` — the "Durable agent/skill learnings" rule under `[COMMUNICATION & DISPLAY]` now generalizes to rules (note → target entity).
- `docs/developer/agent_instructions_sync_rules.mdc` — canonical-first contract for agent-instruction docs (the philosophy this extends to rule entities).
- `foundation/scripts/setup-cursor-rules.sh` — current file-only rule setup (the symlink half of the mirror).
