# v0.31.0 release supplement (in progress)

## Upgrade notes

- **Session index at the start of MCP instructions.**
  - Who: MCP clients and agents of an instance that has standing rules or graph-stored skills, especially clients that truncate long `instructions`.
  - Before: the full `[STANDING RULES]` block (up to 24,000 bytes) led the instructions and the `[INSTANCE SKILLS]` catalog came after the base block of over 100KB, so a client that cut the instructions early lost later rules and every skill.
  - After: the instructions open with a `[SESSION INDEX]` block of at most 2,048 bytes, closed by `[END SESSION INDEX]`, listing every rule title with its entity id and the instance skill names, with an explicit count and fetch hint for anything it cannot list. The full rules follow, then the skills catalog, then the base block and the policy. Session `initialize`, `server/discover`, `GET /mcp-interaction-instructions` and `neotoma instructions print` compose through one shared function. Instances with no rules and no skills serve unchanged text.
  - Migration: none. A client that checked that instructions start with `[STANDING RULES]` should skip the leading `[SESSION INDEX]` block first.

## Breaking changes

No breaking changes.
