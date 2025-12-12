# Release v2.0.0 Integration Tests

_(Cross-Feature Unit Integration Test Specifications)_

---

## Purpose

This document defines integration tests that span multiple Feature Units for v2.0.0, ensuring end-to-end functionality of the E2EE architecture.

---

## Test Categories

1. **Crypto Integration Tests** — Key generation, encryption, decryption
2. **Local Datastore Integration Tests** — CRUD operations, encryption-at-rest
3. **MCP Bridge Integration Tests** — Encrypted WebSocket, server relay
4. **Migration Integration Tests** — Supabase → local SQLite migration
5. **End-to-End Workflow Tests** — Complete user workflows with E2EE

---

## IT-001: Key Generation and Export Flow

**Goal:** Verify that users can generate encryption keys and export them for ChatGPT integration.

**Preconditions:**
- System running with FU-850, FU-851 deployed
- Browser environment (Playwright)

**Steps:**
1. User opens settings panel
2. User clicks "Generate Encryption Keys"
3. System generates X25519 + Ed25519 keypairs
4. System displays masked private key
5. User clicks "Export Private Key"
6. System exports private key (JSON format)
7. User copies private key
8. User imports private key into ChatGPT client (mock)
9. ChatGPT client decrypts test message using imported key

**Expected Results:**
- ✅ Keys generated successfully
- ✅ Private key masked in UI (e.g., `****...****`)
- ✅ Exported private key is valid JSON
- ✅ Imported key works for decryption
- ✅ Keys persist across browser sessions

**Machine-Checkable:**
- Assert key generation succeeds
- Assert private key format is valid
- Assert decryption works with exported key
- Assert keys stored securely (IndexedDB)

---

## IT-002: Encrypted Record Upload Flow

**Goal:** Verify that records are encrypted before leaving the browser and can be decrypted after retrieval.

**Preconditions:**
- System running with FU-850, FU-852, FU-855, FU-856 deployed
- Browser environment (Playwright)
- MCP server running (encrypted mode)

**Steps:**
1. User generates encryption keys (if not exists)
2. User uploads file via UI
3. Browser encrypts record using envelope encryption
4. Browser sends encrypted payload to MCP server
5. MCP server stores ciphertext (never decrypts)
6. User retrieves record via MCP
7. MCP server returns encrypted payload
8. Browser decrypts record locally
9. User views decrypted record

**Expected Results:**
- ✅ Record encrypted before transmission
- ✅ Server receives only ciphertext
- ✅ Server never decrypts (verified via logs)
- ✅ Record decrypted successfully after retrieval
- ✅ Decrypted record matches original

**Machine-Checkable:**
- Assert encryption before transmission (network capture)
- Assert server logs show ciphertext only
- Assert decryption succeeds
- Assert decrypted content matches original
- Assert encryption overhead < 200ms P95

---

## IT-003: Local Datastore CRUD Operations

**Goal:** Verify that local SQLite datastore handles CRUD operations with encryption-at-rest.

**Preconditions:**
- System running with FU-850, FU-852, FU-853 deployed
- Browser environment (Playwright)

**Steps:**
1. User creates record locally
2. System encrypts record before writing to OPFS
3. System stores encrypted record in SQLite
4. User queries records
5. System decrypts records from SQLite
6. User updates record
7. System encrypts updated record
8. System updates encrypted record in SQLite
9. User deletes record
10. System removes encrypted record from SQLite

**Expected Results:**
- ✅ Records encrypted before writing to OPFS
- ✅ Records stored in SQLite (encrypted)
- ✅ Records decrypted successfully on read
- ✅ Updates work correctly
- ✅ Deletes work correctly
- ✅ Data persists across browser sessions

**Machine-Checkable:**
- Assert encryption before write (OPFS inspection)
- Assert SQLite contains encrypted records
- Assert decryption succeeds on read
- Assert CRUD operations functional
- Assert persistence across sessions

---

## IT-004: MCP Encrypted Query Flow

**Goal:** Verify that ChatGPT can query Neotoma via encrypted MCP bridge.

**Preconditions:**
- System running with FU-850, FU-855, FU-856, FU-857 deployed
- ChatGPT client (mock) with imported private key
- MCP server running (encrypted mode)

**Steps:**
1. ChatGPT client calls MCP `retrieve_records` with encrypted payload
2. MCP server receives encrypted payload (never decrypts)
3. MCP server processes query (ciphertext only)
4. MCP server returns encrypted response
5. ChatGPT client decrypts response using private key
6. ChatGPT client displays decrypted records

**Expected Results:**
- ✅ ChatGPT sends encrypted payload
- ✅ MCP server processes ciphertext (never decrypts)
- ✅ MCP server returns encrypted response
- ✅ ChatGPT decrypts successfully
- ✅ Decrypted records match query

**Machine-Checkable:**
- Assert encrypted payload sent (network capture)
- Assert server logs show ciphertext only
- Assert encrypted response returned
- Assert decryption succeeds
- Assert decrypted records match query

---

## IT-005: Migration Tool End-to-End

**Goal:** Verify that migration tool successfully migrates records from Supabase to local encrypted datastore.

**Preconditions:**
- System running with FU-850, FU-852, FU-858, FU-859 deployed
- Test Supabase database with sample records
- Browser environment (Playwright)

**Steps:**
1. User has existing records in Supabase (plaintext)
2. User clicks "Enable End-to-End Encryption"
3. System generates pre-migration checksum
4. System downloads all records from Supabase (paginated)
5. System encrypts each record locally
6. System stores encrypted records in local SQLite
7. System verifies integrity (post-migration checksum)
8. System enables E2EE mode
9. User verifies records accessible (decrypted)

**Expected Results:**
- ✅ Pre-migration checksum generated
- ✅ All records downloaded successfully
- ✅ All records encrypted successfully
- ✅ Post-migration checksum matches pre-migration
- ✅ E2EE mode enabled
- ✅ Records accessible (decrypted)
- ✅ Zero data loss

**Machine-Checkable:**
- Assert checksums match (pre vs post)
- Assert all records migrated
- Assert encryption successful
- Assert E2EE mode enabled
- Assert records accessible
- Assert zero data loss

---

## IT-006: Dual-Mode Operation

**Goal:** Verify that system supports both plaintext and encrypted modes simultaneously.

**Preconditions:**
- System running with FU-858, FU-860 deployed
- Feature flag: `ENCRYPTION_ENABLED` configurable

**Steps:**
1. Set feature flag: `ENCRYPTION_ENABLED=false`
2. User uploads record (plaintext mode)
3. Verify record stored in Supabase (plaintext)
4. Set feature flag: `ENCRYPTION_ENABLED=true`
5. User uploads record (encrypted mode)
6. Verify record encrypted before transmission
7. Verify both records accessible (plaintext + encrypted)
8. Verify backward compatibility (plaintext MCP clients work)

**Expected Results:**
- ✅ Plaintext mode functional
- ✅ Encrypted mode functional
- ✅ Both modes work simultaneously
- ✅ Backward compatibility maintained
- ✅ Feature flag works correctly

**Machine-Checkable:**
- Assert plaintext mode functional
- Assert encrypted mode functional
- Assert both modes coexist
- Assert backward compatibility
- Assert feature flag works

---

## IT-007: Offline Operation Flow

**Goal:** Verify that local datastore works offline without server connection.

**Preconditions:**
- System running with FU-852, FU-853 deployed
- Browser environment (Playwright)
- Network disconnected (simulated)

**Steps:**
1. User works online (syncs records)
2. Network disconnected (simulated)
3. User creates record locally
4. System stores encrypted record in local SQLite
5. User queries records locally
6. System returns decrypted records from local SQLite
7. User updates record locally
8. System updates encrypted record in local SQLite
9. Network reconnected (simulated)
10. System syncs encrypted deltas to server

**Expected Results:**
- ✅ Local CRUD works offline
- ✅ Records encrypted before storage
- ✅ Records decrypted on read
- ✅ Sync works when online
- ✅ No data loss during offline period

**Machine-Checkable:**
- Assert offline CRUD functional
- Assert encryption/decryption works offline
- Assert sync works when online
- Assert no data loss

---

## IT-008: Vector Search on Encrypted Datastore

**Goal:** Verify that vector search works on encrypted local datastore.

**Preconditions:**
- System running with FU-852, FU-854 deployed
- Local SQLite with encrypted records + embeddings
- Browser environment (Playwright)

**Steps:**
1. User has encrypted records with embeddings in local SQLite
2. User performs semantic search query
3. System searches embeddings (decrypted in worker memory only)
4. System returns matching records (encrypted)
5. System decrypts records for display
6. User views search results

**Expected Results:**
- ✅ Vector search works on encrypted datastore
- ✅ Embeddings decrypted only in worker memory
- ✅ Search results accurate
- ✅ Performance: <500ms P95

**Machine-Checkable:**
- Assert vector search functional
- Assert embeddings encrypted at rest
- Assert search results accurate
- Assert performance meets target

---

## IT-009: Multi-Device Sync (Optional)

**Goal:** Verify that encrypted delta sync works across devices.

**Preconditions:**
- System running with FU-861, FU-862 deployed (optional)
- Two browser instances (simulating two devices)
- Both devices have same encryption keys

**Steps:**
1. Device A creates record (encrypted)
2. Device A syncs encrypted delta to server
3. Device B pulls encrypted delta from server
4. Device B decrypts delta locally
5. Device B merges delta (conflict-free)
6. Device B displays synced record
7. Device B updates record (encrypted)
8. Device B syncs encrypted delta to server
9. Device A pulls encrypted delta
10. Device A merges delta
11. Device A displays updated record

**Expected Results:**
- ✅ Encrypted deltas sync successfully
- ✅ Conflict-free merge works
- ✅ Both devices see same records
- ✅ Zero data loss during sync

**Machine-Checkable:**
- Assert encrypted deltas sync
- Assert merge works correctly
- Assert both devices synchronized
- Assert zero data loss

---

## Test Execution Schedule

**After Batch 0-1 (Crypto Foundation):**
- IT-001: Key Generation and Export Flow

**After Batch 2-3 (Local Datastore):**
- IT-003: Local Datastore CRUD Operations
- IT-008: Vector Search on Encrypted Datastore

**After Batch 4-6 (Encrypted MCP Bridge):**
- IT-002: Encrypted Record Upload Flow
- IT-004: MCP Encrypted Query Flow

**After Batch 7 (Dual-Mode):**
- IT-006: Dual-Mode Operation

**After Batch 8 (Migration Tooling):**
- IT-005: Migration Tool End-to-End

**After Batch 9 (Multi-Device Sync, Optional):**
- IT-009: Multi-Device Sync

**Throughout:**
- IT-007: Offline Operation Flow (can test after Batch 2-3)

---

## Success Criteria

**Integration Tests Pass When:**
1. ✅ All tests pass (100% success rate)
2. ✅ Zero data loss in migration tests
3. ✅ Encryption overhead < 200ms P95
4. ✅ Search performance < 500ms P95
5. ✅ Migration time < 5 minutes (P95)

---

## Related Documentation

- `release_plan.md` — Complete release plan
- `execution_schedule.md` — Feature Unit execution schedule
- `migration_plan.md` — Migration strategy
- `.cursor/plans/local-first-e2ee-architecture-99397386.plan.md` — Architecture details







