## Release v0.2.1 — Documentation Generation System
### 1. Release Overview
- **Release ID**: `v0.2.1`
- **Name**: Documentation Generation System
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Deliver comprehensive, statically-generated documentation derived from AI analysis of the repository, served for web viewing with one-page landing site. Creates the documentation foundation that enables future support systems and user onboarding.
- **Priority**: P0 (critical for user enablement)
- **Target Ship Date**: When ready (post v0.2.0 validation)
- **Marketing Required**: No (not marketed release)
#### 1.1 Canonical Specs (Authoritative Sources)
- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **MVP Overview**: `docs/specs/MVP_OVERVIEW.md`
- **MCP Specification**: `docs/specs/MCP_SPEC.md`
- **Documentation Standards**: `docs/conventions/documentation_standards.md`
- **Design System**: `docs/ui/design_system.md`
This release plan coordinates the documentation and support system scope into a concrete release plan.
**Release Classification:**
- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Not Marketed (deploys to production without marketing activities)
### 2. Scope
#### 2.1 Included Feature Units
**Documentation Generation System:**
- `FU-300`: AI-Powered Documentation Analysis & Generation
  - Repository analysis via AI (codebase structure, architecture, APIs, workflows)
  - Comprehensive documentation generation (API references, architecture diagrams, guides)
  - Static markdown/HTML output for web viewing
  - Documentation indexing and cross-referencing
  
- `FU-301`: Static Documentation Web Server
  - One-page landing website presenting key information from README.md
  - Design system compliance (follows `docs/ui/design_system.md`)
  - Directory access to documentation (organized by category)
  - MCP setup instructions and quick start guide
  - Static file serving (markdown/HTML documentation)
  - Search functionality across documentation
  - Navigation and cross-linking
  - Versioned documentation support

#### 2.1.1 Deferred to v0.9.0
**MCP Support System (moved to pre-v1.0.0 release):**
- `FU-302`: MCP Support Inquiry Endpoint → Moved to v0.9.0
- `FU-303`: Support Agent System → Moved to v0.9.0

**Rationale:** Documentation foundation is critical early; interactive support system better suited for pre-MVP launch when user base exists.
#### 2.2 Explicitly Excluded
- Dynamic documentation generation (all docs pre-generated)
- Real-time code analysis (analysis runs during build/release)
- Multi-language documentation (English only for MVP)
- User-contributed documentation (official docs only)
- Chat UI for support (MCP-only access)
#### 2.3 Design System Requirements
**All UI-related work MUST follow the design system:**
- **Design System Reference**: `docs/ui/design_system.md`
- **Required Compliance**: All UI components, pages, and interactions must adhere to design system specifications
- **Verification**: Design system compliance must be verified in acceptance criteria and integration tests
- **Components**: Use shadcn/ui components where applicable, following design system guidelines
- **Accessibility**: WCAG AA compliance required (keyboard navigation, ARIA labels, contrast ratios)
- **Brand Alignment**: Minimal, technical, trustworthy, deterministic aesthetic
**Design System Elements:**
- Colors: Neutral grays with blue accents (#0066CC primary), dark mode support
- Typography: Inter for UI text, JetBrains Mono for code/data
- Spacing: 4px base unit scale (8px, 16px, 24px, etc.)
- Components: shadcn/ui components aligned with design system
- Dark Mode: Full support required
- Responsive: Desktop-first, mobile adaptations as needed
### 3. Release-Level Acceptance Criteria
#### 3.1 Product
- One-page landing website accessible at root URL presenting:
  - Key information from README.md (what Neotoma is, problems solved, who it's for)
  - Core workflow and architecture overview
  - Key features and capabilities
  - Directory access to documentation organized by category
  - MCP setup instructions with step-by-step guide
  - Quick links to essential documentation
  - Design system compliance (colors, typography, spacing, components per `docs/ui/design_system.md`)
- Comprehensive documentation available via web interface covering:
  - Architecture overview and system design
  - API reference (all MCP actions, request/response schemas)
  - Feature unit specifications
  - Developer guides (getting started, workflows, testing)
  - Integration guides (MCP setup, provider integrations)
  - Troubleshooting and FAQ
- Documentation search functional (find relevant docs by keyword/topic)
#### 3.2 Technical
- Documentation generation deterministic (same repo state → same docs)
- Static documentation served efficiently (< 200ms page load)
- Documentation index searchable (< 500ms query response)
- All documentation validated for accuracy and completeness
- Documentation generation runs as part of release/build process
- Static files stored in versioned directory structure
- **All UI components follow design system** (`docs/ui/design_system.md`):
  - Colors, typography, spacing per design system specifications
  - shadcn/ui components used where applicable
  - Dark mode support functional
  - Accessibility: WCAG AA compliance (keyboard navigation, ARIA labels, contrast)
  - Brand alignment: Minimal, technical, trustworthy, deterministic
#### 3.3 Business
- Users can self-serve answers via documentation web interface
- Documentation serves as single source of truth for all Neotoma information
- Documentation foundation enables future support systems (v0.9.0)
### 4. Cross-FU Integration Scenarios
These scenarios must pass end-to-end before v0.2.1 is approved:

1. **Documentation Generation → Web Viewing**
   - Run documentation generation process
   - Verify comprehensive docs generated (architecture, APIs, guides)
   - Access landing page at root URL
   - Verify landing page displays key README information
   - Verify directory access to documentation works
   - Verify MCP setup instructions are accessible and clear
   - Access docs via web server
   - Verify search functionality works
   - Verify cross-links functional

2. **Documentation Update → Regeneration**
   - Update source documentation or codebase
   - Regenerate static documentation
   - Verify updated content reflected in generated docs
   - Verify search index updated
   - Verify cross-references maintained

The detailed test specifications for these flows live in `docs/releases/v0.2.1/integration_tests.md`.
### 5. Deployment and Rollout Strategy
- **Deployment Target**: Production (neotoma.io)
  - All releases deploy to production at neotoma.io
  - Deploy documentation web server to neotoma.io
  - Deploy MCP support endpoint alongside existing MCP server
  - Landing page accessible at neotoma.io root URL
  - Documentation accessible at neotoma.io/docs
  - MCP support endpoint accessible via MCP protocol
- **Marketing Strategy**: Not Marketed
  - No pre-launch marketing activities
  - No post-launch marketing activities
  - No user acquisition campaigns
  - No announcement or promotion
  - Release deployed silently to production
- **Rollback Plan**:
  - Revert code changes and redeploy to neotoma.io
  - Restore previous documentation version if needed
  - Disable MCP support endpoint if critical issues arise
### 6. Post-Release Validation
- Validate documentation completeness:
  - All major topics covered
  - All MCP actions documented
  - All feature units have documentation
  - Cross-references functional
- Validate documentation quality:
  - Verify accuracy of generated content
  - Verify completeness of coverage
  - Test documentation search accuracy
- Validate web interface:
  - Page load performance
  - Search functionality
  - Navigation usability
  - Mobile responsiveness (basic)
- Validate production deployment:
  - Landing page accessible at neotoma.io
  - Documentation accessible at neotoma.io/docs
  - All links and navigation functional
  - Performance metrics within targets
### 7. Success Criteria
**Release is Complete When:**
1. ✅ Comprehensive documentation generated covering all major topics
2. ✅ One-page landing website operational with key README information
3. ✅ Directory access to documentation functional
4. ✅ MCP setup instructions available and clear
5. ✅ Documentation web server operational and accessible
6. ✅ Documentation search functional
7. ✅ Documentation generation integrated into build/release process
8. ✅ Static documentation versioned and stored appropriately
9. ✅ **Deployed to neotoma.io** (landing page at root, docs at /docs)
10. ✅ All acceptance criteria met
### 8. Status
- **Current Status**: `planning`
- **Release Type**: Not Marketed
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson
- **Notes**:
  - Builds on v0.2.0 ingestion infrastructure
  - Documentation generation uses AI analysis of repository
  - All documentation statically generated (no runtime generation)
  - **All UI work MUST follow design system** (`docs/ui/design_system.md`) - colors, typography, spacing, components, accessibility, dark mode
  - **All releases deploy to production** at neotoma.io, regardless of marketing status
  - **Support system (FU-302, FU-303) moved to v0.9.0** - enables better timing for user-facing support before v1.0.0
### 9. Related Documentation
- `integration_tests.md` — Cross-FU integration test specifications
- `execution_schedule.md` — Detailed batch execution plan
- `manifest.yaml` — Feature Unit manifest and dependencies
- `acceptance_criteria.md` — Detailed acceptance criteria
### 10. Feature Unit Specifications
**New Feature Units:**
- **FU-300**: AI-Powered Documentation Analysis & Generation
- **FU-301**: Static Documentation Web Server

**Dependencies:**
- FU-300: No dependencies (can run independently)
- FU-301: Depends on FU-300 (needs generated docs)

**Moved to v0.9.0:**
- **FU-302**: MCP Support Inquiry Endpoint
- **FU-303**: Support Agent System

### 11. Release Spacing Context

| Release | Focus | Status |
|---------|-------|--------|
| v0.2.0 | Minimal ingestion + correction loop | Prerequisite |
| **v0.2.1** | **Documentation generation system** | **This release** |
| v0.9.0 | MCP support system | Uses v0.2.1 docs |
| v1.0.0 | MVP (public release) | Next major |
