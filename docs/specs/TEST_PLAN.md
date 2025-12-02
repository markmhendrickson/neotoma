# Neotoma Test Plan

_(Consolidated Testing Strategy and Requirements)_

---

**Note:** This is a **high-level summary** document for stakeholders and quick reference. For implementation details, see:

- [`docs/testing/testing_standard.md`](../testing/testing_standard.md) — Complete testing standards and requirements
- [`docs/testing/fixtures_standard.md`](../testing/fixtures_standard.md) — Test fixture creation and usage
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism testing requirements (100 runs, acceptable variance)
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Ingestion pipeline testing
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Schema testing requirements

**In case of conflict, detailed subsystem docs are authoritative.**

---

## Purpose

Consolidates testing requirements across all subsystems into a single reference document for stakeholders and planning.

---

## 1. Test Types

### Unit Tests

- Pure functions (extraction, ID generation)
- Fast (<10ms)
- Deterministic (100 runs → 100 same results)

### Integration Tests

- Service + database interactions
- Full ingestion pipeline
- Graph transactions

### E2E Tests (Playwright)

- Upload file → see record
- Search → click → view detail
- Timeline filtering

### Property-Based Tests

- Invariant verification
- Determinism proofs

See [`docs/testing/testing_standard.md`](../testing/testing_standard.md)

---

## 2. Coverage Targets

| Layer       | Lines | Branches | Critical Paths |
| ----------- | ----- | -------- | -------------- |
| Domain      | >85%  | >85%     | 100%           |
| Application | >80%  | >80%     | 100%           |
| UI          | >75%  | >75%     | N/A            |

**Critical Paths:**

- Ingestion pipeline
- Entity resolution
- Graph insertion
- Search ranking

---

## 3. Test Fixtures

**Categories:**

- Sample documents (PDF, JPG)
- Test data (JSON)
- Multi-language fixtures

**Rules:**

- No real PII
- Deterministic content
- Documented expected extraction

See [`docs/testing/fixtures_standard.md`](../testing/fixtures_standard.md)

---

## 4. Deterministic Testing

**Requirements:**

- All tests MUST pass 100 consecutive runs
- Same input → same output verified
- No flaky tests

See [`docs/architecture/determinism.md`](../architecture/determinism.md)

---

## Detailed Documentation References

- [`docs/testing/testing_standard.md`](../testing/testing_standard.md)
- [`docs/testing/fixtures_standard.md`](../testing/fixtures_standard.md)
- [`docs/architecture/determinism.md`](../architecture/determinism.md)

---

## Agent Instructions

### When to Load This Document

Load `docs/specs/TEST_PLAN.md` when:

- Planning testing strategy for Feature Units
- Understanding coverage targets
- Quick reference for test types required

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/testing/testing_standard.md` (detailed testing requirements)
- `docs/architecture/determinism.md` (determinism testing requirements)
- `docs/testing/fixtures_standard.md` (fixture creation)

### Constraints Agents Must Enforce

1. **Determinism tests required:** All tests must pass 100 consecutive runs (section 4)
2. **Coverage targets:** Domain >85%, Application >80%, UI >75% (section 2)
3. **Critical paths 100%:** Ingestion, entity resolution, graph insertion, search ranking
4. **No flaky tests:** Same input → same output, always
5. **Defer to detailed docs:** This is a summary; `testing_standard.md` is authoritative

### Forbidden Patterns

- Skipping determinism tests (100-run requirement)
- Accepting flaky tests
- Missing coverage on critical paths
- Creating fixtures with real PII

### Validation Checklist

- [ ] All test types present (unit, integration, E2E, property-based)
- [ ] Determinism verified (100 runs → 100 identical results)
- [ ] Coverage targets met per layer
- [ ] Critical paths have 100% coverage
- [ ] Fixtures follow standards (no PII, deterministic)
- [ ] Cross-checked against testing_standard.md

---

## Agent Instructions

### When to Load This Document

Load `docs/specs/TEST_PLAN.md` when:

- Planning testing strategy for Feature Units
- Understanding coverage targets
- Quick reference for test types required

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/testing/testing_standard.md` (detailed testing requirements)
- `docs/architecture/determinism.md` (determinism testing requirements)
- `docs/testing/fixtures_standard.md` (fixture creation)

### Constraints Agents Must Enforce

1. **Determinism tests required:** All tests must pass 100 consecutive runs (section 4)
2. **Coverage targets:** Domain >85%, Application >80%, UI >75% (section 2)
3. **Critical paths 100%:** Ingestion, entity resolution, graph insertion, search ranking
4. **No flaky tests:** Same input → same output, always
5. **Defer to detailed docs:** This is a summary; `testing_standard.md` is authoritative

### Forbidden Patterns

- Skipping determinism tests (100-run requirement)
- Accepting flaky tests
- Missing coverage on critical paths
- Creating fixtures with real PII

### Validation Checklist

- [ ] All test types present (unit, integration, E2E, property-based)
- [ ] Determinism verified (100 runs → 100 identical results)
- [ ] Coverage targets met per layer
- [ ] Critical paths have 100% coverage
- [ ] Fixtures follow standards (no PII, deterministic)
- [ ] Cross-checked against testing_standard.md
