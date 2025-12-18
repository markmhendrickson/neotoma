# Feature Unit Error Protocol
*(Error Classification and Remediation)*

---

## Purpose

Defines how to classify, handle, and remediate Feature Unit errors.

---

## Error Classes

### Class 1: Specification Errors
**When:** Spec incomplete or incorrect before implementation.

**Examples:**
- Missing required sections in spec
- Contradicts foundational docs
- Invariants not documented

**Remediation:**
1. Update spec
2. Re-review
3. Proceed with implementation

---

### Class 2: Implementation Errors
**When:** Code doesn't match spec or violates invariants.

**Examples:**
- Nondeterministic extraction
- Missing error handling
- RLS policy not applied
- Tests incomplete

**Remediation:**
1. Fix code to match spec
2. Add/fix tests
3. Re-review
4. Regression test

---

### Class 3: Production Errors
**When:** Feature deployed but causes issues in production.

**Examples:**
- Performance degradation
- Error rate spike
- Data corruption

**Remediation:**
1. Rollback immediately
2. Root cause analysis
3. Fix + add regression tests
4. Re-deploy with enhanced monitoring

---

## Regression Test Requirements

After any Class 2 or Class 3 error:

**MUST add regression test that:**
1. Reproduces the bug
2. Verifies the fix
3. Runs in CI forever

**Example:**
```typescript
test('regression: entity ID generation must be deterministic', () => {
  // Bug: entity IDs were random UUIDs
  const id1 = generateEntityId('company', 'Acme Corp');
  const id2 = generateEntityId('company', 'Acme Corp');
  
  // Fix: now hash-based
  expect(id1).toBe(id2);
});
```

---

## Agent Instructions

Load when debugging Feature Unit errors or classifying failures.

Required co-loaded: `docs/feature_units/standards/execution_instructions.md`, `docs/subsystems/errors.md`

Constraints:
- MUST classify all errors as Class 1/2/3
- MUST add regression tests for Class 2/3
- MUST document root cause



















