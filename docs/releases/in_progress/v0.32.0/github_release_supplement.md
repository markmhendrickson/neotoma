Neotoma v0.32.0 opens the MCP instructions with a short session index of standing rules and instance skills, so a client that truncates long instructions still sees them.

## Highlights

- **Rules and skills survive truncated instructions.** The served instructions now open with a `[SESSION INDEX]` block of at most 2,048 bytes that names the instance's standing rules and skills before the long base block.

## Behavior changes

- **Session index at the start of MCP instructions.**
  - Who: MCP clients and agents of an instance that has standing rules or graph-stored skills, especially clients that truncate long `instructions`.
  - Before: the full `[STANDING RULES]` block (up to 24,000 bytes) led the instructions and the `[INSTANCE SKILLS]` catalog came after the base block of over 100KB, so a client that cut the instructions early lost later rules and every skill.
  - After: the instructions open with a `[SESSION INDEX]` block of at most 2,048 bytes, closed by `[END SESSION INDEX]`. It lists as many rules (title and entity id, in priority order) and skill names as fit, with a count of the rest and how to fetch them. The full rules follow, then the skills catalog, then the base block. Compact mode (`NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1`) carries the same index. Session `initialize`, `server/discover`, `GET /mcp-interaction-instructions` and `neotoma instructions print` compose through one shared function. Instances with no rules and no skills serve unchanged text.
  - The instance policy section stays where it was, after the base block, so a client that cuts the instructions very early can still lose it.
  - Migration: none. A client that checked that instructions start with `[STANDING RULES]` should skip the leading `[SESSION INDEX]` block first.

## Agent-facing instruction changes (ship to every client)

- `[STANDING RULES]` in `docs/developer/mcp/instructions.md` now says that a short `[SESSION INDEX]` of rule titles and skill names opens the instructions and the full standing rules follow it.

## Tests and validation

- New unit tests for the index renderer (`tests/unit/instructions_index.test.ts`) and an integration test of the index on every instructions entrance (`tests/integration/instructions_session_index.test.ts`).

## Breaking changes

No breaking changes.
