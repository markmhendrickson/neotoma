# Release v0.2.1 — Acceptance Criteria

**Release ID**: v0.2.1  
**Release Name**: Documentation & Support System  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)

---

## Product Acceptance Criteria

### P-001: One-Page Landing Website

**Criterion:** One-page landing website accessible at root URL presenting key information from README.md with directory access to documentation and MCP setup instructions.

**Validation:**

- Landing page displays:
  - What Neotoma is and problems it solves
  - Target users and use cases
  - Core workflow and architecture overview
  - Key features and capabilities
  - Directory access to documentation organized by category
  - MCP setup instructions with step-by-step guide
  - Quick links to essential documentation
- Landing page follows design system (`docs/ui/design_system.md`):
  - Colors: Neutral grays, blue accents (#0066CC primary)
  - Typography: Inter for UI, JetBrains Mono for code/data
  - Spacing: 4px base unit scale
  - Components: shadcn/ui components where applicable
  - Dark mode support
  - Accessibility: WCAG AA compliance (keyboard nav, ARIA, contrast)
  - Brand alignment: Minimal, technical, trustworthy, deterministic
- Landing page is responsive and visually clear
- Directory browsing functional
- MCP setup instructions accessible and actionable

**Test:** `tests/integration/landing_page.test.ts`

**Status:** ⏳ pending

---

### P-002: Comprehensive Documentation Available

**Criterion:** Comprehensive documentation available via web interface covering all major topics.

**Validation:**

- Documentation covers:
  - Architecture overview and system design
  - API reference (all MCP actions, request/response schemas)
  - Feature unit specifications
  - Developer guides (getting started, workflows, testing)
  - Integration guides (MCP setup, provider integrations)
  - Troubleshooting and FAQ
- Documentation accessible via web interface
- Documentation searchable and navigable

**Test:** `tests/integration/documentation_web.test.ts`

**Status:** ⏳ pending

---

### P-003: Support Agent Accuracy

**Criterion:** Support agent responds accurately to common inquiries (80%+ accuracy).

**Validation:**

- Test query set prepared (20+ queries covering common topics)
- Support agent accuracy >= 80% on test queries
- Responses include citations to source documentation
- Responses helpful and actionable

**Test:** `tests/integration/support_agent_accuracy.test.ts`

**Metric:** `support_agent_accuracy >= 0.80`

**Status:** ⏳ pending

---

### P-004: Documentation Search Functional

**Criterion:** Documentation search returns relevant results quickly.

**Validation:**

- Search queries return relevant results
- Search response time < 500ms (p95)
- Results ranked by relevance
- Matching terms highlighted

**Test:** `tests/integration/documentation_search.test.ts`

**Status:** ⏳ pending

---

### P-005: MCP Support Endpoint Operational

**Criterion:** MCP support endpoint operational and accessible via MCP clients.

**Validation:**

- MCP `query_support` action accessible via MCP clients
- Request/response schema validated
- Error handling functional
- Integration with support agent working

**Test:** `tests/integration/mcp_support_endpoint.test.ts`

**Status:** ⏳ pending

---

## Technical Acceptance Criteria

### T-000: Design System Compliance (All UI Work)

**Criterion:** All UI-related work MUST follow the design system (`docs/ui/design_system.md`).

**Validation:**

- All UI components use design system colors (neutral grays, blue accents #0066CC)
- Typography follows design system (Inter for UI, JetBrains Mono for code/data)
- Spacing uses 4px base unit scale
- Components use shadcn/ui where applicable, aligned with design system
- Dark mode support functional
- Accessibility: WCAG AA compliance verified (keyboard navigation, ARIA labels, contrast)
- Brand alignment: Minimal, technical, trustworthy, deterministic aesthetic

**Test:** `tests/integration/design_system_compliance.test.ts`

**Status:** ⏳ pending

**Note:** This criterion applies to ALL UI work in this release, not just the landing page.

---

### T-001: All P0 Feature Units Complete

**Criterion:** All P0 Feature Units deployed and passing tests.

**Validation:**

- FU-300: Documentation Generation — Complete
- FU-301: Documentation Web Server — Complete
- FU-302: MCP Support Endpoint — Complete
- FU-303: Support Agent System — Complete
- All unit tests passing
- All integration tests passing

**Metric:** `SELECT COUNT(*) FROM feature_units WHERE priority='P0' AND status='completed' = 4`

**Status:** ⏳ pending

---

### T-002: Documentation Generation Deterministic

**Criterion:** Documentation generation deterministic (same repo state → same docs).

**Validation:**

- Same repository state produces identical documentation
- File hashes match across multiple runs
- No non-deterministic content (timestamps, random IDs)

**Test:** `tests/integration/documentation_determinism.test.ts`

**Status:** ⏳ pending

---

### T-003: Static Documentation Performance

**Criterion:** Static documentation served efficiently (< 200ms page load).

**Validation:**

- Page load time p95 < 200ms
- Static file serving optimized
- Caching headers configured appropriately

**Test:** `tests/integration/documentation_performance.test.ts`

**Metric:** `page_load_p95 < 200`

**Status:** ⏳ pending

---

### T-004: Documentation Search Performance

**Criterion:** Documentation search responsive (< 500ms query response).

**Validation:**

- Search query response time p95 < 500ms
- Search index optimized
- Query processing efficient

**Test:** `tests/integration/documentation_search.test.ts`

**Metric:** `search_query_p95 < 500`

**Status:** ⏳ pending

---

### T-005: Support Agent Citations

**Criterion:** Support agent responses cite source documentation.

**Validation:**

- All responses include citations
- Citations reference correct documentation sections
- Citation format consistent

**Test:** `tests/integration/support_agent.test.ts`

**Metric:** `citation_rate >= 1.0`

**Status:** ⏳ pending

---

### T-006: MCP Protocol Compliance

**Criterion:** MCP endpoint follows MCP protocol specification.

**Validation:**

- Request validation functional
- Response format compliant with MCP spec
- Error responses use ErrorEnvelope format
- Protocol compliance verified

**Test:** `tests/integration/mcp_support_endpoint.test.ts`

**Status:** ⏳ pending

---

### T-007: Build Process Integration

**Criterion:** Documentation generation integrated into build/release process.

**Validation:**

- Documentation generation runs automatically on build
- Build fails if documentation generation fails
- Generated documentation committed or deployed appropriately

**Metric:** `Documentation generation runs automatically on build`

**Status:** ⏳ pending

---

### T-008: Production Deployment

**Criterion:** Release deployed to neotoma.io with all components operational.

**Validation:**

- Landing page accessible at neotoma.io root URL
- Documentation accessible at neotoma.io/docs
- MCP support endpoint operational and accessible
- All links and navigation functional
- Performance metrics within targets (< 200ms page load, < 500ms search)
- SSL/TLS configured correctly
- Domain DNS configured correctly

**Metric:** `Deployment successful to neotoma.io`

**Status:** ⏳ pending

---

## Business Acceptance Criteria

### B-001: User Self-Service via Documentation

**Criterion:** Users can self-serve answers via documentation web interface.

**Validation:**

- Users can find answers to common questions in documentation
- Documentation clear and actionable
- Web interface usable and intuitive

**Metric:** `Manual validation via web interface`

**Status:** ⏳ pending

---

### B-002: MCP Support Access

**Criterion:** Users can query support via MCP without leaving their AI tool.

**Validation:**

- Users can query support via MCP from Cursor/ChatGPT
- Responses helpful and accurate
- Citations enable further self-service

**Metric:** `Manual validation via MCP client`

**Status:** ⏳ pending

---

## Acceptance Criteria Summary

| Category  | Criteria                           | Status     |
| --------- | ---------------------------------- | ---------- |
| Product   | P-001: One-Page Landing Website    | ⏳ pending |
| Product   | P-002: Comprehensive Documentation | ⏳ pending |
| Product   | P-003: Support Agent Accuracy      | ⏳ pending |
| Product   | P-004: Documentation Search        | ⏳ pending |
| Product   | P-005: MCP Support Endpoint        | ⏳ pending |
| Technical | T-000: Design System Compliance    | ⏳ pending |
| Technical | T-001: All P0 FUs Complete         | ⏳ pending |
| Technical | T-002: Documentation Determinism   | ⏳ pending |
| Technical | T-003: Documentation Performance   | ⏳ pending |
| Technical | T-004: Search Performance          | ⏳ pending |
| Technical | T-005: Support Agent Citations     | ⏳ pending |
| Technical | T-006: MCP Protocol Compliance     | ⏳ pending |
| Technical | T-007: Build Process Integration   | ⏳ pending |
| Technical | T-008: Production Deployment       | ⏳ pending |
| Business  | B-001: User Self-Service           | ⏳ pending |
| Business  | B-002: MCP Support Access          | ⏳ pending |

**Total:** 16 criteria  
**Passed:** 0  
**Pending:** 16

---
