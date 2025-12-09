# Release v2.0.0 Execution Schedule

_(Feature Unit Execution Plan with Batches, Dependencies, and Timeline)_

---

## Purpose

This document details the execution order of Feature Units for v2.0.0, organized into batches with dependencies, parallelization opportunities, and timeline estimates.

---

## Execution Overview

**Total Feature Units:** 13 (11 required + 2 optional)

**Estimated Duration:** 20 weeks (5 months)

**Critical Path:** FU-850 → FU-852 → FU-853 → FU-855 → FU-856 → FU-857 → FU-858 → FU-859

---

## Batch Overview

| Batch | Feature Units | Dependencies | Estimated Duration | Risk Level |
|-------|---------------|--------------|-------------------|------------|
| 0 | FU-850 | - | 2 weeks | High |
| 1 | FU-851 | FU-850 | 1 week | Medium |
| 2 | FU-852 | FU-850 | 3 weeks | High |
| 3 | FU-853, FU-854 | FU-852 | 2 weeks | Medium |
| 4 | FU-855 | FU-850, FU-853 | 2 weeks | High |
| 5 | FU-856 | FU-855 | 1 week | Medium |
| 6 | FU-857 | FU-850, FU-856 | 1 week | Medium |
| 7 | FU-858, FU-860 | FU-856, FU-857 | 2 weeks | Medium |
| 8 | FU-859 | FU-852, FU-858 | 3 weeks | High |
| 9 | FU-861, FU-862 | FU-853, FU-856 | 3 weeks | Medium (Optional) |

---

## Detailed Batch Execution

### Batch 0: Crypto Foundation (Weeks 1-2)

**Feature Units:**
- **FU-850**: Crypto Library

**Dependencies:** None

**Deliverables:**
- `src/crypto/keys.ts` — X25519/Ed25519 key generation
- `src/crypto/envelope.ts` — AES-GCM envelope encryption (enhance existing)
- `src/crypto/signature.ts` — Ed25519 sign/verify helpers
- `src/crypto/auth.ts` — Request signing utilities
- `src/crypto/export.ts` — Safe key export/import
- Unit tests (100% coverage)

**Acceptance Criteria:**
- ✅ Key generation works in browser + Node
- ✅ Envelope encryption/decryption round-trip passes
- ✅ Signature verification passes
- ✅ Security audit passed

**Risk:** High (security-critical)

**Parallelization:** None (foundational)

---

### Batch 1: Key Management UI (Week 3)

**Feature Units:**
- **FU-851**: Key Management UI

**Dependencies:** FU-850

**Deliverables:**
- Settings panel UI (key generation, export/import)
- Masked private key display
- Copy/export functionality
- Import workflow (user pastes private key)
- Key regeneration flow

**Acceptance Criteria:**
- ✅ Users can generate keys via UI
- ✅ Users can export private key (masked display)
- ✅ Users can import existing key
- ✅ Key management works offline

**Risk:** Medium

**Parallelization:** Can start after FU-850 crypto library complete

---

### Batch 2: Browser SQLite WASM Datastore (Weeks 4-6)

**Feature Units:**
- **FU-852**: Browser SQLite WASM Datastore

**Dependencies:** FU-850

**Deliverables:**
- SQLite WASM integration (`@sqlite.org/sqlite-wasm`)
- OPFS VFS for persistent storage
- Encrypted-at-rest storage (`encryption.ts`)
- Schema definition (`schema.ts`)
- CRUD helpers (`records.ts`, `vectors.ts`)
- WebWorker integration (foundation)

**Acceptance Criteria:**
- ✅ SQLite WASM functional in browser
- ✅ OPFS persistence works across sessions
- ✅ Records encrypted before writing to OPFS
- ✅ CRUD operations functional
- ✅ Performance: <100ms P95 for local operations

**Risk:** High (foundational, performance-critical)

**Parallelization:** Can start after FU-850 crypto library complete

---

### Batch 3: WebWorker RPC & Vector Search (Weeks 7-8)

**Feature Units:**
- **FU-853**: WebWorker RPC Layer
- **FU-854**: Local Vector Search

**Dependencies:** FU-852

**Deliverables:**
- `frontend/src/worker/db.worker.ts` — WebWorker bootstrap
- `frontend/src/worker/rpc.ts` — Structured message passing
- `frontend/src/worker/types.ts` — Message schemas
- HNSWlib-WASM or SQLite-vss integration
- Unified search API (semantic + keyword)
- Worker tests (vitest + fake worker)

**Acceptance Criteria:**
- ✅ WebWorker RPC functional
- ✅ Vector search works on encrypted datastore
- ✅ Search performance: <500ms P95
- ✅ Worker isolation verified

**Risk:** Medium

**Parallelization:** FU-853 and FU-854 can run in parallel (both depend on FU-852)

---

### Batch 4: Encrypted WebSocket Bridge (Weeks 9-10)

**Feature Units:**
- **FU-855**: Encrypted WebSocket Bridge

**Dependencies:** FU-850, FU-853

**Deliverables:**
- `frontend/src/bridge/websocket.ts` — Encrypt outbound, route inbound ciphertext
- `frontend/src/bridge/mcp.ts` — Tool invocation over encrypted bridge
- `src/mcp_ws_bridge.ts` — Server-side relay (encrypted bytes only)
- Reconnect/heartbeat handling
- Error handling

**Acceptance Criteria:**
- ✅ Browser encrypts before sending
- ✅ Server relays ciphertext (never decrypts)
- ✅ Browser decrypts after receiving
- ✅ Reconnect/heartbeat works
- ✅ Performance: <200ms encryption overhead P95

**Risk:** High (critical path, security-critical)

**Parallelization:** Must wait for FU-850 and FU-853

---

### Batch 5: MCP Server Encryption Support (Week 11)

**Feature Units:**
- **FU-856**: MCP Server Encryption Support

**Dependencies:** FU-855

**Deliverables:**
- Update `src/server.ts` — Accept encrypted payloads
- Update `src/actions.ts` — Process ciphertext (never decrypt)
- Update `src/config.ts` — Encryption configuration
- Update `openapi.yaml` — Document envelope payloads
- Signature verification

**Acceptance Criteria:**
- ✅ Server accepts encrypted payloads
- ✅ Server encrypts responses
- ✅ Server never decrypts user data
- ✅ Signature verification works

**Risk:** Medium

**Parallelization:** Must wait for FU-855

---

### Batch 6: Public Key Authentication (Week 12)

**Feature Units:**
- **FU-857**: Public Key Authentication

**Dependencies:** FU-850, FU-856

**Deliverables:**
- Public key registry (bearer token = Ed25519 public key)
- Replace `ACTIONS_BEARER_TOKEN` with public key auth
- Request signing utilities
- Public key validation

**Acceptance Criteria:**
- ✅ Bearer token = public key
- ✅ Request signing works
- ✅ Public key validation works
- ✅ Backward compatibility (plaintext mode)

**Risk:** Medium

**Parallelization:** Must wait for FU-850 and FU-856

---

### Batch 7: Dual-Mode & Compatibility (Weeks 13-14)

**Feature Units:**
- **FU-858**: Dual-Mode Operation
- **FU-860**: Backward Compatibility Layer

**Dependencies:** FU-856, FU-857

**Deliverables:**
- Feature flag: `ENCRYPTION_ENABLED`
- Dual-mode support (plaintext + encrypted)
- Backward compatibility layer
- Graceful degradation

**Acceptance Criteria:**
- ✅ Feature flag works
- ✅ Both modes functional
- ✅ Backward compatibility maintained
- ✅ Graceful degradation works

**Risk:** Medium

**Parallelization:** FU-858 and FU-860 can run in parallel (both depend on FU-856, FU-857)

---

### Batch 8: Migration Tooling (Weeks 15-17)

**Feature Units:**
- **FU-859**: Migration Tooling

**Dependencies:** FU-852, FU-858

**Deliverables:**
- `src/migration/migrate-to-e2ee.ts` — Migration tool
- Download records from Supabase (paginated)
- Encrypt records locally
- Verify integrity (checksums)
- Migration wizard UI
- Rollback tool (`migrate-from-e2ee.ts`)

**Acceptance Criteria:**
- ✅ Migration tool functional
- ✅ Zero data loss during migration
- ✅ Integrity verification passes
- ✅ Migration time < 5 minutes (P95)
- ✅ Rollback tool works

**Risk:** High (data loss risk)

**Parallelization:** Must wait for FU-852 and FU-858

---

### Batch 9: Multi-Device Sync (Weeks 18-20, Optional)

**Feature Units:**
- **FU-861**: Encrypted Delta Sync
- **FU-862**: Local MCP Server Daemon

**Dependencies:** FU-853, FU-856

**Deliverables:**
- `frontend/src/sync/deltas.ts` — Encrypted delta generator
- `frontend/src/sync/merge.ts` — Conflict-free merge
- `src/mcp_local/` — Local MCP server daemon
- Electron app (optional)
- Encrypted mailbox

**Acceptance Criteria:**
- ✅ Delta sync works
- ✅ Conflict-free merge works
- ✅ Local MCP server functional
- ✅ Offline routing works

**Risk:** Medium

**Parallelization:** FU-861 and FU-862 can run in parallel (both depend on FU-853, FU-856)

**Note:** This batch is optional. Core E2EE value delivered without sync.

---

## Critical Path

**Longest Path Through Dependencies:**
FU-850 → FU-852 → FU-853 → FU-855 → FU-856 → FU-857 → FU-858 → FU-859

**Critical Path Duration:** 17 weeks (excluding optional Batch 9)

---

## Parallelization Opportunities

**Can Run in Parallel:**
- Batch 1 (FU-851) and Batch 2 (FU-852) — Both depend on FU-850
- Batch 3 (FU-853, FU-854) — Both depend on FU-852
- Batch 7 (FU-858, FU-860) — Both depend on FU-856, FU-857
- Batch 9 (FU-861, FU-862) — Both depend on FU-853, FU-856

**Must Run Sequentially:**
- FU-850 → FU-851 → FU-852 → FU-853 → FU-855 → FU-856 → FU-857 → FU-858 → FU-859

---

## Timeline Summary

| Phase | Batches | Duration | Cumulative |
|-------|---------|----------|------------|
| Phase 1: Crypto Foundation | 0-1 | 3 weeks | 3 weeks |
| Phase 2: Local-First Datastore | 2-3 | 5 weeks | 8 weeks |
| Phase 3: Encrypted MCP Bridge | 4-6 | 3 weeks | 11 weeks |
| Phase 4: Migration & Compatibility | 7-8 | 5 weeks | 16 weeks |
| Phase 5: Multi-Device Sync (Optional) | 9 | 3 weeks | 19 weeks |
| Testing & Security Audit | - | 1 week | 20 weeks |

**Total Duration:** 20 weeks (5 months)

---

## Risk Mitigation

### High-Risk Batches
- **Batch 0 (FU-850)**: Security audit required
- **Batch 2 (FU-852)**: Performance benchmarks required
- **Batch 4 (FU-855)**: Security verification required
- **Batch 8 (FU-859)**: Extensive testing required

### Mitigation Strategies
- Security audit after Batch 0
- Performance benchmarks after Batch 2
- Integration tests after each batch
- Rollback procedures documented

---

## Checkpoints

### Checkpoint 1: After Batch 2 (Crypto + Datastore)
- **Review Items:**
  - Crypto library security audit
  - Datastore performance benchmarks
  - Key management UI usability

### Checkpoint 2: After Batch 6 (Encrypted Bridge Complete)
- **Review Items:**
  - End-to-end encryption verification
  - MCP server ciphertext-only verification
  - Performance impact assessment

### Checkpoint 3: After Batch 8 (Migration Tooling)
- **Review Items:**
  - Migration tool testing
  - Data integrity verification
  - Rollback procedures

---

## Success Criteria

**Execution is Successful When:**
1. ✅ All batches complete on schedule
2. ✅ All acceptance criteria met
3. ✅ Security audit passed
4. ✅ Performance benchmarks met
5. ✅ Integration tests passing
6. ✅ Migration tool tested and verified

