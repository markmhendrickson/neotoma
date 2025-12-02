# Neotoma Non-Functional Requirements

_(Performance, Reliability, Security, Quality)_

---

## Purpose

Consolidates non-functional requirements from architecture and subsystem documentation.

---

## 1. Performance

| Operation           | P95 Latency | Throughput    |
| ------------------- | ----------- | ------------- |
| File upload (<10MB) | <5s         | 10/sec/user   |
| Search query        | <500ms      | 100/sec total |
| Record fetch        | <100ms      | N/A           |
| Entity resolution   | <500ms      | N/A           |

See [`docs/architecture/architecture.md`](../architecture/architecture.md) section 6

---

## 2. Determinism

**MUST:**

- Same file → same record_id (content-hash)
- Same entity name → same entity_id (hash-based)
- Same query + DB state → same order
- All tests reproducible (100 runs → 100 same results)

See [`docs/architecture/determinism.md`](../architecture/determinism.md)

---

## 3. Consistency

**Strong:** Core records, entities, events, graph edges
**Bounded Eventual:** Search index (5s), embeddings (10s)

See [`docs/architecture/consistency.md`](../architecture/consistency.md)

---

## 4. Privacy

**MUST NOT:**

- Log PII from properties
- Log auth tokens
- Auto-translate documents

See [`docs/subsystems/privacy.md`](../subsystems/privacy.md)

---

## 5. Security

**MUST:**

- Authenticate all requests (JWT)
- Apply RLS policies
- Encrypt data at rest
- Use HTTPS/WSS

See [`docs/subsystems/auth.md`](../subsystems/auth.md)

---

## 6. Accessibility

**MUST:**

- Support keyboard navigation
- Provide ARIA labels
- Meet WCAG AA contrast (4.5:1)

See [`docs/subsystems/accessibility.md`](../subsystems/accessibility.md)

---

## 7. Internationalization

**MUST:**

- Preserve content language
- Localize UI text
- Format dates/numbers per locale

See [`docs/subsystems/i18n.md`](../subsystems/i18n.md)

---

## 8. Test Coverage

**Targets:**

- Domain logic: >85% lines, >85% branches
- Critical paths: 100%

See [`docs/testing/testing_standard.md`](../testing/testing_standard.md)

---

## Detailed Documentation References

- [`docs/architecture/architecture.md`](../architecture/architecture.md)
- [`docs/architecture/determinism.md`](../architecture/determinism.md)
- [`docs/architecture/consistency.md`](../architecture/consistency.md)
- [`docs/subsystems/privacy.md`](../subsystems/privacy.md)
- [`docs/subsystems/auth.md`](../subsystems/auth.md)
- [`docs/subsystems/accessibility.md`](../subsystems/accessibility.md)
- [`docs/subsystems/i18n.md`](../subsystems/i18n.md)
- [`docs/testing/testing_standard.md`](../testing/testing_standard.md)

---

## Agent Instructions

### When to Load This Document

Load `docs/specs/NONFUNCTIONAL_REQUIREMENTS.md` when:

- Planning performance targets for Feature Units
- Understanding quality and reliability requirements
- Quick reference for non-functional constraints

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/architecture/determinism.md` (determinism requirements)
- `docs/architecture/consistency.md` (consistency models)
- `docs/subsystems/privacy.md` (PII handling)
- `docs/subsystems/auth.md` (security requirements)
- `docs/subsystems/accessibility.md` (A11y requirements)

### Constraints Agents Must Enforce

1. **Determinism:** Same input → same output, always (section 2)
2. **Performance targets:** P95 latencies must be met (section 1)
3. **Privacy:** No PII in logs, only record IDs (section 4)
4. **Strong consistency:** Core operations immediate (section 3)
5. **Accessibility:** WCAG AA compliance (section 6)
6. **Security:** JWT validation, RLS policies, encryption (section 5)
7. **Defer to detailed docs:** This is a summary; architecture and subsystem docs are authoritative

### Forbidden Patterns

- Introducing nondeterministic logic
- Logging PII from properties
- Missing or violating performance targets
- Violating consistency models per subsystem
- Skipping accessibility requirements (keyboard nav, ARIA, contrast)
- Bypassing security requirements (auth, RLS, encryption)

### Validation Checklist

- [ ] Performance targets met for operation type
- [ ] Determinism verified (100 runs → identical results)
- [ ] Privacy preserved (no PII in logs)
- [ ] Consistency model correct per subsystem
- [ ] Accessibility requirements met (keyboard nav, ARIA, WCAG AA)
- [ ] Security requirements met (JWT, RLS, encryption)
- [ ] Test coverage targets met per layer
- [ ] Cross-checked against detailed architecture and subsystem docs
