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

## Documentation doctrine
Neotoma is a Truth Layer. It is not an app, agent, or strategy or execution system.
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
