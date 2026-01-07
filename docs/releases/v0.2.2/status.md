# Release v0.2.2 — Status
**Release ID**: v0.2.2  
**Release Name**: list_capabilities MCP Action  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)
## Current Status
**Status**: `planning`  
**Last Updated**: 2025-12-31  
**Owner**: Mark Hendrickson
## Release Summary
This release adds a new MCP action `list_capabilities` that enables integrations to dynamically discover available capabilities, their schemas, field requirements, and entity extraction rules. This enables programmatic discovery of supported data types without hardcoding capability IDs.
**Key Features:**
- New `list_capabilities` MCP action
- Dynamic capability discovery with filtering
- Complete metadata for all 5 capabilities
- Example payloads for each capability type
- Enhanced tool descriptions referencing capability discovery
- Backward compatible (no breaking changes)
## Feature Units Status
| FU ID   | Name                       | Priority | Status    | Dependencies | Notes                             |
| ------- | -------------------------- | -------- | --------- | ------------ | --------------------------------- |
| FU-304  | MCP Action — list_capabilities | P0       | planning  | FU-200       | Dynamic capability discovery      |
**Legend:**
- ⏳ `planning` — Release planning in progress
- 🔨 `in_progress` — Implementation underway
- ✅ `completed` — Feature unit complete and tested
- 🚀 `deployed` — Deployed to production
## Acceptance Criteria Status
### Product Criteria
- [ ] `list_capabilities` MCP action returns all 5 capabilities with complete metadata
- [ ] Filtering by intent and version works correctly
- [ ] Response structure matches MCP specification
- [ ] `submit_payload` tool description references `list_capabilities`
- [ ] Enhanced tool descriptions guide integrations on capability usage
- [ ] All 5 existing capabilities discoverable
### Technical Criteria
- [ ] MCP action follows MCP protocol specification
- [ ] Response structure matches specification in `docs/specs/MCP_SPEC.md`
- [ ] Filtering logic correctly filters capabilities by intent and version
- [ ] Example payloads generated for all 5 capabilities
- [ ] No breaking changes to existing MCP actions
- [ ] Backward compatible (existing integrations continue to work)
- [ ] Response time < 100ms (capability registry is static)
- [ ] All tests passing (unit, integration, MCP protocol tests)
### Business Criteria
- [ ] Integrations can discover available capabilities at runtime
- [ ] No hardcoded capability IDs required in integration code
- [ ] Self-documenting tool descriptions reduce support burden
- [ ] Enables dynamic adaptation to new capabilities without code changes
## Integration Tests Status
| Test ID | Name                                      | Status   | Notes |
| ------- | ----------------------------------------- | -------- | ----- |
| IT-001  | Capability Discovery → Payload Submission | not_run  | -     |
| IT-002  | Filtered Discovery → Payload Submission   | not_run  | -     |
| IT-003  | Tool Description Guidance                 | not_run  | -     |
| IT-004  | Example Payload Validation                | not_run  | -     |
| IT-005  | MCP Protocol Compliance                   | not_run  | -     |
| IT-006  | Backward Compatibility Validation         | not_run  | -     |
| IT-007  | Performance and Response Time             | not_run  | -     |
## Deployment Status
**Target**: Production (neotoma.io)  
**Deployed**: No  
**Deployment Date**: TBD
**Deployment Checklist:**
- [ ] All integration tests passing
- [ ] Backward compatibility validated
- [ ] MCP specification updated
- [ ] Response times within target (< 100ms p95)
- [ ] Example payloads validated
- [ ] Tool descriptions reviewed
- [ ] No breaking changes detected
- [ ] Pre-deployment sign-off complete
## Decision Log
**2025-12-31: Release Planning Initiated**
- Decision: Create v0.2.2 as patch release for `list_capabilities` MCP action
- Rationale: Small, focused release that enables integration discoverability without changing existing functionality
- Impact: Enhances integration developer experience, enables dynamic capability discovery
- Risk: Low (additive feature, no breaking changes)
## Risks and Mitigations
**Current Risks:**
1. **MCP Protocol Compliance** (Low)
   - Risk: New action may not fully comply with MCP protocol
   - Mitigation: Follow existing MCP action patterns, comprehensive protocol tests
   - Status: Not yet assessed
2. **Backward Compatibility** (Low)
   - Risk: Changes to tool descriptions may confuse existing integrations
   - Mitigation: Comprehensive backward compatibility tests, no breaking changes
   - Status: Not yet assessed
3. **Example Payload Quality** (Low)
   - Risk: Example payloads may not accurately represent capability requirements
   - Mitigation: Validate example payloads against capability schemas
   - Status: Not yet assessed
## Timeline
**Planned Timeline:**
- **2025-12-31**: Release planning initiated
- **TBD**: Implementation start (Batch 0)
- **TBD**: Implementation complete
- **TBD**: Checkpoint 1 (pre-release sign-off)
- **TBD**: Deploy to production (neotoma.io)
- **TBD**: Release complete
**Estimated Duration**: 5-7 hours (implementation + testing + deployment)
## Notes
- This is a not marketed release (no marketing activities)
- All releases deploy to production at neotoma.io
- Single FU release (FU-304 only)
- Builds on existing MCP server infrastructure (FU-200 from v0.1.0)
- Uses existing capability registry (`src/services/capability_registry.ts`)
- No new external dependencies required
- Backward compatible (existing integrations continue to work)




