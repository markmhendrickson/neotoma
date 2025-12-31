## Release v0.9.0 — MCP Support System
### 1. Release Overview
- **Release ID**: `v0.9.0`
- **Name**: MCP Support System
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Add MCP-based support inquiry system with RAG agent that uses generated documentation as knowledge base. Enables users to get help without leaving their AI tool environment.
- **Priority**: P1 (user experience enhancement)
- **Target Ship Date**: Before v1.0.0 MVP release
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.0 Guiding Principle
> Enable seamless support within the MCP environment before public MVP launch.

This release completes the user enablement stack: documentation (v0.2.1) provides the knowledge base, and support system (v0.9.0) makes it queryable via MCP.

#### 1.1 Canonical Specs (Authoritative Sources)
- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **MVP Overview**: `docs/specs/MVP_OVERVIEW.md`
- **MCP Specification**: `docs/specs/MCP_SPEC.md`
- **Documentation Standards**: `docs/conventions/documentation_standards.md`

This release plan coordinates the MCP support system scope into a concrete release plan.

### 2. Scope

#### 2.1 Included Feature Units (Deferred from v0.2.1)

**MCP Support System:**
- `FU-302`: MCP Support Inquiry Endpoint
  - New MCP action: `query_support`
  - Request/response schema for support queries
  - Error handling and validation
  - Integration with support agent
  
- `FU-303`: Support Agent System
  - RAG-based agent using static documentation as knowledge base
  - Query understanding and intent classification
  - Context retrieval from documentation index
  - Response generation with citations and guidance
  - Integration with MCP endpoint

#### 2.2 Dependencies

**Required from Previous Releases:**
- v0.2.1: FU-300 (Documentation generation) - provides knowledge base
- v0.2.1: FU-301 (Documentation web server) - provides searchable index
- v0.1.0: FU-200 (MCP Server Core) - provides MCP protocol foundation

#### 2.3 Explicitly Excluded
- Chat UI for support (MCP-only access)
- Real-time human support escalation
- Multi-language support (English only)
- User-contributed documentation search
- Support ticket system

### 3. Release-Level Acceptance Criteria

#### 3.1 Product
- MCP `query_support` action operational and accessible via MCP clients
- Support agent responds accurately to common inquiries:
  - API usage questions
  - Architecture questions
  - Troubleshooting guidance
  - Integration setup help
- Support agent responses include citations to source documentation
- Support agent handles edge cases gracefully (unclear queries, missing context)

#### 3.2 Technical
- MCP endpoint follows MCP protocol specification
- Support agent accuracy validated (80%+ correct responses on test queries)
- Support agent responses cite source documentation with links
- Response time < 3 seconds (p95)
- RAG retrieval accuracy validated
- Documentation index integration functional
- Error handling for malformed queries
- Graceful degradation when documentation unavailable

#### 3.3 Business
- Users can query support via MCP without leaving their AI tool
- Support burden reduced through automated guidance
- User satisfaction improved through immediate, contextual help

### 4. Cross-FU Integration Scenarios

These scenarios must pass end-to-end before v0.9.0 is approved:

1. **Support Query → Agent Response**
   - Query MCP `query_support` action with question
   - Verify agent retrieves relevant documentation context
   - Verify response includes accurate answer with citations
   - Verify response format follows MCP response schema

2. **Documentation Update → Support Agent Knowledge**
   - Update source documentation
   - Regenerate static documentation
   - Query support agent with question about updated content
   - Verify agent uses updated documentation in response

3. **Multi-Topic Support Query**
   - Query support agent with complex multi-part question
   - Verify agent retrieves context from multiple documentation sections
   - Verify response addresses all parts of question
   - Verify citations reference correct documentation sections

4. **Edge Case Handling**
   - Query with unclear/ambiguous question
   - Query about undocumented feature
   - Query with no relevant documentation
   - Verify graceful responses in all cases

### 5. Implementation Plan

#### Phase 1: MCP Support Endpoint (1 week)
**Tasks:**
- [ ] Define `query_support` MCP action schema
- [ ] Implement MCP endpoint handler
- [ ] Add request validation
- [ ] Add error handling
- [ ] Integration with support agent service
- [ ] Unit tests for endpoint

**Acceptance Criteria:**
- Endpoint callable via MCP
- Request/response schema validated
- Error handling functional
- Unit tests passing

#### Phase 2: Support Agent System (2 weeks)
**Tasks:**
- [ ] Implement RAG retrieval from documentation index
- [ ] Implement query understanding logic
- [ ] Implement response generation with citations
- [ ] Add context retrieval optimization
- [ ] Integration with MCP endpoint
- [ ] Test query accuracy on sample questions

**Acceptance Criteria:**
- Agent retrieves relevant documentation
- Responses include citations
- 80%+ accuracy on test queries
- Response time < 3s (p95)

#### Phase 3: Testing & Validation (1 week)
**Tasks:**
- [ ] Create test query dataset (50+ questions)
- [ ] Validate response accuracy
- [ ] Validate citation quality
- [ ] End-to-end integration tests
- [ ] Performance testing
- [ ] Edge case testing

**Acceptance Criteria:**
- All integration tests passing
- Accuracy threshold met (80%+)
- Performance targets met
- Edge cases handled gracefully

### 6. Success Criteria

**Release is Complete When:**
1. ✅ MCP `query_support` action implemented and tested
2. ✅ Support agent system operational
3. ✅ Support agent accuracy validated (80%+ on test queries)
4. ✅ Support agent responses include citations
5. ✅ Integration tests passing (4 scenarios)
6. ✅ Performance targets met (< 3s response time)
7. ✅ Edge case handling validated
8. ✅ Deployed to production (neotoma.io)

### 7. Dependencies

**Upstream:**
- v0.2.1: Documentation generation and web server must be complete
- v0.1.0: MCP server core must be operational

**Downstream:**
- v1.0.0: Support system ready for MVP users

### 8. Rollback Plan

If issues are discovered:
1. Disable `query_support` MCP action (remove from tool list)
2. Redirect users to web documentation
3. Fix issues and redeploy

### 9. Testing Strategy

**Unit Tests:**
- MCP endpoint validation
- RAG retrieval logic
- Response formatting
- Citation extraction

**Integration Tests:**
- Full query → response flow
- Documentation index integration
- MCP protocol compliance
- Multi-topic queries

**Accuracy Tests:**
- 50+ test queries covering:
  - API usage questions
  - Architecture questions
  - Troubleshooting scenarios
  - Integration setup
- Validation: 80%+ correct responses

### 10. Timeline

- **Week 1:** MCP Support Endpoint (FU-302)
- **Week 2-3:** Support Agent System (FU-303)
- **Week 4:** Testing & Validation

**Total Duration:** 4 weeks

### 11. Release Spacing Context

| Release | Focus | Status |
|---------|-------|--------|
| v0.2.1 | Documentation generation & web server | Prerequisite |
| v0.6.0 | Complete architecture migration | Planned |
| **v0.9.0** | **MCP support system** | **This release** |
| v1.0.0 | MVP (public release) | Next major |

### 12. Status
- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Gate**: v0.2.1 must be complete (documentation available)
- **Notes**:
  - Split from original v0.2.1 scope
  - Support capabilities moved closer to v1.0.0 MVP
  - Documentation foundation in v0.2.1 enables this release
  - Improves user experience for v1.0.0 launch

