---
title: "LLM Sampling Parameters in Interpretation Config"
status: "proposal"
source_plan: null
created_date: "2026-02-09"
priority: "p2"
estimated_effort: "1-2 days"
---

# LLM Sampling Parameters in Interpretation Config

## Scope

This document covers:
- Adding top-K and top-P (nucleus sampling) to Neotoma's interpretation configuration
- Task-specific sampling presets for factual vs creative LLM use cases
- Documentation of sampling parameters for auditability and reproducibility

This document does NOT cover:
- Changes to reducers, entity resolution, or other deterministic components
- Strategy Layer or Execution Layer LLM usage (future work)

## Proposal Context

**Source:** Analysis of [Understanding Top-K and Top-P in Prompt Engineering](https://medium.com/@8926581/understanding-top-k-and-top-p-in-prompt-engineering-00a3b93dcd40) (Nikita Zaharov) applied to Neotoma's interpretation architecture.

**Relevance:** Neotoma uses LLMs for AI interpretation of unstructured files (PDFs, images). Current implementation uses `temperature` and `top_p` but does not log `top_k`, and interpretation config lacks task-specific presets. Adding full sampling parameter support improves control over extraction quality and supports auditability.

**Architecture Alignment:** Verified. Aligns with interpretation auditability in `docs/architecture/determinism.md`. Parameters are part of interpretation config, not Truth Layer core logic.

## Purpose

Extend Neotoma's interpretation configuration to include full LLM sampling parameters (top-K, top-P) alongside temperature, enabling:

1. Complete audit trail of sampling configuration used for each interpretation run
2. Task-specific presets (factual extraction vs schema recommendation) with documented rationale
3. Mitigation of repetition loop bugs when they occur in structured extraction output
4. Consistent parameter handling across all LLM-calling services

## Overview

### Current State

| Location | Temperature | Top-P | Top-K | Logged in config? |
|----------|-------------|-------|-------|-------------------|
| `llm_extraction.ts` | 0 | 1 | Not set | Partial |
| `server.ts` interpretation | 0 (default) | Not set | Not set | Yes (temp only) |
| `schema_icon_service.ts` | 0.1, 0.3 | Not set | Not set | No |
| `schema_recommendation.ts` | 0.3 | Not set | Not set | No |

`InterpretationConfig` in `src/services/interpretation.ts` includes:
- `provider`, `model_id`, `temperature`, `prompt_hash`, `code_version`, `feature_flags`
- Does NOT include `top_k` or `top_p`

### Proposed State

1. **Extend InterpretationConfig** with `top_k` and `top_p` (optional, with defaults)
2. **Define task-specific presets** in configuration
3. **Apply presets** to interpretation, LLM extraction, and schema services
4. **Document** sampling parameter rationale in architecture docs

## Technical Details

### 1. InterpretationConfig Schema Extension

```typescript
// src/services/interpretation.ts
export interface InterpretationConfig {
  provider: string;
  model_id: string;
  temperature: number;
  top_k?: number;      // NEW: Limit to K most likely tokens (e.g., 20-40)
  top_p?: number;      // NEW: Nucleus sampling threshold (e.g., 0.9-0.99)
  prompt_hash: string;
  code_version: string;
  feature_flags?: Record<string, boolean>;
}
```

### 2. Task-Specific Presets

Based on prompt engineering best practices (factual extraction vs creative tasks):

| Preset | Use Case | Temperature | Top-K | Top-P | Rationale |
|--------|----------|-------------|-------|-------|-----------|
| `factual_extraction` | Document field extraction, interpretation | 0 | 20 | 1 | Maximum determinism; temp=0 picks most likely token; top-K=20 narrows vocabulary |
| `balanced` | Schema recommendation, icon matching | 0.2 | 30 | 0.95 | Slight flexibility; avoids repetition loop |
| `creative` | Future: summaries, descriptions | 0.7 | 40 | 0.99 | More variety; not for Truth Layer extraction |

Default for interpretation: `factual_extraction`.

### 3. Implementation Locations

| File | Change |
|------|--------|
| `src/services/interpretation.ts` | Add `top_k`, `top_p` to InterpretationConfig; pass to LLM calls |
| `src/services/llm_extraction.ts` | Add `top_k: 20`; read from config if provided |
| `src/server.ts` | Parse `top_k`, `top_p` from `interpretation_config`; apply defaults |
| `src/services/schema_icon_service.ts` | Use `balanced` preset |
| `src/services/schema_recommendation.ts` | Use `balanced` preset |
| `docs/architecture/determinism.md` | Document sampling parameters in interpretation auditability section |

### 4. Repetition Loop Mitigation

If interpretation output exhibits repetition (e.g., "AI is useful. AI is useful. AI is useful."):

- **Cause:** Temperature 0 with restrictive sampling can cause deterministic loops
- **Fix:** Use `balanced` preset (temp 0.2, top-P 0.95) or increase top-K to 30
- **Trade-off:** Slightly more variance; idempotence preserved via canonicalization

## Data Models

### InterpretationConfig (Extended)

```yaml
InterpretationConfig:
  provider: string
  model_id: string
  temperature: number
  top_k: number | null   # Optional; null = provider default
  top_p: number | null   # Optional; null = provider default
  prompt_hash: string
  code_version: string
  feature_flags: Record<string, boolean> | null
```

### interpretations Table

Ensure `interpretation_config` JSONB column can store `top_k` and `top_p` (no migration needed; JSONB is schemaless for additional keys).

## Implementation Steps

1. Extend `InterpretationConfig` interface in `interpretation.ts`
2. Add preset constants (factual_extraction, balanced, creative) to a shared config module
3. Update `llm_extraction.ts` to accept and use `top_k`, `top_p` from config
4. Update `server.ts` interpretation handler to parse and pass `top_k`, `top_p`
5. Update `schema_icon_service.ts` and `schema_recommendation.ts` to use `balanced` preset
6. Add documentation to `docs/architecture/determinism.md` Section 1.3 or 1.4
7. Add unit tests for preset application and config serialization

## Testing Requirements

- Unit test: InterpretationConfig with `top_k` and `top_p` serializes and deserializes correctly
- Unit test: Preset application produces expected parameter values
- Integration test: Interpretation run stores full config (including top_k, top_p) in interpretations
- Regression: Existing interpretation flows work with null/undefined top_k and top_p (backward compatible)

## Invariants

- Interpretation config MUST remain auditable (all sampling params logged)
- Default behavior MUST NOT change for existing callers (backward compatible)
- Idempotence via canonicalization MUST remain the primary guarantee (sampling params are an aid, not a replacement)

## Definitions

- **Top-K:** LLM sampling method that limits token selection to the K most probable tokens at each step
- **Top-P (nucleus sampling):** LLM sampling method that selects the smallest set of tokens whose cumulative probability reaches P
- **Factual extraction:** Structured field extraction from documents (invoices, receipts); requires low variance

## References

- Source article: https://medium.com/@8926581/understanding-top-k-and-top-p-in-prompt-engineering-00a3b93dcd40
- `docs/architecture/determinism.md` — Idempotence vs determinism, interpretation auditability
- `src/services/interpretation.ts` — InterpretationConfig interface
- `src/services/llm_extraction.ts` — Current temperature/top_p usage

## Agent Instructions

### When to Load This Document

Load when implementing or modifying interpretation configuration, LLM sampling parameters, or interpretation auditability.

### Required Co-Loaded Documents

- `docs/architecture/determinism.md`
- `docs/subsystems/ingestion/ingestion.md`
- `src/services/interpretation.ts`

### Constraints Agents Must Enforce

1. All LLM sampling parameters used MUST be logged in interpretation config
2. Defaults MUST preserve backward compatibility (null/undefined = provider default)
3. Factual extraction MUST use factual_extraction preset (or equivalent low-variance params)

### Forbidden Patterns

- Adding sampling parameters without updating InterpretationConfig
- Using creative preset for Truth Layer interpretation (extraction must use factual or balanced)

### Validation Checklist

- [ ] InterpretationConfig includes top_k and top_p
- [ ] Presets are documented with rationale
- [ ] All LLM-calling services use presets or explicit config
- [ ] documentation/determinism.md updated
- [ ] Tests cover config serialization and preset application
