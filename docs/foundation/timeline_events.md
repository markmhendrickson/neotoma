# Timeline and Event Doctrine
## 16.1 Event Generation Rules
Events MUST:
- Derive from extracted date fields (never inferred)
- Reflect actual dates in documents
- Be timestamp-normalized (ISO 8601)
- Be source-field-linked (traceability)
- Have deterministic IDs (hash-based)
Events MUST NOT:
- Be inferred or predicted
- Be created without source date
- Mutate after creation
## 16.2 Timeline Requirements
Timeline MUST be:
- Chronological (sorted by `event_timestamp`)
- Deterministic (same events → same order)
- Stable (events never removed without user action)
- Source-linked (every event → source record + field)
**AI MUST rely on timeline for temporal reasoning, not guess.**
