# Import and Interpretation Debug Guide

## Scope

This document helps agents and developers debug Neotoma file import, AI interpretation, and entity/snapshot behavior. It summarizes common root causes and fixes.

## 1. Empty contact (or other entity) snapshot

**Symptom:** Observation has `fields: {}` or very few fields; entity snapshot is empty even though the source document has clear data.

**Root cause:** The LLM returns field names that do not match the schema. Validation only accepts exact schema keys; unknown keys are routed to `raw_fragments`. Example: JSON with `fullName`, `firstName`, `lastName` produces no schema match if the contact schema expects `name`, `email`, `phone`, etc.

**Fix (implemented):** The LLM prompt in `src/services/llm_extraction.ts` now includes exact contact schema field names and mapping hints (e.g. fullName/firstName+lastName → name, url → website, homeLocation → address). Re-import or re-interpret the source after updating the prompt.

**Debug checklist:**
- Inspect `raw_fragments` for the source: unknown but extracted fields appear there.
- Compare `raw_fragments.fragment_key` values to the entity schema in `src/services/schema_definitions.ts` (e.g. `contact`).
- Ensure the prompt lists the exact schema field names for that entity type.

## 2. PDF (or other file) first run: 0 entities; retry: 1+ entities

**Symptom:** First interpretation run creates 0 observations/entities; re-interpreting the same source later creates observations.

**Root cause:** AI interpretation is not replay-deterministic. The same source can yield different LLM outputs across runs (e.g. empty vs. successful extraction). See `docs/architecture/determinism.md` (Section 1.2–1.4).

**Fix:** Re-run interpretation for the same source (e.g. via MCP `reinterpret` or store with same file). No code change required; behavior is documented.

**Debug checklist:**
- Check `interpretations` for the source: multiple runs with different `observations_created` are expected.
- If the first run failed due to a backend error (e.g. missing column), fix the schema/migrations and retry.

## 3. Invoice (or other) raw_fragments contain wrong/hallucinated data

**Symptom:** Snapshot or raw_fragments show vendor names, amounts, or line items that do not appear in the source document (e.g. template-like or invented values).

**Root cause:** The LLM sometimes filled fields with assumed or template values instead of document-only content.

**Fix (implemented):** The LLM prompt now states: "Extract ONLY information that appears explicitly in the document. Do not invent, assume, or use template/example values." Invoice items are described as "Line items only if listed in the document (do not invent items)." Re-interpret the source after the prompt update to get document-accurate extraction.

**Debug checklist:**
- Open the source file and confirm whether each extracted value (vendor_name, customer_name, amount_due, items) appears in the text.
- If not, treat as hallucination; tighten prompt or re-interpret after prompt changes.

## 4. Backend interpretation errors (e.g. missing columns)

**Symptom:** Errors such as `table interpretations has no column named user_id` or `created_at`.

**Root cause:** Database schema out of sync with code (e.g. migrations not applied).

**Fix:** Run migrations and ensure the `interpretations` table has all required columns. See `migrations/` and `docs/private/migration/migrations_lifecycle.md`.

## 5. Related docs and MCP tools

- **Determinism and retries:** `docs/architecture/determinism.md` (AI interpretation, idempotence, retry behavior).
- **Ingestion pipeline:** `docs/subsystems/ingestion/ingestion.md`.
- **MCP:** `store_unstructured` (file_path, interpret=true), `reinterpret`, `retrieve_entity_snapshot`, `list_observations`.

## Agent Instructions

### When to load

- Debugging empty snapshots after import.
- Debugging first-run vs retry variance for interpretations.
- Investigating mismatches between source documents and extracted/raw_fragment data.

### Constraints

- Do not treat LLM interpretation as deterministic; document retry as expected when needed.
- Verify alleged hallucinations against the actual source content before changing code.
