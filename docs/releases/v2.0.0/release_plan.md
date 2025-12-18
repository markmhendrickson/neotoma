## Release v2.0.0 — End-to-End Encryption (E2EE)

_(Local-First Architecture with End-to-End Encryption Release Plan)_

---

### Purpose

This document provides the overview and coordination framework for v2.0.0, which introduces end-to-end encryption and a local-first architecture. Detailed specifications are decomposed into separate topic-specific documents:

**Release Classification:**

- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Marketed (major version with marketing activities)

- `execution_schedule.md` — FU execution plan with batches and dependencies
- `manifest.yaml` — FU list, dependencies, schedule, release type
- `integration_tests.md` — Cross-FU integration test specifications
- `migration_plan.md` — Migration strategy from v1.0.0 (plaintext) to v2.0.0 (E2EE)
- `status.md` — Live status tracking and decision log

---

### 1. Release Overview

- **Release ID**: `v2.0.0`
- **Name**: End-to-End Encryption (E2EE)
- **Release Type**: Marketed (major version, breaking changes)
- **Goal**: Transform Neotoma into a local-first, end-to-end encrypted Truth Layer where app creators cannot access user data. Browser becomes authoritative datastore; server stores only encrypted ciphertext.
- **Priority**: P1 (high-value enhancement, not blocking MVP)
- **Target Ship Date**: TBD (post-MVP, after v1.0.0 validation)
- **Discovery Required**: Yes (user demand validation, privacy requirements)
- **Marketing Required**: Yes (privacy-first positioning, competitive differentiator)
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **E2EE Architecture Plan**: `.cursor/plans/local-first-e2ee-architecture-99397386.plan.md`
- **MVP Feature Units**: `docs/specs/MVP_FEATURE_UNITS.md` (for context)
- **Privacy Requirements**: `docs/subsystems/privacy.md`

This release plan coordinates the E2EE architecture plan into concrete Feature Units and execution schedule.

---

### 2. Scope

#### 2.1 Included Feature Units (P0 Critical Path)

**Phase 1: Crypto Foundation**

- `FU-850`: Crypto Library (X25519/Ed25519 key generation, envelope encryption, signatures)
- `FU-851`: Key Management UI (key generation, export/import, masked display)

**Phase 2: Local-First Datastore**

- `FU-852`: Browser SQLite WASM Datastore (OPFS VFS, encrypted-at-rest)
- `FU-853`: WebWorker RPC Layer (isolated datastore operations)
- `FU-854`: Local Vector Search (HNSWlib-WASM or SQLite-vss integration)

**Phase 3: Encrypted MCP Bridge**

- `FU-855`: Encrypted WebSocket Bridge (browser encrypts, server relays ciphertext)
- `FU-856`: MCP Server Encryption Support (accept encrypted payloads, encrypt responses)
- `FU-857`: Public Key Authentication (bearer token = Ed25519 public key)

**Phase 4: Migration & Compatibility**

- `FU-858`: Dual-Mode Operation (feature flag: plaintext + encrypted)
- `FU-859`: Migration Tooling (one-time sync from Supabase to local SQLite)
- `FU-860`: Backward Compatibility Layer (support existing plaintext MCP clients)

**Phase 5: Multi-Device Sync (Optional)**

- `FU-861`: Encrypted Delta Sync (conflict-free merge, append-only encrypted deltas)
- `FU-862`: Local MCP Server Daemon (optional Electron app for offline routing)

#### 2.2 Explicitly Excluded

- LLM extraction (remains post-MVP)
- Semantic search (remains post-MVP)
- Breaking changes to core extraction logic (determinism preserved)
- Changes to schema detection or field extraction (E2EE is transport/storage layer)

---

### 3. Release-Level Acceptance Criteria

**Product:**

- ✅ Users can generate/export/import encryption keys via UI
- ✅ All records encrypted before leaving browser
- ✅ MCP servers see only ciphertext (verified via server logs)
- ✅ ChatGPT integration works with exported private key
- ✅ Migration tool successfully migrates existing records
- ✅ Dual-mode operation allows gradual migration

**Technical:**

- ✅ 100% of records encrypted before transmission
- ✅ Zero plaintext records in server database (post-migration)
- ✅ Crypto library passes security audit (key generation, envelope encryption)
- ✅ Local datastore functional offline
- ✅ Vector search works on encrypted local datastore
- ✅ WebWorker RPC layer isolates crypto operations
- ✅ 100% test coverage on crypto critical paths

**Business:**

- ✅ Privacy-first positioning validated (user interviews)
- ✅ Migration completion rate ≥ 80% (users successfully migrate)
- ✅ Zero data loss during migration
- ✅ E2EE adoption rate ≥ 60% (users opt into encryption)

---

### 4. Cross-FU Integration Scenarios

**See `integration_tests.md` for complete integration test specifications.**

**Summary of Integration Scenarios:**

1. **Key Generation & Export Flow**

   - User generates keys → exports private key → imports into ChatGPT → verifies decryption

2. **Encrypted Upload Flow**

   - User uploads file → browser encrypts → sends to server → server stores ciphertext → user retrieves → browser decrypts

3. **MCP Encrypted Query Flow**

   - ChatGPT calls MCP with encrypted payload → server processes ciphertext → returns encrypted response → ChatGPT decrypts locally

4. **Migration Flow**

   - Existing user opts into E2EE → migration tool syncs Supabase records → encrypts locally → verifies integrity → disables plaintext mode

5. **Offline Operation Flow**
   - User works offline → local datastore handles CRUD → syncs encrypted deltas when online

All scenarios must pass end-to-end before v2.0.0 is approved for deployment.

---

### 5. Migration Strategy

**See `migration_plan.md` for complete migration strategy.**

**Summary:**

**Phase 1: Dual-Mode (Weeks 1-4)**

- Deploy v2.0.0 with feature flag: `ENCRYPTION_ENABLED=false` (default)
- New users can opt into E2EE
- Existing users continue using plaintext mode
- Monitor adoption and migration tool usage

**Phase 2: Opt-In Migration (Weeks 5-8)**

- Enable migration tool for all users
- Provide in-app migration wizard
- Support both modes simultaneously
- Monitor migration success rate

**Phase 3: Default E2EE (Weeks 9-12)**

- New users default to E2EE (`ENCRYPTION_ENABLED=true` by default)
- Existing users prompted to migrate
- Plaintext mode deprecated (still supported for backward compatibility)

**Phase 4: E2EE-Only (Future)**

- Remove plaintext mode (breaking change, requires v3.0.0)
- All records encrypted
- Server cannot decrypt user data

**Rollback Plan:**

- Feature flag allows instant rollback to plaintext mode
- Migration tool supports reverse migration (encrypted → plaintext) for testing
- Server maintains dual-mode support for 6 months post-launch

---

### 6. Pre-Mortem: Failure Mode Analysis

**Identified Failure Modes:**

1. **Crypto Implementation Bugs** (Probability: Medium, Impact: Critical)

   - **Early Warning**: Unit test failures, security audit findings
   - **Mitigation**: Security audit before launch, extensive crypto unit tests
   - **Rollback**: Feature flag disables encryption

2. **Migration Data Loss** (Probability: Low, Impact: Critical)

   - **Early Warning**: Migration tool errors, user reports
   - **Mitigation**: Dry-run migration, verification checksums, backup before migration
   - **Rollback**: Reverse migration tool, restore from backup

3. **Performance Degradation** (Probability: Medium, Impact: High)

   - **Early Warning**: Latency metrics, user complaints
   - **Mitigation**: Performance benchmarks, WebWorker isolation, async encryption
   - **Rollback**: Feature flag, performance optimization sprint

4. **User Adoption Resistance** (Probability: Medium, Impact: Medium)

   - **Early Warning**: Low migration rate, support tickets
   - **Mitigation**: Clear migration wizard, educational content, opt-in by default
   - **Rollback**: Keep dual-mode indefinitely

5. **ChatGPT Integration Complexity** (Probability: High, Impact: Medium)
   - **Early Warning**: Support tickets, low ChatGPT usage
   - **Mitigation**: Clear documentation, video tutorials, ChatGPT extension support
   - **Rollback**: Maintain plaintext mode for ChatGPT compatibility

---

### 7. Success Criteria

**v2.0.0 is Complete When:**

1. ✅ All Phase 1-4 Feature Units deployed (Phase 5 optional)
2. ✅ Encryption works end-to-end (browser → server → browser)
3. ✅ Migration tool functional and tested
4. ✅ Dual-mode operation stable
5. ✅ Security audit passed
6. ✅ Performance benchmarks met (encryption adds <200ms P95 latency)
7. ✅ ChatGPT integration documented and tested
8. ✅ Migration completion rate ≥ 80%

---

### 8. Dependencies

**Required Pre-Release:**

- v1.0.0 (MVP) must be deployed and stable
- User demand validation (discovery confirms E2EE is blocker for some users)
- Security audit scheduled

**External Dependencies:**

- `@noble/curves` (Ed25519/X25519)
- `@noble/hashes`
- `@sqlite.org/sqlite-wasm` or `sql.js`
- `hnswlib-wasm` or `sqlite-vss` (for vector search)
- Electron (optional, for local MCP server)

---

### 9. Risk Assessment

**High-Risk Areas:**

- Crypto implementation (security-critical)
- Migration tooling (data loss risk)
- Performance (encryption overhead)

**Mitigation:**

- Security audit before launch
- Extensive testing (unit, integration, E2E)
- Performance benchmarking
- Gradual rollout (dual-mode, opt-in migration)

---

### 10. Post-Release Monitoring

**Key Metrics:**

- E2EE adoption rate (% of users migrated)
- Migration success rate (% successful migrations)
- Performance impact (latency delta vs v1.0.0)
- Support ticket volume (migration issues)
- ChatGPT integration usage (users using encrypted mode)

**Alerts:**

- Migration failure rate > 5%
- Performance degradation > 200ms P95
- Crypto errors > 0.1% of operations
- Data loss reports (immediate escalation)

---

### 11. Related Documentation

**For Implementation:**

- `.cursor/plans/local-first-e2ee-architecture-99397386.plan.md` — Detailed architecture plan
- `docs/subsystems/privacy.md` — Privacy requirements
- `docs/specs/MVP_FEATURE_UNITS.md` — Context on existing FUs

**For Users:**

- Migration guide (to be created)
- ChatGPT integration guide (to be created)
- Key management best practices (to be created)

---

### 12. Release Timeline (Tentative)

**Assumption:** All timeline estimates assume Cursor agent execution (not human developers).

**Phase 1: Crypto Foundation** (Weeks 1-2)

- FU-850, FU-851

**Phase 2: Local-First Datastore** (Weeks 3-5)

- FU-852, FU-853, FU-854

**Phase 3: Encrypted MCP Bridge** (Weeks 6-8)

- FU-855, FU-856, FU-857

**Phase 4: Migration & Compatibility** (Weeks 9-11)

- FU-858, FU-859, FU-860

**Phase 5: Multi-Device Sync** (Weeks 12-14, Optional)

- FU-861, FU-862

**Testing & Security Audit** (Weeks 15-16)

- Integration tests
- Security audit
- Performance benchmarking

**Staging Deployment** (Week 17)

- Dual-mode deployment
- Migration tool testing

**Production Rollout** (Weeks 18-20)

- Gradual rollout
- Migration support
- Monitoring

**Total Estimated Duration:** 20 weeks (5 months, assumes Cursor agent execution)

---

### 13. Decision Log

**Key Decisions:**

1. **2024-XX-XX**: E2EE scheduled for v2.0.0 (post-MVP)

   - **Rationale**: MVP focuses on core value; E2EE adds complexity without validating core proposition
   - **Status**: Approved

2. **2024-XX-XX**: Dual-mode operation for migration

   - **Rationale**: Allows gradual migration, reduces risk
   - **Status**: Approved

3. **2024-XX-XX**: Local-first architecture (browser authoritative)

   - **Rationale**: Enables offline operation, reduces server trust requirements
   - **Status**: Approved

4. **2024-XX-XX**: Multi-device sync optional (Phase 5)
   - **Rationale**: Core E2EE value delivered without sync complexity
   - **Status**: Approved

---

### 14. Next Steps

1. Validate user demand (discovery interviews)
2. Schedule security audit
3. Create detailed Feature Unit specs (FU-850 through FU-862)
4. Create execution schedule with batches
5. Create migration plan document
6. Create integration test specifications
7. Set target ship date based on v1.0.0 completion
