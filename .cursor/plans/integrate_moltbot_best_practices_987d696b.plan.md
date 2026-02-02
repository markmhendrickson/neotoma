---
name: Integrate Moltbot Best Practices
overview: Integrate high-impact developer experience practices from Moltbot README into Neotoma (health check, security defaults, operational docs, standard files) and generalize patterns for foundation framework templates.
todos:
  - id: health-check
    content: Implement npm run doctor command with comprehensive system diagnostics
    status: pending
  - id: readme-security
    content: Add Security Defaults section to Neotoma README before features
    status: pending
  - id: readme-diagram
    content: Add simple architecture diagram to README What It Does section
    status: pending
  - id: readme-operations
    content: Add Operations section to README Quick Links
    status: pending
  - id: security-md
    content: Create SECURITY.md with policy, reporting, and best practices
    status: pending
  - id: contributing-md
    content: Create CONTRIBUTING.md with contribution guidelines
    status: pending
  - id: operational-runbook
    content: Create docs/operations/runbook.md with startup, health, shutdown procedures
    status: pending
  - id: health-check-docs
    content: Create docs/operations/health_check.md documenting doctor command
    status: pending
  - id: foundation-health-template
    content: Create foundation health check template for all repos
    status: pending
  - id: foundation-security-template
    content: Create foundation security defaults README template
    status: pending
  - id: foundation-standard-templates
    content: Create foundation CONTRIBUTING and SECURITY templates
    status: pending
  - id: foundation-runbook-template
    content: Create foundation operational runbook template
    status: pending
  - id: foundation-readme-update
    content: Update foundation README template with new sections
    status: pending
isProject: false
---

# Integrate Moltbot README Best Practices

## Overview

Integrate developer experience best practices from Moltbot into Neotoma and create generalized templates for the foundation framework. Focus on high-impact changes: health check command, security prominence, operational documentation, and standard files.

---

## Phase 1: Neotoma Health Check Command

**Goal:** Create comprehensive `npm run doctor` command for system diagnostics

**Implementation:**

Create `scripts/doctor.ts` with checks:

- **Environment:** Required variables present (DEV_SUPABASE_PROJECT_ID, DEV_SUPABASE_SERVICE_KEY)
- **Database:** Connection working, ping successful
- **Tables:** All required tables exist (sources, interpretations, observations, entities, entity_snapshots, timeline_events, relationships, etc.)
- **RLS:** Row-level security enabled on all tables
- **Storage:** Buckets exist (`files`, `sources`) and are private
- **OAuth:** Configuration present (optional but recommended)
- **Migrations:** Latest migration applied (compare version)
- **MCP:** Server can start (test stdio mode startup)
- **Security:** Service key not in logs/git, `.env` exists and is gitignored

**Output format:**

```
🔍 Neotoma Health Check

✅ Environment: All required variables configured
✅ Database: Connected to neotoma-dev (ping: 12ms)
✅ Tables: 15/15 found
✅ RLS: 15/15 tables protected
✅ Storage: 2/2 buckets exist (private)
⚠️  OAuth: Not configured (recommended for production)
✅ Migrations: Up to date (v0.2.15)
✅ MCP: Server starts successfully
✅ Security: No violations detected

Overall: ✅ HEALTHY (1 warning)
```

Add to `package.json`:

```json
{
  "scripts": {
    "doctor": "tsx scripts/doctor.ts"
  }
}
```

**Files:**

- Create: `scripts/doctor.ts`
- Update: `package.json` (add doctor script)
- Reference: Existing health check patterns in `scripts/` directory

---

## Phase 2: Neotoma README Enhancements

**Goal:** Improve README with security prominence, operational links, architecture diagram

### 2.1 Add Security Defaults Section

Add new section after "What It Does" (before "Problems Solved"):

````markdown
## Security Defaults

Neotoma stores personal data and requires secure configuration.

**Authentication:**

- **OAuth 2.0 with PKCE** (recommended): Secure, long-lived connections with automatic token refresh
- **Session tokens** (deprecated): Short-lived, manual refresh required
- See: [OAuth Implementation Guide](docs/developer/mcp_oauth_implementation.md)

**Authorization:**

- **Row-Level Security (RLS)** enabled on all tables
- Multi-user support with user isolation
- Service role for admin operations only

**Data Protection:**

- End-to-end encryption (planned v2.0.0)
- User-controlled data with full export/deletion control
- Never used for training or provider access
- All storage buckets configured as private

**Verify your security configuration:**

```bash
npm run doctor
```
````

See [Security Documentation](docs/subsystems/privacy.md) and [Authentication Guide](docs/subsystems/auth.md).

````

**Position:** Insert after line 97 (after "Who Neotoma Is For", before "Comparison with Provider Memory")

### 2.2 Add Architecture Diagram

Add simple Mermaid diagram to "What It Does" section:

```markdown
## System Architecture

```mermaid
graph LR
    Sources[Documents + Agent Data] --> Ingest[Ingestion]
    Ingest --> Obs[Observations]
    Obs --> Entities[Entity Resolution]
    Entities --> Snapshots[Entity Snapshots]
    Snapshots --> Graph[Memory Graph]
    Graph <--> MCP[MCP Protocol]
    MCP --> ChatGPT
    MCP --> Claude
    MCP --> Cursor
````

Neotoma transforms fragmented data into structured memory accessible to all your AI tools.

````

**Position:** After "What It Does" paragraph, before "Problems Solved"

### 2.3 Enhance Quick Links with Operations

Update Quick Links section to add Operations:

```markdown
**Operations:**
- **[Operational Runbook](docs/operations/runbook.md)**: Startup, health checks, troubleshooting
- **[Health Check](docs/operations/health_check.md)**: Run `npm run doctor`
- **[Troubleshooting](docs/operations/troubleshooting.md)**: Common issues and solutions
````

**Position:** After "Development:" section in Quick Links

**Files:**

- Update: `README.md` (three additions: security defaults, architecture diagram, operations links)

---

## Phase 3: Neotoma Standard Files

**Goal:** Add standard GitHub files for professionalism and community readiness

### 3.1 Create SECURITY.md

Create `SECURITY.md` in root:

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | ✅ Yes    |
| < 0.2   | ❌ No     |

## Reporting a Vulnerability

If you discover a security vulnerability in Neotoma, please email: [security@neotoma.example]

**Do NOT open a public issue for security vulnerabilities.**

**Response Time:** We aim to respond within 48 hours.

**What to Include:**

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Model

Neotoma implements defense-in-depth security:

- **Row-Level Security (RLS)** on all tables
- **OAuth 2.0 with PKCE** for authentication
- **End-to-end encryption** (planned v2.0.0)
- **Audit trail** for all data operations
- **User-controlled data** with export and deletion

See [docs/subsystems/privacy.md](docs/subsystems/privacy.md) and [docs/subsystems/auth.md](docs/subsystems/auth.md) for details.

## Security Best Practices

**When deploying Neotoma:**

1. Always use OAuth (not session tokens)
2. Verify RLS enabled: `npm run doctor`
3. Keep storage buckets private
4. Rotate service keys regularly
5. Never commit `.env` files
6. Use HTTPS for all API endpoints

See [Getting Started Guide](docs/developer/getting_started.md) for secure setup.
```

**Files:**

- Create: `SECURITY.md` (root)

### 3.2 Create CONTRIBUTING.md

Create `CONTRIBUTING.md` in root:

```markdown
# Contributing to Neotoma

Neotoma is currently in private development. We plan to open source the project when we reach v1.0.0 MVP.

## Current Status

If you're interested in collaboration or early access:

- Contact: [maintainer contact]
- Review our [Philosophy](docs/foundation/philosophy.md)
- Read our [Development Workflow](docs/developer/development_workflow.md)

## When We Launch

When Neotoma becomes public, we'll welcome contributions. Our contribution process will include:

- Feature Unit workflow for all changes
- Comprehensive testing requirements
- Documentation standards
- Security review for sensitive changes

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

## Questions?

Join our community (link when public) or open a discussion on GitHub.
```

**Files:**

- Create: `CONTRIBUTING.md` (root)

---

## Phase 4: Neotoma Operational Documentation

**Goal:** Create operational runbook and link prominently

### 4.1 Create Operational Runbook

Create `docs/operations/runbook.md`:

**Sections:**

- **Startup Procedures** (local dev, production)
- **Health Checks** (run `npm run doctor`, manual checks)
- **Shutdown Procedures** (graceful shutdown, cleanup)
- **Monitoring** (logs, metrics, error tracking)
- **Common Operations** (migrations, backups, user management)
- **Emergency Procedures** (rollback, incident response)
- **Troubleshooting Quick Reference** (link to detailed troubleshooting guide)

**Content:** Consolidate from existing operational docs and add standardized procedures

**Files:**

- Create: `docs/operations/runbook.md`
- Reference: `docs/operations/troubleshooting.md`, `docs/developer/getting_started.md`

### 4.2 Create Health Check Documentation

Create `docs/operations/health_check.md`:

**Sections:**

- **Running Health Checks** (`npm run doctor` usage)
- **Check Categories** (environment, database, security, services)
- **Interpreting Results** (what each check means)
- **Fixing Common Issues** (per-check remediation steps)
- **Automated Monitoring** (future: health check API endpoint)

**Files:**

- Create: `docs/operations/health_check.md`

---

## Phase 5: Foundation Framework Templates

**Goal:** Generalize Moltbot patterns for all repos using foundation

### 5.1 Health Check Template

Create `foundation/tooling/doctor_command_template.md`:

**Content:**

- Pattern for building health check commands
- Standard checks (configurable per repo): - Prerequisites installed - Configuration files present - Database/services accessible - Security policies enabled - Migrations applied - Service startup verification
- Output format guidelines
- Integration with README
- Example implementation (TypeScript)

Add to `foundation-config.yaml`:

```yaml
tooling:
  health_check:
    enabled: true
    command: "npm run doctor"
    checks:
      - environment
      - database
      - security
      - migrations
      - services
```

**Files:**

- Create: `foundation/tooling/doctor_command_template.md`
- Update: `foundation-config.yaml` (add health_check config example)

### 5.2 Security Defaults Template

Create `foundation/security/security_defaults_readme_template.md`:

**Content:**

- Template section for README (markdown)
- Placeholder sections: - Authentication methods - Authorization model - Data protection - Security verification command
- Customization guidance
- When to include (any repo with user data, authentication, sensitive operations)

**Files:**

- Create: `foundation/security/security_defaults_readme_template.md`

### 5.3 Update README Template

Update `foundation/templates/README_template.md` to include:

- Security Defaults section (after What It Does)
- Operations section in Quick Links
- Commands reference section
- Architecture diagram guidelines
- Doctor command mention

**Files:**

- Update: `foundation/templates/README_template.md` (if exists, or create)

### 5.4 Standard File Templates

Create standard file templates:

**CONTRIBUTING.md Template:**

- Create: `foundation/templates/CONTRIBUTING_template.md`
- Sections: Current Status, Contribution Process, Code of Conduct, Contact
- Placeholders for repo-specific information

**SECURITY.md Template:**

- Create: `foundation/templates/SECURITY_template.md`
- Sections: Supported Versions, Reporting, Security Model, Best Practices
- Placeholders for contact info, version table

**Files:**

- Create: `foundation/templates/CONTRIBUTING_template.md`
- Create: `foundation/templates/SECURITY_template.md`

### 5.5 Operational Runbook Template

Create `foundation/operations/runbook_template.md`:

**Content:**

- Template sections for operational runbooks
- Standard operations: startup, shutdown, health checks, monitoring
- Emergency procedures
- Troubleshooting quick reference
- Customization guidance

**Files:**

- Create: `foundation/operations/runbook_template.md`

---

## Phase 6: Future Enhancements (Optional)

**Goal:** Additional polish for when Neotoma is public

### 6.1 Quick Install Script (When Stable)

Create `scripts/install.sh`:

- One-liner install
- Prerequisites check
- Clone or npm install
- Run onboarding wizard
- Verify with doctor

Host at custom domain (e.g., `install.neotoma.dev`)

### 6.2 Onboarding Wizard (When Complex Setup)

Create `scripts/onboard.js`:

- Interactive prompts for configuration
- Automate Supabase setup (where possible)
- Write `.env` file
- Run migrations
- Configure MCP for primary AI tool

### 6.3 Development Channels (When Public Releases)

Implement stable/beta/dev channels:

- npm dist-tags
- Git tag conventions
- Channel switching command
- Document in README

---

## Implementation Order

**Week 1: Critical Infrastructure**

1. Implement health check command (Phase 1)
2. Create operational runbook (Phase 4.1)
3. Create health check docs (Phase 4.2)

**Week 2: README and Standards**

4. Update Neotoma README with security defaults (Phase 2.1)
5. Add architecture diagram to README (Phase 2.2)
6. Add operations links to README (Phase 2.3)
7. Create SECURITY.md (Phase 3.1)
8. Create CONTRIBUTING.md (Phase 3.2)

**Week 3: Foundation Templates**

9. Create health check template for foundation (Phase 5.1)
10. Create security defaults template (Phase 5.2)
11. Create CONTRIBUTING and SECURITY templates (Phase 5.4)
12. Create operational runbook template (Phase 5.5)
13. Update foundation README template (Phase 5.3)

**Future (As Needed):**

14. Quick install script (Phase 6.1)
15. Onboarding wizard (Phase 6.2)
16. Development channels (Phase 6.3)

---

## Key Files

**Neotoma Changes:**

- Create: `scripts/doctor.ts`
- Create: `docs/operations/runbook.md`
- Create: `docs/operations/health_check.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Update: `README.md` (security section, diagram, operations links)
- Update: `package.json` (add doctor script)

**Foundation Additions:**

- Create: `foundation/tooling/doctor_command_template.md`
- Create: `foundation/security/security_defaults_readme_template.md`
- Create: `foundation/operations/runbook_template.md`
- Create: `foundation/templates/CONTRIBUTING_template.md`
- Create: `foundation/templates/SECURITY_template.md`
- Update: `foundation/templates/README_template.md`
- Update: `foundation-config.yaml` (add health_check config)

---

## Success Criteria

**Neotoma:**

- ✅ `npm run doctor` command works and checks all critical systems
- ✅ README includes Security Defaults section before features
- ✅ README includes simple architecture diagram
- ✅ SECURITY.md and CONTRIBUTING.md exist in root
- ✅ Operational runbook created and linked in README

**Foundation:**

- ✅ Health check template available for all repos
- ✅ Security defaults template available
- ✅ Standard file templates (CONTRIBUTING, SECURITY) available
- ✅ Operational runbook template available
- ✅ README template includes all new sections

---

## Notes

- **Phase 1 (health check)** has highest impact and should be implemented first
- **Security defaults** are critical for any repo handling user data
- **Foundation templates** benefit all future repos using the framework
- **Future enhancements** (install script, wizard, channels) are lower priority until Neotoma is public
- All changes respect existing documentation standards from `docs/conventions/documentation_standards.md`
