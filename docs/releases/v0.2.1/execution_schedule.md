# Release v0.2.1 — Execution Schedule
**Release ID**: v0.2.1  
**Release Name**: Documentation & Support System  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)  
**Generated**: 2025-12-10
## Execution Strategy
- **Type**: Multi-agent parallel execution
- **Max Parallel FUs**: 2
- **Max High-Risk FUs in Parallel**: 1
## Batch Execution Plan
#### Batch 0: Documentation Generation
**Feature Units:**
- `FU-300`: AI-Powered Documentation Analysis & Generation
**Dependencies:**
- None (can start immediately)
**Description:**
AI-powered repository analysis and comprehensive documentation generation. Analyzes codebase structure, architecture, APIs, and workflows to generate static documentation in markdown/HTML format.
**Acceptance Criteria:**
- Repository analysis completes successfully
- Comprehensive documentation generated covering all major topics
- Documentation output deterministic (same repo state → same docs)
- Documentation includes API references, architecture diagrams, guides
**Estimated Duration**: 8-12 hours
#### Batch 1: Documentation Web Server
**Feature Units:**
- `FU-301`: Static Documentation Web Server
**Dependencies:**
- `FU-300` (Documentation Generation)
**Description:**
One-page landing website presenting key information from README.md with directory access to documentation and MCP setup instructions, plus static file serving for generated documentation with search functionality, navigation, and cross-linking.
**Acceptance Criteria:**
- One-page landing website accessible at root URL
- Landing page displays key README information clearly
- Design system compliance (colors, typography, spacing, components per `docs/ui/design_system.md`)
- Accessibility requirements met (WCAG AA, keyboard navigation, ARIA labels)
- Dark mode support functional
- Directory access to documentation functional
- MCP setup instructions available and clear
- Static documentation served via web server
- Page load performance < 200ms (p95)
- Search functionality operational
- Cross-links functional
- Navigation usable
**Estimated Duration**: 6-8 hours (includes landing page development with design system implementation)
#### Batch 2: MCP Support Inquiry Endpoint
**Feature Units:**
- `FU-302`: MCP Support Inquiry Endpoint
**Dependencies:**
- `FU-200` (MCP Server Core from v0.1.0)
**Description:**
New MCP action `query_support` for support inquiries. Implements request/response schema, error handling, and validation following MCP protocol specification.
**Acceptance Criteria:**
- MCP `query_support` action implemented
- Request/response schema validated
- Error handling functional
- MCP protocol compliance verified
- Integration tests passing
**Estimated Duration**: 4-6 hours
#### Batch 3: Support Agent System
**Feature Units:**
- `FU-303`: Support Agent System
**Dependencies:**
- `FU-300` (Documentation Generation)
- `FU-301` (Documentation Web Server)
- `FU-302` (MCP Support Endpoint)
**Description:**
RAG-based support agent using static documentation as knowledge base. Implements query understanding, context retrieval, response generation with citations, and integration with MCP endpoint.
**Acceptance Criteria:**
- Support agent operational
- Response accuracy >= 80% on test queries
- Responses include citations to source documentation
- Context retrieval functional
- Integration with MCP endpoint working
**Estimated Duration**: 8-12 hours
## Checkpoint Schedule
### Checkpoint 1 — Documentation Review
**Trigger**: After Batch 1 completion
**Review Items:**
- Documentation completeness (all major topics covered)
- Documentation accuracy (validated against source code)
- Web interface usability
- Search functionality quality
**Gate**: Proceed to Batch 2 only if documentation quality meets standards.
### Checkpoint 2 — Pre-Release Sign-Off
**Trigger**: After Batch 3 completion
**Review Items:**
- All acceptance criteria met
- Support agent accuracy validated
- Integration tests passing
- Performance metrics within targets
- Production deployment plan reviewed (neotoma.io)
**Gate**: Release ready for production deployment to neotoma.io if all criteria met. (No marketing activities required for not marketed release.)
## Parallelization Opportunities
- **Batch 0** can run independently (no dependencies)
- **Batch 1** must wait for Batch 0
- **Batch 2** can run in parallel with Batch 1 (depends on v0.1.0 FU-200, not Batch 1)
- **Batch 3** must wait for Batches 1 and 2
**Optimized Schedule:**
- Start: Batch 0
- After Batch 0: Start Batches 1 and 2 in parallel
- After Batches 1 and 2: Start Batch 3
## Risk Assessment
**High-Risk FUs:**
- None (all FUs are low or medium risk)
**Medium-Risk FUs:**
- `FU-300`: AI-powered analysis complexity
- `FU-303`: Support agent accuracy requirements
**Low-Risk FUs:**
- `FU-301`: Standard static file serving
- `FU-302`: Standard MCP action implementation
## Estimated Total Duration
- **Sequential**: 24-36 hours
- **Optimized Parallel**: 16-24 hours (Batches 1 and 2 run in parallel)
