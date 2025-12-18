# Release v0.1.1 — Integration Tests

**Release ID**: v0.1.1  
**Release Name**: Documentation & Support System  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)

---

## Purpose

This document defines integration tests that validate cross-FU functionality for the Documentation & Support System release. Tests verify end-to-end workflows spanning documentation generation, web serving, MCP endpoint, and support agent. Production deployment to neotoma.io is validated separately in acceptance criteria.

---

## Test Execution

Tests are executed automatically by the release orchestrator after batch completion. Test commands are defined in the `test:` field for each test.

---

## Integration Test Catalog

### IT-001: Documentation Generation → Web Viewing Flow

**Goal:** Verify that documentation generation produces comprehensive, accurate documentation that is accessible via web interface with a functional landing page.

**Batches Covered:** 0, 1

**FUs Involved:** FU-300, FU-301

**Test Steps:**

1. Run documentation generation process (FU-300)
2. Verify documentation files generated in output directory
3. Verify documentation covers all major topics:
   - Architecture overview
   - API reference (all MCP actions)
   - Feature unit specifications
   - Developer guides
   - Integration guides
   - Troubleshooting and FAQ
4. Start documentation web server (FU-301)
5. Access landing page at root URL
6. Verify landing page displays:
   - Key information from README.md (what Neotoma is, problems solved, who it's for)
   - Core workflow and architecture overview
   - Key features and capabilities
   - Directory access to documentation
   - MCP setup instructions
   - Quick links to essential documentation
7. Verify directory browsing functional (navigate to documentation categories)
8. Verify MCP setup instructions are accessible and clear
9. Access documentation via web interface
10. Verify page load performance (< 200ms p95)
11. Verify navigation functional
12. Verify cross-links work correctly

**Expected Results:**

- Documentation generated successfully
- All major topics covered
- Landing page accessible and displays key information
- Directory access functional
- MCP setup instructions available
- Web interface accessible
- Page load performance within target
- Navigation and cross-links functional

**Machine-Checkable:**

```bash
test: "tests/integration/documentation_web.test.ts"
```

**Status:** ⏳ not_run

---

### IT-009: Landing Page Functionality

**Goal:** Verify that the one-page landing website presents key README information, provides directory access, and includes clear MCP setup instructions.

**Batches Covered:** 1

**FUs Involved:** FU-301

**Test Steps:**

1. Ensure documentation generated and web server operational
2. Access landing page at root URL
3. Verify landing page content:
   - What Neotoma is (Truth Layer for AI Memory)
   - Problems solved (fragmented data, no AI memory, etc.)
   - Target users (AI-native individuals, knowledge workers, teams)
   - Core workflow overview
   - Architecture overview (five-layer architecture)
   - Key features (MVP and post-MVP)
   - Core principles
4. Verify directory access:
   - Documentation organized by category visible
   - Links to documentation sections functional
   - Directory browsing works
5. Verify MCP setup instructions:
   - Step-by-step guide present
   - Configuration examples provided
   - Links to detailed MCP documentation
   - Instructions actionable and clear
6. Verify quick links:
   - Links to getting started guide
   - Links to MVP overview
   - Links to architecture docs
   - All links functional
7. Verify responsive design (basic mobile view)

**Expected Results:**

- Landing page displays all key README information
- Design system compliance verified
- Accessibility requirements met
- Directory access functional
- MCP setup instructions clear and actionable
- Quick links functional
- Page responsive and visually clear

**Machine-Checkable:**

```bash
test: "tests/integration/landing_page.test.ts"
```

**Status:** ⏳ not_run

---

### IT-002: Support Query → Agent Response Flow

**Goal:** Verify that MCP support queries trigger support agent to retrieve relevant documentation context and generate accurate responses with citations.

**Batches Covered:** 2, 3

**FUs Involved:** FU-302, FU-303

**Test Steps:**

1. Ensure documentation generated and indexed (FU-300, FU-301)
2. Ensure MCP support endpoint operational (FU-302)
3. Ensure support agent system operational (FU-303)
4. Query MCP `query_support` action with test question:
   - "How do I upload a file via MCP?"
5. Verify agent retrieves relevant documentation context
6. Verify response includes accurate answer
7. Verify response includes citations to source documentation
8. Verify response format follows MCP response schema

**Expected Results:**

- MCP endpoint accepts query
- Agent retrieves relevant context
- Response accurate and helpful
- Citations present and correct
- Response format valid

**Machine-Checkable:**

```bash
test: "tests/integration/support_agent.test.ts"
```

**Status:** ⏳ not_run

---

### IT-003: Documentation Update → Support Agent Knowledge Flow

**Goal:** Verify that documentation updates are reflected in support agent knowledge base after regeneration.

**Batches Covered:** 0, 1, 3

**FUs Involved:** FU-300, FU-301, FU-303

**Test Steps:**

1. Generate initial documentation (FU-300)
2. Start web server and support agent (FU-301, FU-303)
3. Query support agent with question about specific feature
4. Record initial response
5. Update source documentation (add new section or modify existing)
6. Regenerate documentation (FU-300)
7. Restart support agent with updated documentation
8. Query support agent with same question
9. Verify response reflects updated documentation

**Expected Results:**

- Initial response recorded
- Documentation updated successfully
- Support agent uses updated documentation
- Response reflects changes

**Machine-Checkable:**

```bash
test: "tests/integration/documentation_update.test.ts"
```

**Status:** ⏳ not_run

---

### IT-004: Multi-Topic Support Query Flow

**Goal:** Verify that support agent handles complex multi-part questions by retrieving context from multiple documentation sections.

**Batches Covered:** 3

**FUs Involved:** FU-303

**Test Steps:**

1. Ensure documentation generated and support agent operational
2. Query support agent with complex multi-part question:
   - "How do I set up MCP integration and what are the available actions?"
3. Verify agent retrieves context from multiple documentation sections:
   - MCP setup guide
   - MCP action catalog
4. Verify response addresses all parts of question
5. Verify citations reference correct documentation sections

**Expected Results:**

- Agent retrieves multiple context sections
- Response addresses all question parts
- Citations reference correct sections
- Response coherent and comprehensive

**Machine-Checkable:**

```bash
test: "tests/integration/multi_topic_support.test.ts"
```

**Status:** ⏳ not_run

---

### IT-005: Documentation Search Functionality

**Goal:** Verify that documentation search returns relevant results quickly.

**Batches Covered:** 1

**FUs Involved:** FU-301

**Test Steps:**

1. Ensure documentation generated and web server operational
2. Perform search queries:
   - "MCP actions"
   - "entity resolution"
   - "file upload"
3. Verify search returns relevant results
4. Verify search query response time < 500ms (p95)
5. Verify search results ranked by relevance
6. Verify search highlights matching terms

**Expected Results:**

- Search returns relevant results
- Response time within target
- Results ranked appropriately
- Matching terms highlighted

**Machine-Checkable:**

```bash
test: "tests/integration/documentation_search.test.ts"
```

**Status:** ⏳ not_run

---

### IT-006: Support Agent Accuracy Validation

**Goal:** Verify that support agent achieves >= 80% accuracy on test query set.

**Batches Covered:** 3

**FUs Involved:** FU-303

**Test Steps:**

1. Prepare test query set (20+ queries covering common support topics)
2. Ensure support agent operational
3. Execute each test query via MCP endpoint
4. Evaluate responses for accuracy (manual or automated)
5. Calculate accuracy rate (correct responses / total queries)
6. Verify accuracy >= 80%

**Expected Results:**

- Test query set prepared
- All queries executed successfully
- Accuracy rate >= 80%
- Incorrect responses analyzed for improvement

**Machine-Checkable:**

```bash
test: "tests/integration/support_agent_accuracy.test.ts"
```

**Status:** ⏳ not_run

---

### IT-007: MCP Endpoint Protocol Compliance

**Goal:** Verify that MCP support endpoint follows MCP protocol specification.

**Batches Covered:** 2

**FUs Involved:** FU-302

**Test Steps:**

1. Ensure MCP support endpoint operational
2. Test request validation:
   - Valid request accepted
   - Invalid request rejected with appropriate error
3. Test response format:
   - Response follows MCP response schema
   - Error responses use ErrorEnvelope format
4. Test error handling:
   - Network errors handled gracefully
   - Invalid queries return helpful errors
5. Verify MCP protocol compliance (check against MCP spec)

**Expected Results:**

- Request validation functional
- Response format compliant
- Error handling appropriate
- Protocol compliance verified

**Machine-Checkable:**

```bash
test: "tests/integration/mcp_support_endpoint.test.ts"
```

**Status:** ⏳ not_run

---

### IT-008: Documentation Generation Determinism

**Goal:** Verify that documentation generation is deterministic (same repo state → same docs).

**Batches Covered:** 0

**FUs Involved:** FU-300

**Test Steps:**

1. Capture repository state (commit hash)
2. Run documentation generation
3. Record generated documentation (file hashes)
4. Run documentation generation again (same repo state)
5. Compare generated documentation (should be identical)
6. Repeat 10 times to verify consistency

**Expected Results:**

- Same repo state produces identical documentation
- File hashes match across runs
- No non-deterministic content (timestamps, random IDs, etc.)

**Machine-Checkable:**

```bash
test: "tests/integration/documentation_determinism.test.ts"
```

**Status:** ⏳ not_run

---

## Test Summary

| Test ID | Name                                                | Status     | FUs Tested             | Description                                        |
| ------- | --------------------------------------------------- | ---------- | ---------------------- | -------------------------------------------------- |
| IT-001  | Documentation Generation → Web Viewing Flow         | ⏳ not_run | FU-300, FU-301         | Verify documentation generation and web serving    |
| IT-002  | Support Query → Agent Response Flow                 | ⏳ not_run | FU-302, FU-303         | Verify MCP support endpoint and agent integration  |
| IT-003  | Documentation Update → Support Agent Knowledge Flow | ⏳ not_run | FU-300, FU-301, FU-303 | Verify documentation updates reflected in agent    |
| IT-004  | Multi-Topic Support Query Flow                      | ⏳ not_run | FU-303                 | Verify complex multi-part question handling        |
| IT-005  | Documentation Search Functionality                  | ⏳ not_run | FU-301                 | Verify search performance and relevance            |
| IT-006  | Support Agent Accuracy Validation                   | ⏳ not_run | FU-303                 | Verify support agent accuracy >= 80%               |
| IT-007  | MCP Endpoint Protocol Compliance                    | ⏳ not_run | FU-302                 | Verify MCP protocol compliance                     |
| IT-008  | Documentation Generation Determinism                | ⏳ not_run | FU-300                 | Verify deterministic documentation generation      |
| IT-009  | Landing Page Functionality                          | ⏳ not_run | FU-301                 | Verify landing page with README info and MCP setup |

**Summary:** 0/9 tests passed

---

## Manual Validation Requirements

**Documentation Web Interface:**

- Access documentation via web browser
- Verify visual design and readability
- Test navigation and cross-links manually
- Verify mobile responsiveness (basic)

**Support Agent via MCP:**

- Connect MCP client (Cursor/ChatGPT) to Neotoma MCP server
- Query support agent via `query_support` action
- Verify response quality and citations
- Test various question types (API usage, troubleshooting, architecture)

---









