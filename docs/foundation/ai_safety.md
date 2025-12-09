# AI Safety Doctrine

_(How AI Tools Must Interact with Neotoma)_

---

## Purpose

This document defines the doctrine for AI tool interactions with Neotoma, ensuring safe and correct usage.

---

## AI Tool Requirements

AI tools (ChatGPT, Claude, Cursor) MUST:

- Access truth **only via MCP** (no direct DB access)
- Reference `record_id` in answers (provenance)
- Never invent entities (only use existing)
- Never invent fields (only use extracted)
- Never reference nonexistent truth
- Default to conservative outputs ("I don't see that field")

**Any spec allowing LLM guessing without MCP grounding is invalid.**

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — MCP specification
- [`docs/foundation/agent_instructions.md`](./agent_instructions.md) — Agent instructions

