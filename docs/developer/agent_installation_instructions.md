# Agent Installation Instructions

## Workflow

1. Install Neotoma with `npm install -g neotoma`.
2. Initialize Neotoma with `neotoma init`.
3. Report what changed after install/init.
4. Gather candidate personal data from passive sources first (no new tool calls):
   - current conversation and prior in-session messages
   - only relevant injected host context (for example user identity hints, explicit commitments, and directly related file/message context)
5. If needed, gather more data from active sources:
   - git metadata (`git config`, `git log`, `git remote -v`)
   - project metadata (`README`, `package.json`, selected config files, env var names only)
   - configured MCP/tool outputs already available in-session
   - existing Neotoma memory (`retrieve_entities` or CLI list/search) to separate already-stored facts from new candidates
6. Prioritize candidates by Neotoma value:
   - Tier 1: people/contacts, relationships, commitments, obligations, deadline-bearing tasks
   - Tier 2: events, decisions, preferences, meaningful financial facts
   - Tier 3: stable project/codebase context
   - Tier 4: transient session state
7. Map candidates to supported schema/entity types before proposing saves:
   - use canonical types where possible (for example: `contact`, `person`, `company`, `task`, `event`, `transaction`, `receipt`, `note`, `location`, `property`, `place`)
   - if type mapping is unclear, discover the closest match with schema search/list (`schemas list`, `schemas get`, or MCP equivalents) before inventing a type
   - if no close match exists, use a descriptive `entity_type` and include fields implied by the source data
8. Present a preview with provenance:
   - group by priority tier, then entity type
   - include key fields and source attribution (for example: "from git config", "from package.json", "from current message")
   - mark items as already stored vs new candidates
9. Ask for explicit confirmation (approve all / approve selected / edit / reject).
10. After asking for confirmation, pause and wait for the user response. Do not store data, run follow-up discovery, or proceed to additional actions until the user explicitly confirms.
11. Save only approved items.
12. Mark onboarding complete and continue with normal Neotoma behavior.

## Guardrails

- Do not run background scanning outside current context/tool outputs.
- Do not save previewed personal data before explicit user confirmation.
- After presenting the preview, do not proceed with additional actions until the user explicitly confirms what to save.
- Keep confirmation-first behavior scoped to first-run onboarding only.

## Scope

- This document is agent-facing and intended for direct linking from site snippets.
- For the complete onboarding sequence and guardrails, see [Agent onboarding](agent_onboarding.md).
