# Action item 11 plan: fixtures repository with expected outputs

## Context summary
Fixtures are in `tests/fixtures/`, but expected outputs are not centrally published or enforced.

## Key problems solved
- Fixture outputs are not discoverable or consistent.
- Replay tests lack a canonical output target.

## Key solutions implemented
- Add expected outputs alongside fixtures in a consistent layout.
- Document the expected output format and update cadence.

## Plan
1. Define a folder structure for expected outputs under `tests/fixtures/`.
2. Add expected outputs for key fixture types.
3. Add validation tooling that fails if expected outputs are missing.
4. Update fixture documentation to reference expected outputs.
