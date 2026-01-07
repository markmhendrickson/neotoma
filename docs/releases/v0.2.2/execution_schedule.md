# Release v0.2.2 — Execution Schedule
**Release ID**: v0.2.2  
**Release Name**: list_capabilities MCP Action  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)  
**Generated**: 2025-12-31
## Execution Strategy
- **Type**: Single Feature Unit
- **Max Parallel FUs**: 1 (single FU release)
- **Max High-Risk FUs in Parallel**: 1
## Batch Execution Plan
#### Batch 0: list_capabilities MCP Action
**Feature Units:**
- `FU-304`: MCP Action — `list_capabilities`
**Dependencies:**
- FU-200 (MCP Server Core from v0.1.0) — completed in v0.1.0
**Description:**
New MCP action for dynamic capability discovery. Enables integrations to programmatically discover available capabilities, their schemas, field requirements, and entity extraction rules. Returns all available capabilities with:
- Capability ID, intent, version
- Primary entity type and schema version
- Canonicalization fields (used for deduplication)
- Entity extraction rules (which entities are automatically extracted)
- Example payloads for each capability type
Supports filtering by intent and version for targeted discovery.
**Acceptance Criteria:**
- `list_capabilities` MCP action returns all 5 capabilities with complete metadata
- Filtering by intent and version works correctly
- Response structure matches MCP specification
- Example payloads provided for all 5 capabilities
- `submit_payload` tool description references `list_capabilities`
- Response time < 100ms (capability registry is static)
- No breaking changes to existing MCP actions
- Backward compatible (existing integrations continue to work)
**Implementation Tasks:**
1. Add `list_capabilities` tool definition to MCP server tools array
2. Add switch case handler for `list_capabilities` in CallToolRequestSchema
3. Implement `listCapabilities()` private method with filtering logic
4. Add `generateExamplePayload()` helper method
5. Enhance `submit_payload` tool description to reference `list_capabilities`
6. Update `capability_id` and `body` field descriptions with discovery guidance
7. Update MCP specification documentation with new action
8. Add integration tests for discovery → submission workflows
**Estimated Duration**: 4-6 hours
**Code Changes:**
- `src/server.ts`: Add tool definition, handler, and implementation
- `docs/specs/MCP_SPEC.md`: Add `list_capabilities` specification
- `tests/integration/list_capabilities.test.ts`: Add integration tests (new file)
**Testing Strategy:**
- Unit tests: Filtering logic, example payload generation
- Integration tests: Full discovery → submission workflows
- Protocol tests: MCP protocol compliance
- Backward compatibility tests: Existing integrations unaffected
- Performance tests: Response time < 100ms
## Checkpoint 1: Pre-Release Sign-Off
**After Batch 0 Completion:**
**Validation Steps:**
1. Review implementation against plan
2. Verify all acceptance criteria met
3. Run full integration test suite
4. Verify backward compatibility
5. Check MCP specification updated
6. Validate production readiness
**Decision Points:**
- ✅ All tests passing?
- ✅ MCP specification updated?
- ✅ Backward compatibility validated?
- ✅ Response times within target?
- ✅ Example payloads valid?
**Sign-Off Required Before:**
- Deployment to production (neotoma.io)
- Marking release as `ready_for_deployment`
## Release Timeline
**Estimated Timeline:**
- **Batch 0**: 4-6 hours (implementation + testing)
- **Checkpoint 1**: 1 hour (validation + sign-off)
- **Total**: 5-7 hours
**Critical Path:**
- FU-304 implementation → integration tests → MCP spec update → sign-off → deployment
## Risk Assessment
**Risk Level**: Low
**Justification:**
- Single FU release (isolated scope)
- Additive feature (no breaking changes)
- Uses existing capability registry (no new infrastructure)
- No database changes required
- No UI changes (MCP-only)
- Backward compatible (existing integrations continue to work)
**Mitigation Strategies:**
- Comprehensive integration tests before deployment
- Backward compatibility validation with existing tests
- Response schema validation against specification
- Example payload validation against capability schemas
## Dependencies
**External Dependencies:**
- FU-200 (MCP Server Core from v0.1.0) — ✅ Completed
**Internal Dependencies:**
- Existing capability registry (`src/services/capability_registry.ts`) — ✅ Available
- Existing `listCapabilities()` function — ✅ Available
- MCP protocol infrastructure — ✅ Available
**No blockers identified.**
## Post-Execution
**After Batch 0:**
1. Run full integration test suite
2. Validate backward compatibility
3. Check response times (target: < 100ms)
4. Verify example payloads
5. Review MCP specification updates
6. Complete Checkpoint 1 validation
**On Success:**
- Mark release as `ready_for_deployment`
- Deploy to production (neotoma.io)
- Mark release as `deployed`
- Run post-deployment validation
- Mark release as `completed`
**On Failure:**
- Review failure mode (see Pre-Mortem in manifest.yaml)
- Apply mitigation strategy
- Re-run affected tests
- If mitigation fails, rollback per rollback plan




