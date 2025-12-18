<!-- 99397386-4554-4597-be10-9818176a1cc0 094b6b34-3152-4835-b37b-4e25cc962a56 -->
# Neotoma Local-First E2EE Architecture Build Plan

## Architecture Goals

- Browser is authoritative datastore (SQLite WASM + OPFS, encrypted-at-rest)
- End-to-end encryption: X25519 envelopes + AES-GCM payload + Ed25519 signatures
- Encrypted WebSocket bridge; MCP servers (hosted/local) see ciphertext only
- Bearer token becomes Ed25519 public key; private key exported to ChatGPT for decryption
- Optional multi-device sync via encrypted deltas routed through MCP

## Implementation Steps

### Step 1 — Crypto Library (`src/crypto/`)

- Implement cross-platform crypto helpers (browser + Node):
- `keys.ts`: Generate/store X25519 (encryption) + Ed25519 (signing) keypairs via WebCrypto/`@noble/curves`
- `envelope.ts`: AES-GCM envelopes with ephemeral symmetric key, X25519 key agreement
- `signature.ts`: Ed25519 sign/verify helpers
- `auth.ts`: Request signing utilities + bearer token derivation (base64url public key)
- `export.ts`: Safe export/import of private keys (masked display, copy, import)
- `types.ts`, `index.ts`
- Add unit tests covering key gen, envelopes, signatures

### Step 2 — Browser Datastore (`frontend/src/store/`)

- Integrate SQLite WASM (sql.js / sqlite-wasm) with OPFS VFS
- Encrypt pages/records before writing to OPFS (`encryption.ts`)
- Define schema + CRUD helpers (`schema.ts`, `records.ts`, `vectors.ts`)
- Expose typed APIs for WebWorker RPC

### Step 3 — Browser Vector Search (`frontend/src/search/`)

- Add HNSWlib-WASM or SQLite-vss integration for embeddings
- Keep embeddings decrypted only in worker memory
- Unified search API (semantic + keyword) used by UI and RPC layer

### Step 4 — WebWorker RPC Executor (`frontend/src/worker/`)

- `db.worker.ts` bootstraps SQLite+ANN, handles RPC commands (`local.get/put/query/searchVectors/syncPush/syncPull`)
- `rpc.ts` implements structured message passing + error handling
- `types.ts` defines message schemas; add worker tests (vitest + fake worker)

### Step 5 — Encrypted WebSocket Bridge (`frontend/src/bridge/`, `src/mcp_ws_bridge.ts`)

- Browser side: `websocket.ts` to encrypt outbound envelopes, route inbound ciphertext untouched; `mcp.ts` for tool invocation
- Server side: update `src/mcp_ws_bridge.ts` to relay encrypted bytes, handle reconnects/heartbeats
- ChatGPT side: decrypt responses using exported private key

### Step 6 — Hosted MCP Server Updates (`src/server.ts`, `src/actions.ts`, `src/config.ts`, `openapi.yaml`)

- Tool handlers accept encrypted payloads, never decrypt
- Encrypt responses before returning; include signature verification when provided
- Replace `ACTIONS_BEARER_TOKEN` with public-key registry: bearer token == base64url Ed25519 public key
- `openapi.yaml`: document new auth semantics + envelope payloads
- Maintain Supabase-backed sync endpoints as optional features

### Step 7 — Local MCP Server (`src/mcp_local/`)

- Implement local daemon/Electron app exposing same MCP tool schema on `ws://127.0.0.1:5233`
- Provide encrypted mailbox for offline routing + local delta storage
- Include discovery helpers shared with browser

### Step 8 — Browser Discovery & Fallback (`frontend/src/bridge/discovery.ts`)

- Detect local MCP first, fallback to hosted `wss://mcp.neotoma.io`
- Reuse identical encrypted protocol for both paths

### Step 9 — Frontend Integration & Key UI (`frontend/src/`)

- Replace HTTP calls (`frontend/src/lib/api.ts`) with local RPC + encrypted bridge; keep HTTP sync as optional path using derived bearer token
- Update `App.tsx` + `hooks/useSettings.ts` to manage keys:
- On load, if no key exists, auto-generate X25519 + Ed25519 pairs and persist securely
- Derive bearer token from public key
- Provide settings panel (Header) showing masked private key, copy/export, regenerate, and import existing key workflow (user pastes private key, app re-derives public/bearer token)
- Display bearer token and masked private key in header for ChatGPT configuration
- Ensure ChatPanel/other components react to new settings state

### Step 10 — Multi-Device Sync (Optional) (`frontend/src/sync/`, `src/server.ts`, `src/mcp_local/storage.ts`)

- Implement encrypted delta generator (`deltas.ts`) + conflict-free merge (`merge.ts`)
- Hosted/local MCP store append-only encrypted deltas; browser pulls/pushes via RPC commands (`local.syncPush/pull`)
- Keep all deltas encrypted end-to-end; server stores ciphertext only

## Migration & Compatibility

1. Dual-mode: keep existing Supabase HTTP API + MCP plaintext functionality until new path stabilized (feature flag)
2. Provide tooling to migrate existing server records into local SQLite (one-time sync)
3. Document ChatGPT setup: copy bearer token (public key) + private key import instructions

## Key Files to Modify

- `src/server.ts`, `src/actions.ts`, `src/config.ts`, `openapi.yaml`
- `src/mcp_ws_bridge.ts`, `src/index.ts` (if needed)
- `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/hooks/useSettings.ts`, `frontend/src/components/Header.tsx`, `frontend/src/components/ChatPanel.tsx`
- `package.json` (dependencies, build scripts), `vite.config.ts` (worker bundling)

## Testing & Validation

- Crypto unit tests (browser + Node) for key gen, envelope round-trips, signature verification
- Integration tests for WebWorker datastore + search APIs
- WebSocket bridge E2E tests (mock MCP server)
- Auth tests ensuring bearer token/public key mapping + signature validation
- UI tests for key generation/import/export flows
- Optional sync tests covering delta push/pull/merge

## Dependencies to Add

- `@sqlite.org/sqlite-wasm` or `sql.js`
- `hnswlib-wasm` or `sqlite-vss`
- `@noble/curves` (Ed25519/X25519) + `@noble/hashes`
- Possibly `idb-keyval` (IndexedDB helpers)
- Electron deps if building desktop daemon

## ChatGPT Client Integration

- User copies exported private key into ChatGPT client (extension/custom storage)
- Bearer token = public key; ChatGPT uses it when calling HTTP Actions
- ChatGPT decrypts tool responses locally using private key
- Document secure key handling guidance in README

### To-dos

- [ ] Implement crypto library (keys, envelopes, signatures, auth, export)
- [ ] Build encrypted SQLite WASM datastore w/ API (frontend/src/store)
- [ ] Add local ANN engine + search API (frontend/src/search)
- [ ] Create WebWorker RPC layer for datastore ops
- [ ] Upgrade bridge for encrypted envelopes (frontend/src/bridge, src/mcp_ws_bridge.ts)
- [ ] Update MCP/HTTP servers for encrypted envelopes & key auth
- [ ] Implement optional local MCP server daemon
- [ ] Add browser MCP discovery/fallback logic
- [ ] Integrate new datastore, key management UI, key import/export
- [ ] Implement encrypted delta sync (optional)