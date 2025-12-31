# AI Safety Doctrine
## AI Tool Requirements
AI tools (ChatGPT, Claude, Cursor) MUST:
- Access truth **only via MCP** (no direct DB access)
- Reference `record_id` in answers (provenance)
- Never invent entities (only use existing)
- Never invent fields (only use extracted)
- Never reference nonexistent truth
- Default to conservative outputs ("I don't see that field")
**Any spec allowing LLM guessing without MCP grounding is invalid.**
