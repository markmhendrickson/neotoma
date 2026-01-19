# LLM Interpretation Documentation Update

**Date:** 2026-01-19  
**Purpose:** Fix documentation inconsistencies regarding LLM interpretation for unstructured data storage

## Summary

Updated documentation to reflect that AI interpretation is allowed for unstructured files (PDFs, images) with full auditability and system-level idempotence. Removed outdated "rule-based only" constraints that conflicted with the current architecture (v0.2.0+).

## Key Changes

### Architectural Clarification

**Previous (Incorrect):** "No LLM extraction (MVP constraint; rule-based only)"

**Current (Correct):** 
- AI interpretation for unstructured files (PDFs, images) via interpretation service
- Auditable (interpretation config logged: model, temperature, prompt_hash, code_version)
- System-level idempotence enforced (canonicalization + hashing ensures same source + config → same final state)
- Rule-based extraction available for structured data from agents (deterministic)

### Distinction: Replay Determinism vs. Idempotence

- **Replay Determinism:** Same input → identical output (byte-for-byte) — NOT achievable with LLMs
- **Idempotence:** Same operation → same final state (no duplicates) — ACHIEVED via post-processing
- AI interpretation is **idempotent** but not **replay-deterministic**
- See `docs/architecture/determinism.md` Section 1.4 for details

## Files Updated

### Core Specifications
1. **`docs/specs/MVP_OVERVIEW.md`**
   - Updated extraction approach description
   - Changed "Rule-based extraction only" to "AI interpretation for unstructured files"
   - Updated key differentiators section
   - Removed "LLM-based extraction" from "Not in MVP" list

2. **`docs/subsystems/ingestion/ingestion.md`**
   - Updated Section 5.1: Changed "MVP Extraction Approach: Rule-Based Only" to current architecture
   - Added references to interpretation service
   - Updated constraints and validation checklist
   - Clarified rule-based patterns are for structured data

3. **`docs/foundation/philosophy.md`**
   - Removed "No LLM extraction (MVP constraint)" from MUST NOT list
   - Added "No replay-deterministic claims for AI interpretation"
   - Updated to reflect auditability requirement

4. **`docs/foundation/agent_instructions_rules.mdc`**
   - Updated absolute constraints (Section 23.2)
   - Updated code generation rules (Section 23.4)
   - Updated forbidden patterns
   - Updated validation checklist
   - Added AI interpretation requirements with audit trail

5. **`.cursor/rules/foundation_agent_instructions_rules.mdc`**
   - Synced with updated source file

### MVP Documentation
6. **`docs/specs/MVP_FEATURE_UNITS.md`**
   - Updated FU-100 extraction approach
   - Changed constraints to require interpretation service

7. **`docs/specs/FUNCTIONAL_REQUIREMENTS.md`**
   - Updated extraction requirement
   - Changed validation checklist

8. **`docs/releases/v1.0.0/release_plan.md`**
   - Updated technical requirements
   - Replaced "no LLM extraction" with "AI interpretation with auditability"

9. **`docs/releases/v1.0.0/acceptance_criteria.md`**
   - Updated Truth Layer criteria
   - Changed validation from "no OpenAI calls" to "interpretation config logged"

### Supporting Documentation
10. **`docs/subsystems/record_types.md`**
    - Updated extraction approach references
    - Changed to "idempotent extraction"

11. **`docs/migration/llm_extraction_removal.md`**
    - Added prominent warning that document is outdated
    - Clarified this describes historical migration
    - Referenced current architecture docs

## What Was NOT Changed

- Architecture documents (`docs/architecture/determinism.md`, `docs/releases/v0.2.0/release_plan.md`) already correctly describe AI interpretation
- Implementation code (`src/services/interpretation.ts`, `src/services/llm_extraction.ts`) already implements AI interpretation correctly
- MCP spec (`docs/specs/MCP_SPEC.md`) already correctly shows `interpret: true` parameter

## Remaining Inconsistencies (Low Priority)

The following files still contain "rule-based only" or "no LLM" references but are lower priority:

- v0.1.0 release docs (historical, not updated)
- v0.2.3 schema extension docs (note AI interpretation not used for agent-created entities)
- Schema expansion docs (notes pattern detection is non-LLM)
- Implementation overwrite guide (may be obsolete)
- Various test/compliance reports (historical snapshots)

These can be updated if they cause confusion, but are less critical since they're either:
- Historical release documentation
- Specific edge cases (agent-created data, schema expansion)
- Archived compliance reports

## Validation

To verify the updates are correct:

1. Read `docs/architecture/determinism.md` Section 1.2-1.4 for canonical definition
2. Read `docs/releases/v0.2.0/release_plan.md` Section 5 for interpretation approach
3. Check `src/services/interpretation.ts` for implementation
4. Review `docs/specs/MCP_SPEC.md` for `interpret` parameter usage

## References

- **Authoritative Source:** `docs/architecture/determinism.md` — Complete determinism doctrine
- **Implementation:** `src/services/interpretation.ts` — Interpretation service with LLM
- **Architecture:** `docs/architecture/sources_first_ingestion_final.md` — Sources-first with interpretation runs
- **Release Context:** `docs/releases/v0.2.0/release_plan.md` — v0.2.0 introduced interpretation service

## Next Steps

If further documentation inconsistencies are discovered:
1. Search for "rule-based only", "no LLM", "LLM extraction" in docs
2. Check if reference is to:
   - **Historical constraint** → Add note referencing current architecture
   - **Current requirement** → Update to reflect AI interpretation with auditability
   - **Edge case** (agent-created data, schema expansion) → Leave as-is or clarify scope
