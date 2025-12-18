# Neotoma Testing Standard
*(Test Types, Coverage Requirements, and Testing Strategy)*

---

## Purpose

Defines testing requirements for all Neotoma code and Feature Units.

---

## Test Types

### Unit Tests
**Scope:** Pure functions, deterministic logic

**Examples:**
- `extractFieldsForFinancialRecord(text)`
- `generateEntityId(type, name)`
- `calculateScore(record, query)`

**Requirements:**
- Fast (<10ms per test)
- No external dependencies
- Deterministic (100 runs → 100 same results)

```typescript
test('entity ID generation is deterministic', () => {
  const id1 = generateEntityId('company', 'Acme Corp');
  const id2 = generateEntityId('company', 'Acme Corp');
  expect(id1).toBe(id2);
});
```

---

### Integration Tests
**Scope:** Service interactions, database operations

**Examples:**
- Ingestion pipeline with test DB
- Search service with fixtures
- Graph insertion with transactions

**Requirements:**
- Use test database
- Clean up after each test
- Deterministic ordering

```typescript
test('record insert creates entities', async () => {
  const record = await insertRecord({
    type: 'FinancialRecord',
    properties: { vendor_name: 'Acme Corp' },
  });
  
  const entities = await getRecordEntities(record.id);
  expect(entities).toHaveLength(1);
  expect(entities[0].canonical_name).toBe('acme corp');
});
```

---

### E2E Tests (Playwright)
**Scope:** Full user flows, browser automation

**Examples:**
- Upload file → see record details
- Search records → click result → view detail
- Timeline view → filter by date

**Requirements:**
- Use test fixtures
- Deterministic test data
- Clean DB state per test

```typescript
test('upload invoice flow', async ({ page }) => {
  await page.goto('/upload');
  await page.setInputFiles('input[type="file"]', 'fixtures/invoice.pdf');
  await page.click('button:has-text("Upload")');
  
  await page.waitForSelector('text=Invoice #INV-001');
  expect(await page.textContent('h1')).toContain('FinancialRecord');
});
```

---

### Property-Based Tests
**Scope:** Invariant verification

**Example:**
```typescript
import fc from 'fast-check';

test('entity ID is always same length', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (type, name) => {
      const id = generateEntityId(type, name);
      return id.startsWith('ent_') && id.length === 28;
    })
  );
});
```

---

## Coverage Requirements

| Code Type | Lines | Branches | Critical Paths |
|-----------|-------|----------|----------------|
| Domain Logic | >85% | >85% | 100% |
| Application Layer | >80% | >80% | 100% |
| UI Components | >75% | >75% | N/A |
| Infrastructure | >70% | >70% | N/A |

**Critical Paths:**
- Ingestion pipeline
- Entity resolution
- Graph insertion
- Search ranking

---

## Testing by Subsystem

### Ingestion
- Unit: Field extraction, schema detection
- Integration: Full pipeline with test DB
- E2E: Upload file via UI

### Search
- Unit: Ranking algorithm, query parsing
- Integration: Search with fixtures
- E2E: Search via UI

### Entity Resolution
- Unit: Entity ID generation, normalization
- Property: Determinism, collision resistance

---

## Test Fixtures

See `docs/testing/fixtures_standard.md`.

---

## Agent Instructions

Load when writing tests or planning test strategy for Feature Units.

Required co-loaded:
- `docs/architecture/determinism.md` (deterministic test requirements)
- `docs/testing/fixtures_standard.md` (fixture guidelines)

Constraints:
- All tests MUST be deterministic
- Unit tests MUST be fast (<10ms)
- E2E tests MUST clean state
- Coverage MUST meet minimums



















