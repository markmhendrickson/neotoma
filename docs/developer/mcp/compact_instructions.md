# Neotoma MCP — Compact instructions mode

## Scope

Description of `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1`, when to use it, and what it changes relative to the full MCP instruction block.

---

## What compact mode does

When `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` is set on the Neotoma MCP server, the server sends a shorter instruction payload instead of the full fenced code block from `docs/developer/mcp/instructions.md`.

The compact payload is defined in `src/server.ts` as `MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST`. It covers the same operational contract as the full block but in condensed form:

- Turn lifecycle (5 steps in order: bounded retrieval, user-phase store, other tools, compose reply, closing store).
- Core store recipe (flat entity shape, idempotency key, fallback IDs, FORBIDDEN patterns).
- Retrieval-first rule (tasks, schedule, contacts, notes, issues, events, finances, decisions, commitments — check Neotoma before native integrations).
- Display rule (Neotoma attribution block when entities are created, updated, or retrieved).
- Schema/fidelity (check declared fields, repair unknown_fields_count > 0).
- Per-turn QA and issue reporting.
- Store retry policy.

The compact payload ends with a pointer to the full doc (`docs/developer/mcp/instructions.md`) and to `neotoma instructions print`.

---

## When to use compact mode

Use `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` when:

- **The host already injects expanded Neotoma workspace rules.** For example, Claude Code with `.cursor/rules/` or `.claude/rules/` containing a full copy of the Neotoma behavioral contract. Sending the full MCP block again would duplicate context and waste tokens.
- **Mobile or short-context deployments.** Claude iOS/Android context windows are shorter than desktop. Compact mode reduces instruction overhead so more context is available for conversation and retrieval results.
- **Token budget is constrained.** Any deployment where the full ~200-line instruction block is too large relative to the expected conversation length.

Do not use compact mode if the host does not load any Neotoma workspace rules elsewhere. Without the full block, agents will miss sections not covered by the compact checklist (for example, detailed [STORE RECIPES] attachment and screenshot recipes, [ENTITY TYPES & SCHEMA] reuse rules, [PROVENANCE], and other subsections).

---

## Runtime fallback vs. intentional compact mode

The Neotoma server has two compact-mode payloads:

| Constant | When used | Header line |
|---|---|---|
| `MCP_INTERACTION_INSTRUCTIONS_FALLBACK` | `docs/developer/mcp/instructions.md` is unreadable at server start | `[COMPACT MODE — runtime fallback]` |
| `MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST` | `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` is set | `[COMPACT MODE — NEOTOMA_MCP_COMPACT_INSTRUCTIONS]` |

Both contain the same `MCP_INTERACTION_INSTRUCTIONS_COMPACT_BODY_LINES` content. The header line differs so agents and operators can distinguish an intentional compact deployment from a fallback caused by a broken doc path.

---

## Setting the environment variable

Add to the Neotoma server environment:

```bash
NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1
```

For local development with `npm run dev`, add the variable to `.env`:

```
NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1
```

Restart the server after changing the variable. The instruction payload is read at server start.

---

## Verifying compact mode is active

Connect an MCP client (Claude mobile, Claude.ai, Cursor, etc.) and look at the instruction text delivered by the server. In compact mode the payload starts with:

```
[COMPACT MODE — NEOTOMA_MCP_COMPACT_INSTRUCTIONS]
Every turn, do the following in order — do not skip steps:
1. Bounded retrieval: …
```

If the payload starts with `[TURN LIFECYCLE]`, the full instruction block is active.

---

## Related

- [`mobile_setup.md`](./mobile_setup.md) — Mobile setup guide (Claude iOS/Android)
- [`instructions.md`](./instructions.md) — Full MCP instruction source (canonical)
- `src/server.ts` (`MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST`, `MCP_INTERACTION_INSTRUCTIONS_COMPACT_BODY_LINES`) — Implementation
- [`../agent_instructions.md`](../agent_instructions.md) — Agent instructions index
