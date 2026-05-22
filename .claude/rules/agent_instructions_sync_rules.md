---
description: "Canonical-first Neotoma agent instructions: behavioral edits live in docs/developer/mcp/instructions.md; CLI harness file is transport-only."
globs: ["docs/developer/mcp/instructions.md", "docs/developer/cli_agent_instructions.md", "docs/developer/agent_instructions.md"]
---

<!-- Source: docs/developer/agent_instructions_sync_rules.mdc -->


# Agent instructions maintenance (canonical-first)

## Purpose

Prevent **duplicate full copies** of Neotoma agent behavior in MCP payloads, CLI-applied harness files, and consumer workspace rules. Behavioral semantics have a **single** normative source.

## Canonical sources (by role)

| Role | File | Notes |
|------|------|--------|
| **Behavioral contract** | `docs/developer/mcp/instructions.md` | First fenced code block is what MCP sends to clients (unless `NEOTOMA_MCP_COMPACT_INSTRUCTIONS` is set). |
| **Index / operator map** | `docs/developer/agent_instructions.md` | Where to read when MCP is on vs off; points to `neotoma instructions print`. |
| **Harness transport (CLI symlink target)** | `docs/developer/cli_agent_instructions.md` | MCP vs CLI precedence, CLI cheat sheets, pointers only. **Do not** paste full `[TURN LIFECYCLE]` … `[ONBOARDING]` mirrors here. |

## Required workflow when changing behavior

1. Edit **`docs/developer/mcp/instructions.md`** (inside the fenced block unless you are changing scope/preamble outside the block).
2. If the change affects operator docs, update **`docs/developer/agent_instructions.md`** (matrix, links, or dual-host notes only — not a second full rulebook).
3. Run tests that cover MCP instruction invariants (e.g. `tests/unit/mcp_instructions_fallback_invariants.test.ts`, agent MCP behavior tests if touched).
4. **Do not** re-expand `cli_agent_instructions.md` with duplicated bracket sections. CLI-only operational content (startup protocol, `--json=` warning, store/relationship/retrieval quick references) stays in that file.

## Forbidden

- Reintroducing a line-by-line MCP ↔ CLI duplicate mirror in `cli_agent_instructions.md`.
- Adding behavioral paragraphs to `cli_agent_instructions.md` that already exist in the MCP fenced block.
- Changing MCP/CLI semantics only in consumer repos when the behavior belongs in Neotoma core docs.

## CLI command for offline agents

`neotoma instructions print` emits the same fenced-block body bundled with the package (`package.json` `files` includes `docs/developer/mcp/instructions.md`). Keep it aligned with `getMcpInteractionInstructions()` extraction logic (`src/mcp_instruction_doc.ts`, `src/server.ts`).

## Related

- `docs/developer/mcp/instructions.md` — MCP instruction source (canonical)
- `docs/developer/cli_agent_instructions.md` — Thin harness layer
- `docs/developer/agent_instructions.md` — Index
- `docs/architecture/change_guardrails_rules.mdc` — Broader change guardrails
