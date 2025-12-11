# Release v0.1.1 — Feature Unit Overview

**Release ID**: v0.1.1  
**Release Name**: Documentation & Support System  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)

---

## Purpose

This document provides a high-level overview of the four new Feature Units in v0.1.1. Detailed specifications should be created for each FU following the standard Feature Unit specification format.

---

## Feature Unit Catalog

### FU-300: AI-Powered Documentation Analysis & Generation

**Priority:** P0  
**Risk Level:** Medium  
**Dependencies:** None

**Purpose:**
Generate comprehensive, static documentation derived from AI analysis of the repository. Analyzes codebase structure, architecture, APIs, workflows, and generates documentation in markdown/HTML format suitable for web viewing.

**Key Components:**

1. **Repository Analysis Engine**

   - Codebase structure analysis
   - Architecture pattern detection
   - API endpoint discovery
   - Workflow identification
   - Dependency mapping

2. **Documentation Generator**

   - API reference generation (MCP actions, request/response schemas)
   - Architecture documentation (diagrams, system design)
   - Feature unit documentation (specs, implementation guides)
   - Developer guides (getting started, workflows, testing)
   - Integration guides (MCP setup, provider integrations)
   - Troubleshooting and FAQ generation

3. **Documentation Indexer**
   - Content indexing for search
   - Cross-reference generation
   - Topic categorization
   - Metadata extraction

**Output:**

- Static markdown/HTML files
- Documentation index (searchable)
- Cross-reference map
- Version metadata

**Acceptance Criteria:**

- Comprehensive documentation generated covering all major topics
- Documentation deterministic (same repo state → same docs)
- Documentation includes API references, architecture diagrams, guides
- Documentation index created for search functionality

**Estimated Duration:** 8-12 hours

---

### FU-301: Static Documentation Web Server

**Priority:** P0  
**Risk Level:** Low  
**Dependencies:** FU-300 (Documentation Generation)

**Purpose:**
Serve statically-generated documentation files via web interface with a one-page landing website, search functionality, navigation, and cross-linking.

**Key Components:**

1. **One-Page Landing Website**

   - Root URL landing page presenting key information from README.md
   - What Neotoma is and problems it solves
   - Target users and use cases
   - Core workflow and architecture overview
   - Key features and capabilities
   - Directory access to documentation organized by category
   - MCP setup instructions with step-by-step guide
   - Quick links to essential documentation
   - Design system compliance:
     - Colors: Neutral grays, blue accents (#0066CC primary)
     - Typography: Inter for UI text, JetBrains Mono for code/data
     - Spacing: 4px base unit (8px, 16px, 24px, etc.)
     - Components: shadcn/ui components where applicable
     - Dark mode support
     - Accessibility: WCAG AA compliance (keyboard nav, ARIA, contrast)
     - Brand alignment: Minimal, technical, trustworthy, deterministic

2. **Static File Server**

   - Markdown/HTML file serving
   - Asset serving (images, CSS, JS)
   - Efficient file delivery (< 200ms page load)

3. **Search Functionality**

   - Full-text search across documentation
   - Query processing (< 500ms response)
   - Result ranking and highlighting
   - Search index management

4. **Navigation System**

   - Table of contents generation
   - Cross-link resolution
   - Breadcrumb navigation
   - Related content suggestions
   - Directory browsing interface

5. **Versioning Support**
   - Versioned documentation directories
   - Version selector UI
   - Version-specific navigation

**Acceptance Criteria:**

- One-page landing website accessible at root URL
- Landing page displays key README information clearly
- Design system compliance verified (colors, typography, spacing, components)
- Accessibility requirements met (WCAG AA, keyboard navigation, ARIA labels)
- Dark mode support functional
- Directory access to documentation functional
- MCP setup instructions available and clear
- Static documentation served via web server
- Page load performance < 200ms (p95)
- Search functionality operational
- Cross-links functional
- Navigation usable

**Estimated Duration:** 4-6 hours

---

### FU-302: MCP Support Inquiry Endpoint

**Priority:** P0  
**Risk Level:** Low  
**Dependencies:** FU-200 (MCP Server Core from v0.1.0)

**Purpose:**
Implement new MCP action `query_support` for support inquiries. Provides structured interface for users to query support via MCP clients.

**Key Components:**

1. **MCP Action Implementation**

   - Action name: `query_support`
   - Request schema validation (Zod)
   - Response schema definition
   - Error handling (ErrorEnvelope)

2. **Request Schema**

   ```typescript
   {
     query: string; // User's support question
     context?: {
       // Optional context (current action, error message, etc.)
     };
   }
   ```

3. **Response Schema**

   ```typescript
   {
     answer: string; // Agent-generated answer
     citations: Array<{
       title: string;
       url: string;
       excerpt?: string;
     }>;
     confidence?: number; // Optional confidence score
   }
   ```

4. **Integration**
   - Integration with support agent (FU-303)
   - Error handling and validation
   - MCP protocol compliance

**Acceptance Criteria:**

- MCP `query_support` action implemented
- Request/response schema validated
- Error handling functional
- MCP protocol compliance verified
- Integration tests passing

**Estimated Duration:** 4-6 hours

---

### FU-303: Support Agent System

**Priority:** P0  
**Risk Level:** Medium  
**Dependencies:** FU-300 (Documentation Generation), FU-301 (Documentation Web Server), FU-302 (MCP Support Endpoint)

**Purpose:**
RAG-based support agent that uses static documentation as knowledge base. Understands user queries, retrieves relevant context, and generates helpful responses with citations.

**Key Components:**

1. **Query Understanding**

   - Intent classification
   - Query preprocessing
   - Context extraction
   - Multi-part question handling

2. **Context Retrieval**

   - Documentation index search
   - Relevant section identification
   - Context ranking and selection
   - Multi-document context aggregation

3. **Response Generation**

   - Answer synthesis from context
   - Citation extraction
   - Response formatting
   - Confidence scoring (optional)

4. **Integration**
   - Integration with MCP endpoint (FU-302)
   - Documentation index access (FU-301)
   - Error handling and fallbacks

**Acceptance Criteria:**

- Support agent operational
- Response accuracy >= 80% on test queries
- Responses include citations to source documentation
- Context retrieval functional
- Integration with MCP endpoint working
- Multi-topic queries handled correctly

**Estimated Duration:** 8-12 hours

---

## Feature Unit Dependencies

```
FU-300 (Documentation Generation)
  └─> FU-301 (Documentation Web Server)

FU-200 (MCP Server Core from v0.1.0)
  └─> FU-302 (MCP Support Endpoint)

FU-300, FU-301, FU-302
  └─> FU-303 (Support Agent System)
```

---

## Implementation Notes

### Design System Compliance (All UI Work)

**CRITICAL:** All UI-related work in this release MUST follow the design system (`docs/ui/design_system.md`).

**Required Elements:**

- Colors: Neutral grays with blue accents (#0066CC primary), dark mode support
- Typography: Inter for UI text, JetBrains Mono for code/data
- Spacing: 4px base unit scale (8px, 16px, 24px, etc.)
- Components: shadcn/ui components where applicable, aligned with design system
- Dark Mode: Full support required
- Accessibility: WCAG AA compliance (keyboard navigation, ARIA labels, contrast)
- Brand Alignment: Minimal, technical, trustworthy, deterministic

**Verification:**

- Design system compliance must be verified in acceptance criteria
- Integration tests must verify design system compliance
- Code review must check design system adherence

### Documentation Generation (FU-300)

- Use AI analysis to understand codebase structure
- Generate documentation following Neotoma documentation standards
- Ensure deterministic output (no timestamps, random IDs)
- Create comprehensive index for search functionality

### Web Server (FU-301)

- **MUST follow design system** (`docs/ui/design_system.md`) for all UI components
- Use efficient static file serving (e.g., Express static middleware)
- Implement search using documentation index from FU-300
- Optimize for performance (< 200ms page load)
- Support versioned documentation directories
- Landing page must comply with design system (colors, typography, spacing, components, accessibility, dark mode)

### MCP Endpoint (FU-302)

- Follow MCP protocol specification strictly
- Use existing MCP server infrastructure from v0.1.0
- Implement proper error handling with ErrorEnvelope
- Validate request/response schemas

### Support Agent (FU-303)

- Use RAG pattern with static documentation as knowledge base
- Implement semantic search for context retrieval
- Generate responses with citations to source documentation
- Validate accuracy on test query set (>= 80%)

---

## Testing Strategy

**Unit Tests:**

- Each FU component tested independently
- Mock dependencies where appropriate
- Test edge cases and error handling

**Integration Tests:**

- Cross-FU workflows tested end-to-end
- Documentation generation → web serving → support agent flow
- MCP endpoint integration with support agent

**Accuracy Tests:**

- Support agent accuracy validated on test query set
- Citation quality verified
- Response relevance assessed

---

## Success Metrics

- **Documentation Coverage:** All major topics documented
- **Documentation Quality:** Accurate, clear, actionable
- **Support Agent Accuracy:** >= 80% on test queries
- **Performance:** Page load < 200ms, search < 500ms
- **User Satisfaction:** Users can self-serve answers effectively
- **Production Deployment:** Successfully deployed to neotoma.io
  - Landing page accessible at neotoma.io
  - Documentation accessible at neotoma.io/docs
  - MCP support endpoint operational

---



