---
version: "1.0.0"
last_updated: "2026-02-02"
status: "canonical"
---

# Neotoma documentation standards
## Scope
This document defines the required structure, formatting, and validation rules for all Neotoma documentation. It does not replace subsystem or architecture specifications.

## Purpose
Provide a consistent documentation format that supports deterministic interpretation by agents and humans.

## Scope
This document covers:
- Required sections and file structure
- Documentation doctrine and invariants
- Examples, diagrams, and testing requirements
- Agent instructions and validation checklists
It does not cover:
- Code conventions
- Feature unit templates
- Release planning workflows

## Invariants
1. Documentation must align with `docs/NEOTOMA_MANIFEST.md`.
2. Documentation must be deterministic and testable.
3. Documentation must not include PII or secrets.
4. Documentation must use direct, declarative language.

## Definitions
- **Documentation doctrine**: The shared core invariants that all docs must embed or reference.
- **Agent instructions**: The required closing section that defines how agents must use the document.

## Terminology (preferred wording)
- Prefer **agent** over **bot** in prose when referring to automated actors (MCP clients, CI submitters, GitHub Apps, delegated machine identities). Reserve **bot** for literal config values, upstream API names, or GitHub product terms when accuracy requires it (e.g. `github_auth: "bot"` in `IssuesConfig`, or “GitHub bot user”).
- Prefer **issue reporting** / **GitHub Issues** over deprecated “feedback pipeline” language unless the document is explicitly about migration history.

## Documentation doctrine
Neotoma is a State Layer. It is not an app, agent, or strategy or execution system.
Core invariants:
- Deterministic: Same input yields same output
- Immutable: Truth never changes after storage
- Provenance: Every output traces to a source
- Schema first: All extraction derives from schemas
- Explicit control: User approves all ingestion
- Privacy maximal: No background data collection
- Graph integrity: No orphans, no cycles, no inferred edges

## Required document structure

### File header
Every documentation file must begin with:
```
# [Document Title]
## Scope
[Explicit statement of what this document covers and what it does NOT cover]
```

### Core sections
Documentation files must include these sections when applicable:
1. Purpose
2. Scope
3. Invariants
4. Definitions
5. Data models or schemas
6. Flows or sequences
7. Diagrams
8. Examples
9. Testing requirements
10. Agent instructions

## Flows and sequences
Flows should use Mermaid diagrams or clear step lists. Use deterministic ordering.

## Diagrams
Use Mermaid diagrams with stable node names. Avoid random identifiers.

## Examples
Examples must be complete and deterministic. Use realistic but synthetic data.

## Testing requirements
Each doc should list tests that validate the described behavior.

## Signaling and event-emission terminology

When documenting Neotoma's substrate-level state-change signaling (see `docs/foundation/philosophy.md` §5.9), use precise vocabulary that preserves the substrate/strategy boundary. The substrate emits structured reports of completed writes — it does not decide which changes matter or what to do about them.

### Required vocabulary

Use these terms consistently across foundation, architecture, and conventions docs:

| Term | Meaning | Notes |
|---|---|---|
| **signal** | A structured report of a completed state change | Noun. Substrate emits signals; consumers receive them. |
| **emit** | The substrate produces an outbound signal after a write | Verb. "Neotoma emits a signal after every successful write." |
| **deliver** | Best-effort transport of a signal to a registered endpoint | Verb. "Webhook delivery is fire-and-forget." Implies no guarantees. |
| **subscribe** | A consumer registers interest in receiving signals | Verb. The consumer subscribes; the substrate accepts the registration. |
| **subscription** | The persistent record of a consumer's registered interest | First-class entity. See `data_models.md`. |
| **react** | What a consumer does with a received signal | Verb. The substrate does not react to its own signals; consumers do. |
| **best-effort** | Delivery is attempted but not guaranteed | Modifier. "Best-effort delivery, no retry queue." |
| **fire-and-forget** | Signal is sent and not tracked; no acknowledgement loop | Modifier. Reinforces best-effort semantics. |

### Forbidden vocabulary in substrate context

In foundation and architecture docs, do NOT use the following verbs to describe the substrate's behavior — they imply strategy-layer decision-making:

- **decides** / **prioritizes** — implies the substrate ranks or selects signals
- **triggers** — implies a causal action chain initiated by the substrate
- **alerts** / **notifies** — implies a user-facing surface and importance judgment
- **pushes** — implies an active, opinionated delivery model with retry semantics

If a document needs to describe one of these behaviors, attribute it to the consuming layer ("the daemon decides," "the agent prioritizes"), not to Neotoma. Marketing/positioning surfaces (`product_positioning.md`, blog content, README) MAY use richer language, but foundation and architecture docs MUST use the required vocabulary above.

### Validation

CI should run the following grep against foundation, architecture, and the README; it must return zero matches:

```bash
rg -n "Neotoma (decides|prioritizes|triggers|alerts|notifies|pushes)" \
   docs/foundation docs/architecture README.md
```

If a match appears, the substrate/strategy boundary is at risk. Either rephrase to attribute the behavior to a consuming layer, or move the claim to a marketing surface.

## Public SPA site pages (MDX)

User-visible routes on the marketing/docs SPA that are sourced from **`docs/site/pages/<locale>/**/*.mdx`** (with `.meta.json`, registry, and `ROUTE_METADATA`) follow a separate allowlist and hybrid React patterns. Do not treat arbitrary `docs/**/*.md` files as importable site sources. Full wiring, SEO, validation commands, and agent rules: **`docs/developer/site_mdx_documentation.md`**.

## Agent Instructions
### When to Load This Document
Load this document when creating or editing documentation.

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md`
- `docs/conventions/writing_style_guide.md`

### Constraints Agents Must Enforce
1. Required sections are present.
2. Examples are deterministic and complete.
3. No PII or secrets are included.

### Forbidden Patterns
- Em dashes or en dashes
- Conversational transitions
- Soft questions
- Motivational language

### Validation Checklist
- [ ] Required sections present
- [ ] Examples are deterministic
- [ ] No PII or secrets
- [ ] Writing style rules applied
