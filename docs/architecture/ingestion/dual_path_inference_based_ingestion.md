name: Dual-Path Inference-Based Ingestion
overview: Re-architect Neotoma ingestion to support both AI-powered inference (for unstructured files) and direct structured ingestion (for pre-structured data), with optimized MCP operations, user-specific schemas, and deterministic canonicalization.
todos:
  - id: inference-service
    content: Create AI inference service with OpenAI integration and metadata tracking
    status: pending
  - id: canonicalization-service
    content: Create deterministic canonicalization service for both paths
    status: pending
  - id: schema-migration
    content: Add normalization_metadata column and indexes to records table
    status: pending
  - id: inference-path
    content: Implement inference ingestion path (file → OCR → inference → preview)
    status: pending
    dependencies:
      - inference-service
      - canonicalization-service
  - id: direct-path
    content: Implement direct structured ingestion path (validation → canonicalization)
    status: pending
    dependencies:
      - canonicalization-service
  - id: ingestion-orchestrator
    content: Create orchestrator to route between paths and handle preview/commit logic
    status: pending
    dependencies:
      - inference-path
      - direct-path
  - id: mcp-ingest-tool
    content: Add unified ingest() MCP tool replacing upload_file and submit_payload
    status: pending
    dependencies:
      - ingestion-orchestrator
  - id: mcp-preview-tool
    content: Add commit_preview() MCP tool for verification workflow
    status: pending
    dependencies:
      - ingestion-orchestrator
  - id: mcp-batch-tool
    content: Add ingest_batch() MCP tool for bulk operations
    status: pending
    dependencies:
      - ingestion-orchestrator
  - id: user-schema-registry
    content: Extend schema registry for user-specific schemas (scope, user_id, adoption)
    status: pending
    dependencies:
      - schema-migration
  - id: schema-convergence
    content: Implement community convergence mechanism for popular user schemas
    status: pending
    dependencies:
      - user-schema-registry
  - id: schema-suggestion
    content: Add schema inference from properties when entity_type unknown
    status: pending
    dependencies:
      - user-schema-registry
  - id: preview-service
    content: Create preview service with TTL expiration and caching
    status: pending
    dependencies:
      - ingestion-orchestrator
  - id: verification-workflow
    content: Implement agent verification with modification tracking
    status: pending
    dependencies:
      - preview-service
      - mcp-preview-tool
  - id: migration-wrappers
    content: Create compatibility wrappers for existing upload_file and submit_payload
    status: pending
    dependencies:
      - mcp-ingest-tool
  - id: update-docs
    content: Update ingestion and schema registry documentation for new architecture
    status: pending
    dependencies:
      - migration-wrappers
  - id: integration-tests
    content: Write integration tests for both paths and edge cases
    status: pending
    dependencies:
      - verification-workflow
      - schema-suggestion
  - id: determinism-tests
    content: Write determinism tests verifying canonical form consistency
    status: pending
    dependencies:
      - integration-tests
  - id: performance-tests
    content: Write performance tests for latency and throughput
    status: pending
    dependencies:
      - integration-tests
# Dual-Path Inference-Based Ingestion

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md)

**Note**: This document describes early architecture. See [`docs/releases/v0.2.15/release_plan.md`](../../releases/v0.2.15/release_plan.md) for current unified [source material](../../vocabulary/canonical_terms.md#source-material) architecture. Architecture
## Overview
Transform Neotoma's ingestion system to support:
1. **Inference Path**: Raw files → AI extraction → verification → storage (with full metadata)
2. **Direct Path**: Structured data → validation → canonicalization → storage
3. **Unified**: Single optimized MCP API, shared schema registry, deterministic canonicalization
This maintains Neotoma's trust boundary (owns extraction) while leveraging AI for semantic understanding and supporting pre-structured agent data.---
## Architecture Summary
```javascript
┌─────────────────────────────────────────────────────┐
│                   MCP Interface                      │
│  • ingest() - unified smart ingestion                │
│  • commit_preview() - finalize reviews               │
│  • ingest_batch() - bulk operations                  │
└─────────────────┬───────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼─────┐      ┌───▼────────┐
    │ Path 1:  │      │  Path 2:   │
    │ Inference│      │  Direct    │
    └────┬─────┘      └───┬────────┘
         │                │
         └────────┬───────┘
                  │
         ┌────────▼─────────┐
         │ Canonicalization │ ← Deterministic
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │ Schema Registry  │ ← User + Community
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │     Storage      │ ← Full Metadata
         └──────────────────┘
```
## Key Files
- [`src/server.ts`](src/server.ts) - MCP server, current ingestion endpoints
- [`src/normalize.ts`](src/normalize.ts) - Current rule-based normalization
- [`src/services/schema_registry.ts`](src/services/schema_registry.ts) - Schema management
- [`docs/subsystems/schema.md`](docs/subsystems/schema.md) - Schema documentation
- [`docs/subsystems/ingestion/ingestion.md`](docs/subsystems/ingestion/ingestion.md) - Ingestion docs
## Implementation Phases
### Phase 1: Core Inference Infrastructure
**Create AI inference service with full metadata tracking**
1. Create `src/services/inference_service.ts`:
- OpenAI integration (GPT-4 Turbo)
- Prompt management (versioned, content-hashed)
- Temperature=0, seed support for reproducibility
- Confidence scoring per field
- Full execution metadata capture
2. Create `src/services/canonicalization_service.ts`:
- Deterministic field normalization (camelCase/snake_case)
- Type coercion (strings → dates, numbers)
- Entity ID generation (hash-based)
- Relationship extraction
- **Same rules apply to both inference and direct paths**
3. Extend schema in `supabase/migrations/`:
- Add `normalization_metadata` JSONB column to `records` table
- Structure: `{ raw_source, inference_config, inference_execution, verification }`
- Add indexes for querying by model version, confidence
**Success Criteria:**
- Can infer structure from PDF with metadata
- Canonicalization produces identical output for equivalent inputs
- Metadata enables exact replay
### Phase 2: Dual-Path Ingestion Core
**Implement both ingestion paths with unified validation**
4. Create `src/services/ingestion/inference_path.ts`:
- File upload → OCR/text extraction (deterministic)
- Call inference service
- Generate preview with confidence scores
- Store normalization metadata
5. Create `src/services/ingestion/direct_path.ts`:
- Accept pre-structured data
- Validate against schema
- Apply canonicalization (same rules as inference path)
- Store provenance metadata
6. Create `src/services/ingestion/ingestion_orchestrator.ts`:
- Route to appropriate path based on input
- Handle preview generation
- Implement auto-commit logic (confidence threshold)
- Unified error handling
**Success Criteria:**
- Both paths converge at canonicalization
- Preview generation works for both paths
- Auto-commit respects confidence thresholds
### Phase 3: Optimized MCP API
**Replace existing MCP tools with optimized unified API**
7. Refactor [`src/server.ts`](src/server.ts):
- **Add new tool: `ingest`** (replaces `upload_file`, `submit_payload`)
    - Single tool handles both paths
    - Smart auto-commit with confidence threshold
    - Returns either `committed` or `review_required`
- **Add new tool: `commit_preview`**
    - Only needed when review required
    - Accepts modifications from agent
- **Add new tool: `ingest_batch`**
    - Bulk ingestion (1000s of records)
    - Batch statistics and error handling
- **Keep existing: `query_records`** (no changes)
8. Update MCP tool schemas:
- Detailed input validation
- Clear error messages
- Examples in descriptions
**Success Criteria:**
- `ingest()` handles both structured and file inputs
- Single round trip for high-confidence ingestion
- Batch operations support 1000+ records
### Phase 4: User-Specific Schema Registry
**Extend schema registry for user-specific schemas with community convergence**
9. Update [`src/services/schema_registry.ts`](src/services/schema_registry.ts):
- Add `scope` field: `'user' | 'community'`
- Add `user_id` for user-specific schemas
- Add `adoption_count` for tracking popularity
- Add `schema_hash` for content-addressed deduplication
- Add `parent_schema_hash` for inheritance tracking
10. Create `src/services/schema_convergence.ts`:
    - Monitor user schema adoption
    - Detect similar schemas across users (hash comparison)
    - Promote high-adoption schemas to community
    - Migration protocol when user adopts community schema
11. Add schema suggestion logic:
    - Infer schema from properties (when entity_type unknown)
    - Return suggested schema in error responses
    - Allow agent to register new user schemas
**Success Criteria:**
- Users can create user-specific schemas
- Community schemas emerge from high adoption
- Schema inheritance prevents sprawl
### Phase 5: Preview and Verification System
**Implement preview generation and agent verification flow**
12. Create `src/services/preview_service.ts`:
    - Generate preview_id (short-lived, 5 min TTL)
    - Store preview in cache (Redis or in-memory)
    - Return canonical form for agent review
    - Track verification decisions
13. Implement verification workflow:
    - Agent receives preview
    - Agent can accept/modify/reject
    - Modifications stored in `normalization_metadata.verification`
    - Commit applies modifications before final storage
**Success Criteria:**
- Previews expire after 5 minutes
- Agent modifications tracked in metadata
- Can audit why extraction was modified
### Phase 6: Migration and Backwards Compatibility
**Migrate existing system without breaking current functionality**
14. Create migration layer in [`src/server.ts`](src/server.ts):
    - Keep existing `upload_file` as wrapper around `ingest()`
    - Keep existing `submit_payload` as wrapper around `ingest()`
    - Deprecation warnings in responses
    - Migration guide for agents
15. Update documentation:
    - [`docs/subsystems/ingestion/ingestion.md`](docs/subsystems/ingestion/ingestion.md) - new dual-path architecture
    - [`docs/subsystems/schema_registry.md`](docs/subsystems/schema_registry.md) - user-specific schemas
    - Create `docs/api/mcp_migration_guide.md` - migration from old to new tools
**Success Criteria:**
- Existing agents continue working
- Clear migration path documented
- No breaking changes to current functionality
### Phase 7: Testing and Quality Assurance
**Comprehensive testing for both paths and edge cases**
16. Integration tests:
    - Test inference path with sample PDFs (invoices, receipts, contracts)
    - Test direct path with structured data
    - Test schema suggestion and registration
    - Test preview and verification flow
    - Test batch operations with 1000+ records
17. Determinism tests:
    - Verify same file → same canonical form (with same inference config)
    - Verify canonicalization rules consistent across paths
    - Verify metadata enables exact replay
18. Performance tests:
    - Measure latency for single-shot operations
    - Measure throughput for batch operations
    - Verify preview expiration works
    - Load test with concurrent ingestions
**Success Criteria:**
- 95%+ test coverage for new code
- All determinism tests pass
- Single-shot latency <2s (inference) or <100ms (direct)
- Batch throughput >100 records/sec
## Migration Strategy
### Current → New System
| Current | New | Action ||---------|-----|--------|| `upload_file` | `ingest({file})` | Wrapper maintained || `submit_payload` | `ingest({structured_data})` | Wrapper maintained || Rule-based extraction | AI inference with metadata | New path, rules deprecated || Global schemas | User + community schemas | Schema registry extended || No preview | Optional preview | New workflow |
### Rollout Plan
1. **Week 1-2**: Core infrastructure (Phase 1-2)
2. **Week 3**: MCP API redesign (Phase 3)
3. **Week 4**: Schema registry enhancement (Phase 4)
4. **Week 5**: Preview system (Phase 5)
5. **Week 6**: Migration layer + docs (Phase 6)
6. **Week 7**: Testing (Phase 7)
7. **Week 8**: Beta release, monitor, iterate
## Success Metrics
### Technical
- ✅ Both ingestion paths functional
- ✅ Canonicalization deterministic
- ✅ Single round trip for >80% of operations
- ✅ Metadata enables full replay
- ✅ User schemas work correctly
### User Experience
- ✅ Faster ingestion (optimized MCP calls)
- ✅ Better extraction quality (AI inference)
- ✅ Agent verification prevents bad data
- ✅ Flexible schema management
### Business
- ✅ Competitive advantage: AI-powered + deterministic
- ✅ No breaking changes to existing integrations
- ✅ Foundation for advanced features (schema marketplace, etc.)
## Risks and Mitigations
| Risk | Mitigation ||------|------------|| **AI inference cost** | Cache results, use cheaper models for simple docs, batch processing || **Model deprecation** | Pin versions, monitor OpenAI announcements, maintain fallback to rules || **Non-determinism** | Store full metadata, implement replay, confidence thresholds || **Schema sprawl** | Community convergence, suggest existing types, limit user schema creation || **Preview storage** | TTL expiration, limit to 1000 concurrent previews, Redis cache || **Migration complexity** | Maintain wrappers, gradual rollout, comprehensive docs |---
## Post-Implementation
### Future Enhancements
- Multi-model support (Claude, Gemini)
- Local model option (privacy-focused users)
- Schema marketplace (share/sell schemas)
- Confidence-based pricing (lower cost for high confidence)
- Streaming inference for large documents
- Visual preview for file extractions
### Monitoring
- Track inference costs per user
- Monitor confidence score distribution
- Alert on model deprecations
- Track schema adoption metrics