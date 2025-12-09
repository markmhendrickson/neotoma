# Neotoma Determinism Doctrine — Reproducibility and Predictability Guarantees
*(Determinism Requirements Across All Subsystems)*

---

## Purpose

This document defines **determinism** as a foundational requirement for all Neotoma subsystems and specifies how to achieve and test deterministic behavior. It ensures:

- Same input always produces same output
- Reproducible behavior across runs, environments, and time
- Predictable ordering and ID generation
- Testable correctness guarantees
- No hidden randomness or nondeterminism

**Determinism is not optional.** It is a core architectural constraint derived from Neotoma's role as a **Truth Layer** — a system that must provide reliable, reproducible structured memory for AI systems.

---

## Scope

This document covers:
- Definition and requirements of determinism
- Deterministic patterns for common operations
- Sorting, ordering, and ID generation rules
- Elimination of randomness and timing dependencies
- Testing strategies for deterministic behavior

This document does NOT cover:
- Consistency models (see `docs/architecture/consistency.md`)
- Specific extraction logic (see subsystem docs)
- Database transaction isolation (implementation detail)

---

## 1. Determinism: Core Definition

### 1.1 What is Determinism?

**Determinism:** Given the same inputs, a system MUST always produce the same outputs, in the same order, with the same internal state.

**Inputs include:**
- Function arguments
- File contents
- Database state (at time of query)
- Configuration values

**Outputs include:**
- Return values
- Database writes
- Generated IDs
- Event emissions
- Log messages (excluding timestamps)

**Timing and Environment MUST NOT affect outputs:**
- ❌ Current timestamp (unless explicitly part of input)
- ❌ Random number generation
- ❌ Nondeterministic sorting (e.g., Map iteration order in some languages)
- ❌ Network latency
- ❌ Filesystem ordering (e.g., `readdir()` without sorting)

### 1.2 Why Determinism Matters for Neotoma

**Correctness:**
- Users must trust Neotoma's extracted truth
- Same document uploaded twice MUST produce same entities, events, graph

**Testability:**
- Tests must be reproducible (no flaky tests)
- Property-based testing requires determinism

**Debuggability:**
- Bugs must be reproducible from inputs alone
- No "works on my machine" issues from nondeterminism

**AI Safety:**
- AI agents depend on Neotoma for ground truth
- Nondeterministic truth breaks AI reasoning

**Auditing:**
- Provenance requires deterministic extraction
- "Why was this entity created?" must have reproducible answer

---

## 2. Sources of Nondeterminism (FORBIDDEN)

### 2.1 Random Number Generation

❌ **FORBIDDEN:**
```typescript
// Nondeterministic: random UUID
const recordId = `rec_${uuidv4()}`; // Different every time
```

✅ **REQUIRED:**
```typescript
// Deterministic: hash-based ID
const recordId = generateRecordId(fileHash, userId, uploadTimestamp);
// Same inputs → same ID
```

---

### 2.2 Timestamps (When Not Part of Input)

❌ **FORBIDDEN:**
```typescript
// Nondeterministic: current time affects output
const recordId = `rec_${Date.now()}`;
```

✅ **REQUIRED:**
```typescript
// Deterministic: use explicit timestamp from input
const recordId = generateRecordId(fileHash, explicitTimestamp);
```

**Exception:** `created_at` and `updated_at` timestamps for audit purposes are acceptable (but not used for ID generation or sorting when determinism required).

---

### 2.3 Unsorted Iteration

❌ **FORBIDDEN:**
```typescript
// Nondeterministic: Map iteration order is not guaranteed in all JS engines
for (const [key, value] of myMap) {
  processField(key, value);
}
```

✅ **REQUIRED:**
```typescript
// Deterministic: sort keys first
const sortedKeys = Array.from(myMap.keys()).sort();
for (const key of sortedKeys) {
  const value = myMap.get(key);
  processField(key, value);
}
```

---

### 2.4 Filesystem Ordering

❌ **FORBIDDEN:**
```typescript
// Nondeterministic: readdir() order is filesystem-dependent
const files = await fs.readdir('/uploads');
for (const file of files) {
  await processFile(file);
}
```

✅ **REQUIRED:**
```typescript
// Deterministic: sort before processing
const files = (await fs.readdir('/uploads')).sort();
for (const file of files) {
  await processFile(file);
}
```

---

### 2.5 Concurrent Execution Without Ordering

❌ **FORBIDDEN:**
```typescript
// Nondeterministic: Promise.all() doesn't guarantee order
const results = await Promise.all(files.map(f => processFile(f)));
// Order of results depends on which promise resolves first
```

✅ **REQUIRED (if order matters):**
```typescript
// Deterministic: process sequentially or sort after
const results = [];
for (const file of files.sort()) {
  results.push(await processFile(file));
}
```

---

### 2.6 LLM Outputs (Non-Deterministic by Nature)

❌ **FORBIDDEN (in MVP):**
```typescript
// Nondeterministic: LLM extraction varies
const entities = await llm.extract(rawText);
// Same text → different entities each run
```

✅ **REQUIRED (MVP):**
```typescript
// Deterministic: rule-based extraction
const entities = extractEntitiesViaRegex(rawText, schemaRules);
// Same text + rules → same entities
```

**Future:** If LLM extraction is added, MUST use:
- Temperature = 0
- Fixed seed
- Fixed prompt
- Validation against deterministic rules
- Still not 100% deterministic (document limitations)

---

### 2.7 Floating-Point Arithmetic (Edge Case)

❌ **POTENTIALLY NONDETERMINISTIC:**
```typescript
// May vary across architectures or rounding modes
const score = (a * b) / c;
```

✅ **SAFER:**
- Use fixed-precision decimals for financial amounts (e.g., `Decimal.js`)
- Document rounding modes
- Test across architectures

---

## 3. Deterministic Patterns

### 3.1 Deterministic ID Generation

**Pattern:** Use cryptographic hash of canonical inputs.

**Example:**
```typescript
import { createHash } from 'crypto';

export function generateEntityId(
  entityType: string,
  canonicalName: string
): string {
  // Normalize inputs
  const normalized = canonicalName.toLowerCase().trim();
  
  // Hash deterministically
  const hash = createHash('sha256')
    .update(`${entityType}:${normalized}`)
    .digest('hex');
  
  // Return stable ID
  return `ent_${hash.substring(0, 24)}`;
}

// Same inputs → same ID, always
generateEntityId('company', 'Acme Corp') === generateEntityId('company', 'Acme Corp'); // true
```

**Why this works:**
- SHA-256 is deterministic
- Same inputs → same hash
- No timestamps, no randomness

---

### 3.2 Deterministic Sorting

**Pattern:** Always sort by stable, deterministic fields.

**Example:**
```typescript
// Sort records by created_at (stable timestamp), then by ID (tiebreaker)
const sortedRecords = records.sort((a, b) => {
  const timeDiff = a.created_at.localeCompare(b.created_at);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id); // Tiebreaker
});
```

**Tiebreaker Rules:**
- Primary sort: business-meaningful field (e.g., `created_at`, `name`)
- Secondary sort: unique stable field (e.g., `id`)
- Never sort by mutable field without tiebreaker

---

### 3.3 Deterministic Deduplication

**Pattern:** Use content hash to detect duplicates.

**Example:**
```typescript
export function deduplicateRecords(records: Record[]): Record[] {
  const seen = new Set<string>();
  const unique: Record[] = [];
  
  for (const record of records) {
    const contentHash = hashRecordContent(record);
    if (!seen.has(contentHash)) {
      seen.add(contentHash);
      unique.push(record);
    }
  }
  
  return unique;
}

function hashRecordContent(record: Record): string {
  // Hash only immutable fields
  const canonical = JSON.stringify({
    schema_type: record.schema_type,
    raw_text: record.raw_text,
    user_id: record.user_id,
  });
  
  return createHash('sha256').update(canonical).digest('hex');
}
```

**Why this works:**
- Content hash is deterministic
- Same content → same hash → detected as duplicate
- No reliance on upload order or timing

---

### 3.4 Deterministic Entity Resolution

**Pattern:** Normalize, then hash.

**Example:**
```typescript
export function resolveEntity(
  entityType: string,
  rawValue: string
): { id: string; canonical_name: string } {
  // Step 1: Normalize
  const canonical = normalizeEntityValue(entityType, rawValue);
  
  // Step 2: Generate deterministic ID
  const id = generateEntityId(entityType, canonical);
  
  return { id, canonical_name: canonical };
}

function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();
  
  if (entityType === 'company') {
    // Remove common suffixes deterministically
    normalized = normalized
      .replace(/\s+(inc|llc|ltd|corp|corporation)\.?$/i, '')
      .trim();
  }
  
  return normalized;
}

// Examples:
resolveEntity('company', 'Acme Corp').id === resolveEntity('company', 'Acme Corp').id; // true
resolveEntity('company', 'ACME CORP').id === resolveEntity('company', 'Acme Corp').id; // true (normalized)
```

---

### 3.5 Deterministic Event Generation

**Pattern:** One event per date field, deterministic event ID.

**Example:**
```typescript
export function generateEvents(
  recordId: string,
  extractedFields: Record<string, any>,
  schemaType: string
): Event[] {
  const events: Event[] = [];
  const dateFields = getDateFields(schemaType); // Deterministic schema-based
  
  // Sort fields for deterministic order
  for (const fieldName of dateFields.sort()) {
    const dateValue = extractedFields[fieldName];
    if (!dateValue) continue;
    
    const eventType = mapFieldToEventType(fieldName, schemaType);
    const eventId = generateEventId(recordId, fieldName, dateValue);
    
    events.push({
      id: eventId,
      event_type: eventType,
      event_timestamp: dateValue,
      source_record_id: recordId,
      source_field: fieldName,
    });
  }
  
  return events;
}

function generateEventId(recordId: string, fieldName: string, date: string): string {
  const hash = createHash('sha256')
    .update(`${recordId}:${fieldName}:${date}`)
    .digest('hex');
  return `evt_${hash.substring(0, 24)}`;
}
```

---

### 3.6 Deterministic Search Ranking

**Pattern:** Rule-based ranking with deterministic tiebreakers.

**Example:**
```typescript
export function rankSearchResults(results: Record[], query: string): Record[] {
  return results
    .map(record => ({
      record,
      score: calculateScore(record, query), // Deterministic scoring
    }))
    .sort((a, b) => {
      // Primary: score (higher first)
      if (a.score !== b.score) return b.score - a.score;
      
      // Tiebreaker 1: created_at (newer first)
      const timeDiff = b.record.created_at.localeCompare(a.record.created_at);
      if (timeDiff !== 0) return timeDiff;
      
      // Tiebreaker 2: ID (lexicographic)
      return a.record.id.localeCompare(b.record.id);
    })
    .map(({ record }) => record);
}

function calculateScore(record: Record, query: string): number {
  let score = 0;
  
  // Exact match in schema_type
  if (record.schema_type.toLowerCase().includes(query.toLowerCase())) {
    score += 10;
  }
  
  // Match in raw_text (count occurrences)
  const regex = new RegExp(query, 'gi');
  const matches = record.raw_text.match(regex);
  score += (matches?.length || 0);
  
  return score;
}
```

**Why this works:**
- Score calculation is deterministic
- Tiebreakers eliminate randomness
- Same query + same DB state → same order

---

## 3.5 Reducer Determinism

### 3.5.1 Reducer Requirements

**Reducers MUST be deterministic:**

- Same observations → same snapshot
- Same merge policies → same result
- Order-independent (observations sorted deterministically)

**Pattern:**

```typescript
function computeSnapshot(
  observations: Observation[],
  mergePolicies: MergePolicies
): EntitySnapshot {
  // 1. Sort observations deterministically
  const sorted = sortObservations(observations);
  
  // 2. Apply merge policies per field
  const snapshot = {};
  const provenance = {};
  
  for (const [field, policy] of Object.entries(mergePolicies)) {
    const { value, sourceId } = mergeField(field, sorted, policy);
    snapshot[field] = value;
    provenance[field] = sourceId;
  }
  
  return { snapshot, provenance };
}
```

### 3.5.2 Observation Ordering

Observations MUST be sorted deterministically before merging:

1. **Primary sort:** `observed_at DESC` (most recent first)
2. **Secondary sort:** `id ASC` (stable tie-breaker)

**Sorting Function:**

```typescript
function sortObservations(observations: Observation[]): Observation[] {
  return observations.sort((a, b) => {
    const timeDiff = b.observed_at.getTime() - a.observed_at.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}
```

### 3.5.3 ID Generation for Observations

Observation IDs MUST be deterministic:

```typescript
function generateObservationId(
  entityId: string,
  recordId: string,
  fieldHash: string
): string {
  const hash = createHash('sha256')
    .update(`${entityId}:${recordId}:${fieldHash}`)
    .digest('hex');
  return `obs_${hash.substring(0, 24)}`;
}
```

**Determinism:** Same entity + same record + same fields → same observation ID.

### 3.5.4 Testing Reducer Determinism

**Test Pattern:**

```typescript
test('reducer is deterministic', async () => {
  const observations = [obs1, obs2, obs3];
  const snapshot1 = await reducer.computeSnapshot(entityId);
  
  // Recompute with same observations
  const snapshot2 = await reducer.computeSnapshot(entityId);
  
  expect(snapshot1.snapshot).toEqual(snapshot2.snapshot);
  expect(snapshot1.provenance).toEqual(snapshot2.provenance);
});

test('reducer handles out-of-order observations', async () => {
  const observations1 = [obs1, obs2, obs3];
  const observations2 = [obs3, obs1, obs2]; // Different order
  
  const snapshot1 = await reducer.computeSnapshot(entityId, observations1);
  const snapshot2 = await reducer.computeSnapshot(entityId, observations2);
  
  // Should produce same snapshot regardless of input order
  expect(snapshot1.snapshot).toEqual(snapshot2.snapshot);
});
```

**Related Documents:**

- [`docs/subsystems/reducer.md`](../subsystems/reducer.md) — Reducer implementation patterns
- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — Observation architecture

---

## 4. Determinism and Timestamps

### 4.1 Audit Timestamps (Acceptable Nondeterminism)

**Acceptable:**
```typescript
const record = {
  id: generateRecordId(fileHash, userId), // Deterministic
  created_at: new Date().toISOString(),   // Nondeterministic, but acceptable
  raw_text: text,
};
```

**Why acceptable:**
- `created_at` is metadata for auditing, not used for ID generation or business logic
- Does not affect deterministic operations (entity resolution, event generation)
- Two uploads of same file will have different `created_at` (expected)

### 4.2 Ingestion Timestamp as Input (Deterministic)

**Pattern:** If timestamp is part of input, use it deterministically.

**Example:**
```typescript
export function ingestFile(
  file: File,
  userId: string,
  explicitTimestamp: string // Provided by caller, deterministic
): Record {
  const fileHash = hashFile(file);
  const recordId = generateRecordId(fileHash, userId, explicitTimestamp);
  
  return {
    id: recordId,
    created_at: explicitTimestamp, // Use explicit input
    raw_text: extractText(file),
    user_id: userId,
  };
}
```

---

## 5. Determinism in Tests

### 5.1 Property-Based Testing

**Pattern:** Generate test cases, verify determinism.

**Example:**
```typescript
import fc from 'fast-check';

test('entity ID generation is deterministic', () => {
  fc.assert(
    fc.property(
      fc.string(), // Random entity name
      fc.constantFrom('company', 'person', 'location'), // Random type
      (name, type) => {
        const id1 = generateEntityId(type, name);
        const id2 = generateEntityId(type, name);
        return id1 === id2; // MUST be equal
      }
    )
  );
});
```

### 5.2 Snapshot Testing

**Pattern:** Capture output, verify it doesn't change.

**Example:**
```typescript
test('extraction output matches snapshot', () => {
  const input = loadFixture('invoice.pdf');
  const extracted = extractFields(input, 'FinancialRecord');
  
  expect(extracted).toMatchSnapshot(); // Fails if output changes
});
```

### 5.3 Deterministic Test Fixtures

**Pattern:** Use fixed timestamps, hashes, IDs in fixtures.

**Example:**
```typescript
export const TEST_FIXTURES = {
  user: {
    id: 'usr_test_fixed_id',
    created_at: '2024-01-01T00:00:00Z', // Fixed timestamp
  },
  file: {
    name: 'invoice.pdf',
    hash: 'abc123...', // Fixed hash
    content: 'Invoice #123...', // Fixed content
  },
};
```

---

## 6. Determinism and External APIs

### 6.1 Non-Deterministic External Calls

**Problem:** External APIs (OpenAI, Gmail) are not deterministic.

**Mitigation Strategies:**

**Strategy 1: Cache + Replay (Testing)**
```typescript
// In tests, use cached responses
const mockOpenAI = {
  createEmbedding: jest.fn().mockResolvedValue(FIXED_EMBEDDING),
};
```

**Strategy 2: Idempotency Keys (Production)**
```typescript
// Use idempotency keys to ensure same input → same API call → same result
const embedding = await openai.createEmbedding({
  input: text,
  model: 'text-embedding-ada-002',
  idempotency_key: hashText(text), // Deterministic key
});
```

**Strategy 3: Isolate Non-Determinism (Architecture)**
- Embeddings are **bounded eventual**, not part of core truth (see `consistency.md`)
- Core extraction (entities, events) MUST NOT depend on embeddings

---

### 6.2 Gmail Attachments (Deterministic Content, Non-Deterministic Timing)

**Pattern:** Content is deterministic (same email → same attachment), but retrieval timing is not.

**Solution:**
- Treat Gmail as deterministic source (email ID + attachment ID → content)
- Ingestion timestamp is nondeterministic (acceptable, metadata only)

---

## 7. Determinism Violations and Debugging

### 7.1 Detecting Nondeterminism

**Symptom:** Flaky tests (pass sometimes, fail others).

**Diagnosis Steps:**
1. Run test 100 times: `for i in {1..100}; do npm test; done`
2. If any failures, nondeterminism likely
3. Check for:
   - Random IDs (UUIDs without seeds)
   - Unsorted iteration
   - Timestamp dependencies
   - Race conditions (concurrent execution)

**Example Debugging:**
```typescript
// Add determinism check to test
test('is deterministic', () => {
  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(performOperation(input));
  }
  
  // All results MUST be identical
  const first = JSON.stringify(results[0]);
  for (const result of results) {
    expect(JSON.stringify(result)).toBe(first);
  }
});
```

---

### 7.2 Common Nondeterminism Bugs

**Bug 1: UUID in ID generation**
```typescript
// ❌ Bug
const id = uuidv4();

// ✅ Fix
const id = generateDeterministicId(input);
```

**Bug 2: Date.now() in logic**
```typescript
// ❌ Bug
if (Date.now() % 2 === 0) { /* ... */ }

// ✅ Fix
if (explicitTimestamp % 2 === 0) { /* ... */ }
```

**Bug 3: Unsorted Map iteration**
```typescript
// ❌ Bug
for (const [key, value] of map) { }

// ✅ Fix
for (const key of Array.from(map.keys()).sort()) {
  const value = map.get(key);
}
```

---

## 8. Determinism Checklist for Code Review

Use this checklist when reviewing code:

- [ ] No `Math.random()`, `crypto.randomBytes()` without fixed seed
- [ ] No `Date.now()` or `new Date()` in business logic (metadata only)
- [ ] No UUIDs (`uuidv4()`) without deterministic generation
- [ ] All iteration over Maps/Sets/Objects is sorted
- [ ] All filesystem reads are sorted
- [ ] All IDs are hash-based (not random)
- [ ] All sorting has deterministic tiebreakers
- [ ] No LLM extraction in MVP (rule-based only)
- [ ] Tests are reproducible (run 100 times, all pass)
- [ ] External API calls are isolated from core truth

---

## 9. Determinism and Performance

### 9.1 Determinism Cost

**Sorting overhead:**
- Sorting adds O(n log n) cost
- Acceptable for most operations (n < 10,000)

**Hashing overhead:**
- SHA-256 is fast (~1 microsecond per hash)
- Negligible for ID generation

**Sequential processing:**
- May need to process files sequentially (not concurrently) for determinism
- Use batching if performance critical

### 9.2 Optimization Strategies

**Strategy 1: Cache deterministic results**
```typescript
const cache = new Map<string, string>();

function getCachedEntityId(type: string, name: string): string {
  const key = `${type}:${name}`;
  if (!cache.has(key)) {
    cache.set(key, generateEntityId(type, name));
  }
  return cache.get(key)!;
}
```

**Strategy 2: Batch deterministic operations**
```typescript
// Process 100 files at a time (deterministic order within batch)
for (const batch of chunk(files.sort(), 100)) {
  await Promise.all(batch.map(f => processFile(f)));
}
```

---

## 10. Determinism Invariants (MUST/MUST NOT)

### MUST

1. **ID generation MUST be deterministic** (hash-based)
2. **Entity resolution MUST be deterministic** (same name → same ID)
3. **Event generation MUST be deterministic** (same fields → same events)
4. **Search ranking MUST be deterministic** (tiebreakers required)
5. **Sorting MUST use deterministic tiebreakers** (never rely on insertion order)
6. **Tests MUST be reproducible** (run 100 times, all pass)
7. **Iteration MUST be sorted** (Maps, Sets, filesystem)
8. **Extraction MUST be rule-based** (no LLM in MVP)
9. **Deduplication MUST use content hash** (not timing)
10. **All nondeterminism MUST be documented** (e.g., audit timestamps)

### MUST NOT

1. **MUST NOT use random IDs** (UUIDs without seeds)
2. **MUST NOT use Date.now() in business logic** (metadata only)
3. **MUST NOT iterate unsorted** (Maps, Sets, Objects)
4. **MUST NOT rely on filesystem order** (always sort)
5. **MUST NOT use LLM extraction** (MVP constraint)
6. **MUST NOT use nondeterministic ranking** (no random sorting)
7. **MUST NOT introduce race conditions** (concurrent writes to shared state)
8. **MUST NOT skip tiebreakers** (all sorting must have secondary sort)
9. **MUST NOT allow flaky tests** (fix or remove)
10. **MUST NOT hide nondeterminism** (document if unavoidable)

---

## Agent Instructions

### When to Load This Document
Load `docs/architecture/determinism.md` when:
- Implementing any extraction, entity resolution, or event generation logic
- Writing ID generation or hashing functions
- Implementing sorting or ranking algorithms
- Writing tests that must be reproducible
- Reviewing code for nondeterminism bugs
- Debugging flaky tests
- Adding any operation that processes collections

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (determinism as core principle)
- `docs/architecture/architecture.md` (layer boundaries)
- `docs/architecture/consistency.md` (eventual vs strong consistency)
- `docs/subsystems/schema.md` (schema-based extraction)
- `docs/testing/testing_standard.md` (deterministic test patterns)

### Constraints Agents Must Enforce
1. **All IDs MUST be hash-based** (no UUIDs without seeds)
2. **All iteration MUST be sorted** (Maps, Sets, filesystem)
3. **All sorting MUST have deterministic tiebreakers**
4. **No Math.random() or Date.now() in business logic**
5. **Entity resolution MUST normalize then hash**
6. **Event generation MUST be deterministic per schema**
7. **Search ranking MUST use rule-based scoring + tiebreakers**
8. **Tests MUST be reproducible** (no flaky tests)
9. **External API calls MUST be isolated** from core truth
10. **All nondeterminism MUST be documented**

### Forbidden Patterns
- Random UUID generation for IDs
- Date.now() in business logic
- Unsorted iteration over collections
- LLM-based extraction (MVP)
- Nondeterministic ranking or sorting
- Flaky tests left unfixed
- Race conditions in concurrent code
- Undocumented nondeterminism

### Validation Checklist
- [ ] All IDs are hash-based (not random)
- [ ] All collections are sorted before iteration
- [ ] All sorting has deterministic tiebreakers
- [ ] No Date.now() or Math.random() in business logic
- [ ] Entity resolution normalizes before hashing
- [ ] Event generation is schema-driven
- [ ] Search ranking is rule-based with tiebreakers
- [ ] Tests pass 100 times in a row (no flakes)
- [ ] External API nondeterminism is isolated
- [ ] Code review checklist completed (Section 8)

