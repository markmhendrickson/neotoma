# Fixtures and expected outputs

## Scope
This document describes fixture storage and expected output files. It does not define schema rules or reducer behavior.

## Expected outputs
Expected snapshot and graph outputs live in `tests/fixtures/expected/`. Each JSON file represents the expected deterministic output for a replay test.

### Format
Each expected output file uses a stable JSON format:
- `entity_id`
- `entity_type`
- `schema_version`
- `snapshot`
- `computed_at`
- `observation_count`
- `last_observation_at`
- `provenance`
- `user_id`

### Example
See `tests/fixtures/expected/contact_snapshot.json` and `tests/fixtures/expected/transaction_snapshot.json`.
