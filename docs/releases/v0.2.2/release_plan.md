## Release v0.2.2 — list_capabilities MCP Action
### 1. Release Overview
- **Release ID**: `v0.2.2`
- **Name**: list_capabilities MCP Action
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Add a new MCP action `list_capabilities` that enables integrations to dynamically discover available capabilities, their schemas, field requirements, and entity extraction rules. This enables programmatic discovery of supported data types without hardcoding capability IDs.
- **Priority**: P0 (critical for integration enablement)
- **Target Ship Date**: When ready (post v0.2.1 validation)
- **Marketing Required**: No (not marketed release)
#### 1.1 Canonical Specs (Authoritative Sources)
- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **MCP Specification**: `docs/specs/MCP_SPEC.md`
- **Payload Model**: `docs/architecture/source_material_model.md`
- **Capability Registry**: `src/services/capability_registry.ts`
This release plan coordinates the addition of a single new MCP action that enhances integration discoverability.
**Release Classification:**
- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Not Marketed (deploys to production without marketing activities)
### 2. Scope
#### 2.1 Included Feature Units
**MCP Action Enhancement:**
- `FU-304`: MCP Action — `list_capabilities`
  - New MCP action for dynamic capability discovery
  - Returns available capabilities with schemas, field requirements, and entity extraction rules
  - Supports filtering by intent and version
  - Includes example payloads for each capability
  - Enhanced `submit_payload` tool description referencing `list_capabilities`
#### 2.2 Explicitly Excluded
- New capability types (only discovery of existing capabilities)
- Capability registry changes (only exposing existing registry)
- UI changes (MCP-only feature)
- Documentation generation updates (separate from this release)
### 3. Release-Level Acceptance Criteria
#### 3.1 Product
- `list_capabilities` MCP action returns all available capabilities with complete metadata:
  - Capability ID, intent, version
  - Primary entity type and schema version
  - Canonicalization fields (used for deduplication)
  - Entity extraction rules (which entities are automatically extracted)
  - Example payloads for each capability type
- Filtering by intent and version works correctly
- Response structure matches MCP specification
- `submit_payload` tool description references `list_capabilities` for discovery
- Enhanced tool descriptions guide integrations on capability usage
- All 5 existing capabilities (invoice, transaction, receipt, contract, note) are discoverable
#### 3.2 Technical
- MCP action follows MCP protocol specification
- Response structure matches specification in `docs/specs/MCP_SPEC.md`
- Filtering logic correctly filters capabilities by intent and version
- Example payloads generated for all 5 capabilities
- No breaking changes to existing MCP actions
- Backward compatible (existing integrations continue to work)
- Response time < 100ms (capability registry is static)
- All tests passing (unit, integration, MCP protocol tests)
#### 3.3 Business
- Integrations can discover available capabilities at runtime
- No hardcoded capability IDs required in integration code
- Self-documenting tool descriptions reduce support burden
- Enables dynamic adaptation to new capabilities without code changes
### 4. Cross-FU Integration Scenarios
These scenarios must pass end-to-end before v0.2.2 is approved:
1. **Capability Discovery → Payload Submission**
   - Call `list_capabilities` via MCP
   - Verify all 5 capabilities returned with complete metadata
   - Use returned capability ID to submit payload via `submit_payload`
   - Verify payload submission succeeds
   - Verify entities extracted according to capability rules
2. **Filtered Discovery → Payload Submission**
   - Call `list_capabilities` with `intent: "store_invoice"` filter
   - Verify only invoice capabilities returned
   - Use returned capability ID to submit invoice payload
   - Verify submission succeeds
3. **Tool Description Guidance**
   - Query MCP `ListTools` to get tool descriptions
   - Verify `submit_payload` description references `list_capabilities`
   - Verify `list_capabilities` description explains usage
   - Verify field descriptions in `submit_payload` guide users to discovery
4. **Example Payload Validation**
   - Call `list_capabilities` for each capability type
   - Verify example payloads provided for all 5 capabilities
   - Verify example payloads match expected structure
   - Use example payloads to submit test payloads
   - Verify submissions succeed
The detailed test specifications for these flows live in `docs/releases/v0.2.2/integration_tests.md`.
### 5. Deployment and Rollout Strategy
- **Deployment Target**: Production (neotoma.io)
  - All releases deploy to production at neotoma.io
  - Deploy MCP server update with new action
  - New action accessible via MCP protocol immediately
- **Marketing Strategy**: Not Marketed
  - No pre-launch marketing activities
  - No post-launch marketing activities
  - No user acquisition campaigns
  - No announcement or promotion
  - Release deployed silently to production
- **Rollback Plan**:
  - Revert code changes and redeploy to neotoma.io
  - Remove `list_capabilities` action from MCP server
  - Existing integrations continue to work (backward compatible)
### 6. Post-Release Validation
- Validate MCP action:
  - Test `list_capabilities` returns all 5 capabilities
  - Test filtering by intent works correctly
  - Test filtering by version works correctly
  - Test example payloads are valid
  - Test response structure matches specification
- Validate tool descriptions:
  - Verify `submit_payload` description references `list_capabilities`
  - Verify field descriptions guide users to discovery
- Validate integration:
  - Test discovery → submission workflow end-to-end
  - Test with multiple capability types
  - Verify backward compatibility (existing integrations unaffected)
- Validate production deployment:
  - MCP action accessible via MCP protocol
  - Response times within target (< 100ms)
  - No errors in production logs
### 7. Success Criteria
**Release is Complete When:**
1. ✅ `list_capabilities` MCP action implemented and tested
2. ✅ All 5 capabilities discoverable with complete metadata
3. ✅ Filtering by intent and version functional
4. ✅ Example payloads provided for all capabilities
5. ✅ `submit_payload` tool description enhanced with discovery guidance
6. ✅ MCP specification updated with new action documentation
7. ✅ Integration tests passing (discovery → submission workflows)
8. ✅ Backward compatibility validated (existing integrations unaffected)
9. ✅ Response times within target (< 100ms)
10. ✅ **Deployed to neotoma.io** (MCP action accessible)
11. ✅ All acceptance criteria met
### 8. Status
- **Current Status**: `planning`
- **Release Type**: Not Marketed
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson
- **Notes**:
  - Builds on existing MCP server infrastructure (FU-200)
  - Uses existing capability registry (`src/services/capability_registry.ts`)
  - No new external dependencies required
  - Backward compatible (no breaking changes)
  - **All releases deploy to production** at neotoma.io, regardless of marketing status
### 9. Related Documentation
- `integration_tests.md` — Cross-FU integration test specifications
- `execution_schedule.md` — Detailed batch execution plan
- `manifest.yaml` — Feature Unit manifest and dependencies
- `docs/specs/MCP_SPEC.md` — MCP action specifications (to be updated)
### 10. Feature Unit Specifications
**New Feature Unit:**
- **FU-304**: MCP Action — `list_capabilities`
  - Purpose: Enable dynamic discovery of available capabilities for payload submission
  - Dependencies: FU-200 (MCP Server Core)
  - Risk Level: Low (additive feature, no breaking changes)
**Dependencies:**
- FU-304: Depends on FU-200 (MCP Server Core from v0.1.0)
- Uses existing `listCapabilities()` from `src/services/capability_registry.ts`
### 11. Implementation Details
#### 11.1 MCP Action Specification
**Action Name**: `list_capabilities`
**Request Schema:**
```typescript
{
  intent?: string; // Optional: Filter by intent (e.g., "store_invoice")
  version?: string; // Optional: Filter by version (e.g., "v1")
}
```
**Response Schema:**
```typescript
{
  capabilities: Array<{
    id: string; // Capability ID (e.g., "neotoma:store_invoice:v1")
    intent: string; // Intent name (e.g., "store_invoice")
    version: string; // Version (e.g., "v1")
    primary_entity_type: string; // Primary entity type created (e.g., "invoice")
    schema_version: string; // Schema registry version (e.g., "1.0")
    canonicalization_fields: string[]; // Fields used for deduplication
    entity_extraction: Array<{
      extraction_type: "payload_self" | "field_value" | "array_items";
      source_field?: string; // Field name if extraction_type is "field_value" or "array_items"
      entity_type: string; // Entity type extracted (e.g., "company", "invoice")
    }>;
    example_payload: Record<string, unknown>; // Example body structure
  }>;
  total: number; // Total capabilities returned
}
```
**Error Codes:**
- `VALIDATION_ERROR` (400): Invalid filter parameters
**Consistency**: Strong (capability registry is static at runtime)
**Determinism**: Yes (same filters → same capabilities, sorted by intent then version)
#### 11.2 Enhanced Tool Descriptions
**submit_payload** tool description updated to:
- Reference `list_capabilities` for discovery
- Explain capability-based processing
- Guide users to use discovery before submission
**capability_id** field description updated to:
- Reference `list_capabilities` for available IDs
- Explain versioned capability format
**body** field description updated to:
- Reference `list_capabilities` for schema requirements
- Explain structure should match capability expectations
#### 11.3 Example Payloads
Example payloads provided for all 5 capabilities:
- `neotoma:store_invoice:v1`: Invoice with vendor, customer, amount, date
- `neotoma:store_transaction:v1`: Transaction with merchant, counterparty, amount, date
- `neotoma:store_receipt:v1`: Receipt with vendor, amount, date
- `neotoma:store_contract:v1`: Contract with parties, dates
- `neotoma:store_note:v1`: Note with title, content, tasks
### 12. Defensible Differentiation
This release validates **cross-platform access** differentiator:
- **Dynamic Discovery**: Integrations can discover capabilities at runtime without hardcoding
- **Self-Documenting**: Tool descriptions guide usage without external documentation
- **Version-Aware**: Shows all versions and enables filtering for future capability evolution
- **Programmatic Access**: No manual documentation lookup required
This enables integrations to adapt to new capabilities automatically, supporting Neotoma's cross-platform MCP integration strategy.
**Reference**: [`docs/private/competitive/defensible_differentiation_framework.md`](../../private/competitive/defensible_differentiation_framework.md)
### 13. Pre-Mortem Analysis
**Top Failure Modes:**
1. **MCP Protocol Compliance Issues**
   - Early warning: MCP integration tests fail, protocol compliance issues
   - Mitigation: Follow existing MCP action patterns, comprehensive protocol tests
   - Rollback: Revert MCP action changes, check protocol compliance
2. **Response Structure Mismatch**
   - Early warning: Integration tests fail, response structure doesn't match spec
   - Mitigation: Comprehensive response schema validation, spec alignment checks
   - Rollback: Fix response structure, re-validate against spec
3. **Example Payload Generation Failures**
   - Early warning: Missing or invalid example payloads for capabilities
   - Mitigation: Validate example payloads against capability schemas
   - Rollback: Fix example payload generation, re-validate
4. **Backward Compatibility Regressions**
   - Early warning: Existing integration tests fail, breaking changes detected
   - Mitigation: Comprehensive backward compatibility tests, no breaking changes
   - Rollback: Revert changes, ensure backward compatibility maintained
### 14. MCP Actions Status Update
**v0.2.2 adds:**
- `list_capabilities` (FU-304) — Dynamic capability discovery
**Total MCP Actions:**
- v0.1.0: 13 actions
- v1.0.0: 15 actions (adds provider integrations)
- v0.2.2: 16 actions (adds `list_capabilities`)
**Status**: ✅ Included in v0.2.2
See `docs/releases/v0.1.0/mcp_actions_status.md` for complete MCP action catalog.



