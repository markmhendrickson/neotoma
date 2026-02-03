# Neotoma Testing Standard
*(Test Types, Coverage Requirements, and Testing Strategy)*
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
### Integration Tests
**Scope:** Service interactions, database operations
**Examples:**
- Ingestion pipeline with test DB
- Search service with fixtures
- Graph insertion with transactions
**Requirements:**
- Use test database (real operations, not mocked)
- Clean up after each test
- Deterministic ordering
- Strong assertions that verify correct outcomes
- Test edge cases (null, default UUID, invalid values)
- Verify database state after operations

**See `integration_test_quality_rules.mdc` for detailed quality standards**

```typescript
test('record insert creates entities', async () => {
  const record = await insertRecord({
    type: 'FinancialRecord',
    properties: { vendor_name: 'Acme Corp' },
  });
  
  const entities = await getRecordEntities(record.id);
  expect(entities).toHaveLength(1);
  expect(entities[0].canonical_name).toBe('acme corp');
  
  // Verify database state
  const { data: stored, error } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entities[0].id)
    .single();
  expect(error).toBeNull();
  expect(stored).toBeDefined();
});
```
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
## Test Fixtures
See `docs/testing/fixtures_standard.md`.

## Automated test catalog
See `docs/testing/automated_test_catalog.md` for a full, file level inventory of automated tests and suite commands.

## Integration Test Quality

**See `foundation/conventions/testing_conventions.md` for generic principles.**

**See `docs/testing/integration_test_quality_rules.mdc` for Neotoma-specific applications:**
- Applying foundation principles to Supabase/PostgreSQL
- Testing Neotoma's default UUID and null handling
- Testing Neotoma-specific tables (raw_fragments, auto_enhancement_queue, etc.)
- Testing Neotoma-specific workflows (auto-enhancement, queue processing, etc.)
- Examples from actual Neotoma bugs

## Agent Instructions
Load when writing tests or planning test strategy for Feature Units.
Required co-loaded:
- `foundation/conventions/testing_conventions.md` (generic testing principles)
- `docs/architecture/determinism.md` (deterministic test requirements)
- `docs/testing/fixtures_standard.md` (fixture guidelines)
- `docs/testing/integration_test_quality_rules.mdc` (Neotoma-specific quality standards)
- `docs/testing/test_quality_enforcement_rules.mdc` (enforceable patterns from actual bugs)
Constraints:
- All tests MUST be deterministic
- Unit tests MUST be fast (<10ms)
- Integration tests MUST follow foundation conventions (see `foundation/conventions/testing_conventions.md`)
- Integration tests MUST use real database operations (no mocked Supabase queries)
- Integration tests MUST use strong assertions that verify correct outcomes
- Integration tests MUST test edge cases (null, default UUID, invalid values)
- Integration tests MUST test foreign key constraints explicitly
- Integration tests MUST verify database state after operations
- E2E tests MUST clean state
- Coverage MUST meet minimums
