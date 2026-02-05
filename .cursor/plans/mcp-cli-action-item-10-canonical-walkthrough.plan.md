# Action item 10 plan: canonical ingest to replay walkthrough

## Context summary
The pipeline is documented across multiple files, but there is no standalone walkthrough that ties ingest, normalize, extract, query, and replay into one guide.

## Key problems solved
- Users lack a single end to end walkthrough.
- Ingestion and replay steps are scattered across docs.

## Key solutions implemented
- Create a standalone walkthrough doc.
- Include deterministic examples with expected outputs.

## Plan
1. Create a new walkthrough doc under `docs/` that covers ingest, normalize, extract, query, and replay.
2. Include CLI and MCP examples with deterministic inputs and outputs.
3. Link to subsystem docs for implementation details.
4. Add the new doc to `docs/context/index_rules.mdc` and `docs/doc_dependencies.yaml`.
