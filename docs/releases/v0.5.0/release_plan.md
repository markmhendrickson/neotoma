## Release v0.5.0 — Agent Cryptographic Signing

_(Cryptographic Attribution and Permissioning for Multi-Agent Systems)_

---

### 1. Release Overview

- **Release ID**: `v0.5.0`
- **Name**: Agent Cryptographic Signing
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Enable cryptographic attribution and permissioning for agent interactions. Every agent that interacts with Neotoma can sign their interactions with public keys for attribution, permissioning, and audit trails.
- **Priority**: P1 (high-value enhancement, enables multi-agent coordination)
- **Target Ship Date**: After v0.3.0 validation, before v1.0.0
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **MCP Specification**: `docs/specs/MCP_SPEC.md`
- **Payload Model**: `docs/architecture/payload_model.md`
- **Crypto Infrastructure**: `src/crypto/` (existing Ed25519 signing)

This release plan coordinates agent signing scope into a concrete release plan.

**Release Classification:**

- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Not Marketed (deploys to production without marketing activities)

---

### 2. Problem Statement

**Current State:**
- Agents interact with Neotoma via MCP but cannot cryptographically prove their identity
- No way to attribute data modifications to specific agents
- No granular permissioning per agent
- No cryptographic audit trail for compliance
- Multi-agent coordination lacks identity differentiation

**User Pain Points Solved:**

1. **Attribution**: "Which agent created this data?" — Cryptographic proof of agent identity
2. **Security**: "Can I trust this agent?" — Impersonation prevention via signatures
3. **Permissioning**: "How do I control what each agent can do?" — Granular permissions per public key
4. **Audit Trail**: "Who changed my data?" — Non-repudiable cryptographic audit trail
5. **Data Integrity**: "Did an agent tamper with my data?" — Signature verification detects tampering
6. **Multi-Agent Coordination**: "How do multiple agents coordinate?" — Identity differentiation enables coordination
7. **Access Revocation**: "How do I revoke access?" — Public key-based revocation

---

### 3. Scope

#### 3.1 Included Feature Units

**Phase 1: Core Infrastructure**

- **FU-200**: Agent Keypair Generation Utilities
  - Client-side utilities for generating per-chat Ed25519 keypairs
  - Key storage strategies (sessionStorage, IndexedDB, localStorage)
  - Key management helpers (import/export, regeneration)
  - Browser and Node.js support

- **FU-201**: Payload Signature Extension
  - Extend `PayloadEnvelope.provenance` to include:
    - `signer_public_key?: string` (base64url-encoded Ed25519 public key)
    - `signature?: string` (base64url-encoded Ed25519 signature)
  - Update `ProvenanceSchema` in `src/services/payload_schema.ts`
  - Update `docs/architecture/payload_model.md`

- **FU-202**: Agent Identity Service Implementation
  - Implement `getAgentPublicKey()` in `src/crypto/agent_identity.ts`
  - Extract public key from request context (MCP request or HTTP header)
  - Replace stub implementation with real extraction logic

**Phase 2: MCP Integration**

- **FU-203**: MCP Payload Signing
  - MCP client library helpers for signing `submit_payload` requests
  - Helper functions: `signPayload()`, `getAgentKeypair(chatId)`
  - Example implementations for browser and Node.js clients
  - Documentation updates to `docs/specs/MCP_SPEC.md`

- **FU-204**: Signature Verification Middleware
  - Verify payload signatures in `submit_payload` handler
  - Optional verification initially (backward compatibility)
  - Signature verification logic using existing `verifySignature()` from `src/crypto/signature.ts`
  - Error handling for invalid signatures

**Phase 3: Permission System Foundation (P1, Optional)**

- **FU-205**: Agent Public Key Registry
  - Database table: `agent_public_keys`
  - Fields: `public_key` (PK), `agent_id`, `user_id`, `permissions` (JSONB), `created_at`, `revoked_at`
  - CRUD operations for agent key management

- **FU-206**: Permission Enforcement Framework
  - Permission checking based on public key
  - Permission types: `read`, `write`, `financial_operations`, `admin`
  - Middleware for permission enforcement
  - Integration with `submit_payload` handler

#### 3.2 Deferred to Post-MVP

- **FU-207**: Required Signatures
  - Make signatures mandatory for all write operations
  - Migration period needed for existing clients

- **FU-208**: Agent Trust Profiles
  - User-configurable trust levels per agent public key
  - Requires UI layer (v1.0.0+)

- **FU-209**: Agent Revocation UI
  - UI for revoking agent access
  - Requires UI layer (v1.0.0+)

#### 3.3 Excluded

- UI components (v1.0.0+)
- Multi-user agent management (v1.0.0+)
- Agent analytics dashboard (v1.0.0+)
- Required signatures (deferred for migration period)

---

### 4. Technical Architecture

#### 4.1 Key Generation Flow

```typescript
// Client-side (browser or Node.js)
import { generateEd25519KeyPair, deriveBearerToken } from '@neotoma/crypto';

async function initializeChatSession(chatId: string) {
  const keyPair = await generateEd25519KeyPair();
  const publicKeyToken = deriveBearerToken(keyPair.publicKey);
  
  // Store keypair (encrypted in localStorage/IndexedDB)
  storeAgentKeypair(chatId, keyPair);
  
  return { keyPair, publicKeyToken };
}
```

#### 4.2 Payload Signing Flow

```typescript
// MCP client signs payload before submission
import { signPayload } from '@neotoma/mcp-client';

const agentKeyPair = await getAgentKeypair(chatId);
const signedPayload = signPayload(payloadEnvelope, agentKeyPair);

// Submit signed payload via MCP
await mcpClient.call('submit_payload', signedPayload);
```

#### 4.3 Signature Verification Flow

```typescript
// Server-side verification in submit_payload handler
import { verifySignature } from '../crypto/signature.js';
import { parseBearerToken } from '../crypto/keys.js';

if (payload.provenance.signature && payload.provenance.signer_public_key) {
  const publicKey = parseBearerToken(payload.provenance.signer_public_key);
  const payloadBytes = serializePayloadForSigning(payload);
  const signature = base64UrlDecode(payload.provenance.signature);
  
  const isValid = verifySignature(payloadBytes, signature, publicKey);
  if (!isValid) {
    throw new Error('Invalid payload signature');
  }
}
```

#### 4.4 Database Schema Changes

**New Table (if FU-205 included):**

```sql
CREATE TABLE agent_public_keys (
  public_key TEXT PRIMARY KEY, -- Base64url-encoded Ed25519 public key
  agent_id TEXT, -- Short identifier (first 16 chars of public_key)
  user_id UUID REFERENCES auth.users(id),
  permissions JSONB DEFAULT '{"read": true, "write": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_agent_public_keys_user_id ON agent_public_keys(user_id);
CREATE INDEX idx_agent_public_keys_agent_id ON agent_public_keys(agent_id);
```

**Payload Schema Extension:**

```typescript
// src/services/payload_schema.ts
export const ProvenanceSchema = z.object({
  source_refs: z.array(z.string()),
  extracted_at: z.string().datetime(),
  extractor_version: z.string(),
  agent_id: z.string().optional(),
  signer_public_key: z.string().optional(), // NEW
  signature: z.string().optional(), // NEW
});
```

---

### 5. Acceptance Criteria

#### 5.1 Product Acceptance Criteria

- ✅ Agents can generate Ed25519 keypairs per chat session
- ✅ Payloads can include cryptographic signatures
- ✅ Signatures are verified when provided (optional initially)
- ✅ Agent public keys are extractable from request context
- ✅ MCP clients can sign payloads using provided utilities
- ✅ Backward compatibility maintained (unsigned payloads still work)

#### 5.2 Technical Acceptance Criteria

- ✅ `generateEd25519KeyPair()` available for client-side use
- ✅ `PayloadEnvelope.provenance` includes `signer_public_key` and `signature` fields
- ✅ `getAgentPublicKey()` extracts public key from request context
- ✅ Signature verification in `submit_payload` handler (optional)
- ✅ MCP client library helpers for signing (`signPayload()`, `getAgentKeypair()`)
- ✅ Agent public key registry table (if FU-205 included)
- ✅ Permission checking framework (if FU-206 included)
- ✅ Integration tests passing
- ✅ Documentation updated (`MCP_SPEC.md`, `payload_model.md`)

#### 5.3 Business Acceptance Criteria

- ✅ Enables multi-agent coordination with attribution
- ✅ Foundation for permission system
- ✅ Cryptographic audit trail for compliance
- ✅ Backward compatible (signatures optional initially)
- ✅ No breaking changes to existing MCP clients

---

### 6. Success Criteria

- All Phase 1-2 Feature Units completed
- Agent keypair generation utilities functional
- Payload signatures can be included and verified
- MCP clients can sign payloads
- Signature verification middleware functional
- Integration tests passing
- Backward compatibility maintained (unsigned payloads still work)
- Documentation updated (`MCP_SPEC.md`, `payload_model.md`, `docs/specs/AGENT_SIGNING.md`)
- No breaking changes to existing MCP clients

---

### 7. Implementation Notes

#### 7.1 Backward Compatibility

- Signatures are **optional** initially to maintain backward compatibility
- Existing MCP clients without signing continue to work
- Signature verification only occurs when both `signer_public_key` and `signature` are present
- Post-MVP: Signatures will become required for write operations (FU-207)

#### 7.2 Key Storage Strategies

**Browser Clients:**
- `sessionStorage`: Per-tab, cleared on close (ephemeral)
- `IndexedDB`: Persistent across sessions (recommended)
- `localStorage`: Simple but less secure (fallback)

**Node.js Clients:**
- File system: `~/.neotoma/agent_keys/`
- Environment variables: For CI/CD agents
- Keychain: OS-native keychain integration (future)

#### 7.3 Migration Path

1. **Phase 1**: Infrastructure (signatures optional)
2. **Phase 2**: MCP integration (clients can sign)
3. **Phase 3**: Permission system (optional, P1)
4. **Post-MVP**: Required signatures (FU-207)

---

### 8. Dependencies

- **v0.3.0**: Operational Hardening (prerequisite)
- **Existing crypto infrastructure**: `src/crypto/` (Ed25519 signing already implemented)
- **MCP protocol**: No protocol changes needed (signatures in payload provenance)

---

### 9. Risks and Mitigations

**Risk**: Breaking existing MCP clients
- **Mitigation**: Signatures optional initially, backward compatibility maintained

**Risk**: Key management complexity for clients
- **Mitigation**: Provide helper utilities and clear documentation

**Risk**: Performance impact of signature verification
- **Mitigation**: Ed25519 verification is fast (~1-2ms), optional verification initially

**Risk**: Key storage security
- **Mitigation**: Document best practices, provide encryption helpers

---

### 10. Related Documents

- `docs/specs/MCP_SPEC.md` — MCP action specification
- `docs/architecture/payload_model.md` — Payload model architecture
- `src/crypto/agent_identity.ts` — Agent identity abstraction (stub)
- `src/crypto/signature.ts` — Ed25519 signature utilities
- `src/crypto/keys.ts` — Key generation utilities
- `docs/foundation/composability_analysis.md` — Multi-agent coordination context

---

### 11. Release Spacing

- **v0.3.0**: Operational hardening (prerequisite)
- **v0.5.0**: Agent cryptographic signing (this release)
- **v0.4.0**: Intelligence + housekeeping (can run in parallel)
- **v1.0.0**: MVP (can include agent signing if validated)




