# Action item 7 plan: replayable fixtures with expected graphs

## Context summary
Fixtures are in `tests/fixtures/`, but expected extracted graph outputs are not centralized or enforced.

## Key problems solved
- Deterministic replay lacks a reference output.
- Fixtures do not include graph expectations.

## Key solutions implemented
- Store expected graph outputs alongside fixtures.
- Add replay tests that compare reducer output to expected graphs.

## Plan
1. Define an expected output format for snapshots and relationships.
2. Add expected outputs for a starter set of fixtures in `tests/fixtures/`.
3. Add replay tests that load fixtures and compare output to expected graphs.
4. Update fixture documentation to describe the expected output format.
