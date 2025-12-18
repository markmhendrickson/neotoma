# Release v2.1.0 Execution Schedule

_(Feature Unit Execution Plan with Batches, Dependencies, and Timeline)_

---

## Purpose

This document details the execution order of Feature Units for v2.1.0, organized into batches with dependencies, parallelization opportunities, and timeline estimates.

---

## Execution Overview

**Total Feature Units:** 29 (all required)

**Estimated Duration:** 23 weeks (5.75 months)

**Assumptions:**

- All timeline estimates assume Cursor agent execution (not human developers)
- Cloud agents execute in parallel via Cursor Background Agents API (see `docs/feature_units/standards/multi_agent_orchestration.md`)
- Execution limits: `max_parallel_fus: 3` (GDPR features can be parallelized), `max_high_risk_in_parallel: 1`
- v2.0.0 (E2EE) must be deployed and stable before starting

**Critical Path:** FU-906 → FU-900 → FU-901 → FU-902 → FU-903 → FU-904 → FU-905

---

## Batch Overview

| Batch | Feature Units          | Dependencies | Estimated Duration | Risk Level |
| ----- | ---------------------- | ------------ | ------------------ | ---------- |
| 0     | FU-906                 | -            | 1 week             | Low        |
| 1     | FU-909, FU-910, FU-911 | FU-906       | 2 weeks            | High       |
| 2     | FU-900                 | FU-906       | 2 weeks            | Medium     |
| 3     | FU-901, FU-902         | FU-900       | 2 weeks            | Low        |
| 4     | FU-912                 | FU-900       | 1 week             | Medium     |
| 5     | FU-903                 | FU-906       | 2 weeks            | High       |
| 6     | FU-913                 | FU-903       | 1 week             | Medium     |
| 7     | FU-914                 | FU-913       | 1 week             | Low        |
| 8     | FU-904, FU-905         | FU-903       | 2 weeks            | High       |
| 9     | FU-907, FU-908         | FU-906       | 1 week             | Low        |

---

## Detailed Batch Execution

### Batch 0: Request Tracking Foundation (Week 1)

**Feature Units:**

- `FU-906`: GDPR Request Tracking System

**Dependencies:** None (foundation)

**Deliverables:**

- Database schema for `gdpr_requests` table:
  ```sql
  CREATE TABLE gdpr_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_type TEXT NOT NULL, -- 'export', 'deletion', 'portability'
    status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    export_file_url TEXT, -- For export requests
    error_message TEXT, -- If failed
    metadata JSONB -- Additional request metadata
  );
  ```
- Request status management functions
- Audit trail logging

**Acceptance Criteria:**

- ✅ Request tracking table created
- ✅ Status transitions work correctly
- ✅ Audit trail captures all changes

**Risk:** Low (foundational)

**Parallelization:** None (foundation)

---

### Batch 1: Identity Verification & Security (Weeks 2-3)

**Feature Units:**

- `FU-909`: GDPR Identity Verification
- `FU-910`: GDPR Request Rate Limiting
- `FU-911`: GDPR Audit Logging

**Dependencies:** FU-906

**Deliverables:**

- Identity verification service:
  - Email verification (send verification code)
  - Password confirmation (for sensitive requests)
  - 2FA verification (if enabled)
- Rate limiting middleware:
  - Max 1 export per 30 days
  - Max 1 deletion per account lifetime
  - Request frequency limits
- Audit logging service:
  - Log all GDPR requests
  - Log identity verification attempts
  - Log request fulfillments
  - Compliance audit trail

**Acceptance Criteria:**

- ✅ Identity verification prevents unauthorized requests
- ✅ Rate limiting blocks excessive requests
- ✅ Audit logs capture all GDPR activities

**Risk:** High (security-critical)

**Parallelization:** Can parallelize FU-910 and FU-911 (independent)

---

### Batch 2: Data Export Service (Weeks 4-5)

**Feature Units:**

- **FU-900**: GDPR Data Export Service

**Dependencies:** FU-906

**Deliverables:**

- Data export service:
  - Compile all user data:
    - Local encrypted records (decrypt locally)
    - Server encrypted records (export ciphertext with instructions)
    - Entities (from local + server)
    - Events (from local + server)
    - Subscription data (from Supabase)
    - Usage metrics (from Supabase)
  - Export format: JSON or CSV
  - Export packaging (zip file with multiple files)
- E2EE handling:
  - Decrypt local data before export
  - Export server ciphertext with decryption instructions
  - Handle missing encryption keys

**Acceptance Criteria:**

- ✅ All user data compiled correctly
- ✅ Local encrypted data decrypted successfully
- ✅ Server ciphertext exported with instructions
- ✅ Export format is machine-readable (JSON/CSV)

**Risk:** Medium (E2EE complexity)

**Parallelization:** None (foundational service)

---

### Batch 3: Data Export API & UI (Weeks 6-7)

**Feature Units:**

- **FU-901**: GDPR Data Export API Endpoint
- **FU-902**: GDPR Data Export UI

**Dependencies:** FU-900

**Deliverables:**

- API endpoint: `POST /api/gdpr/export`
  - Request body: `{ format: 'json' | 'csv' }`
  - Response: `{ request_id: string, status: 'pending' }`
- API endpoint: `GET /api/gdpr/export/:request_id`
  - Response: `{ status: string, download_url?: string }`
- UI components:
  - Settings → Privacy → Export My Data button
  - Request status display
  - Download link (when ready)
- Email notifications:
  - Request received
  - Export ready (with download link)

**Acceptance Criteria:**

- ✅ API endpoints functional
- ✅ UI allows users to request export
- ✅ Users receive email notifications
- ✅ Users can download export file

**Risk:** Low (UI work)

**Parallelization:** Can parallelize FU-901 and FU-902 (API + UI)

---

### Batch 4: Lost Key Handling (Week 8)

**Feature Units:**

- **FU-912**: GDPR Export with Lost Keys

**Dependencies:** FU-900

**Deliverables:**

- Lost key detection:
  - Check if user has encryption keys
  - Detect missing keys scenario
- Fallback export:
  - Export server ciphertext only
  - Include decryption instructions
  - Warn user about data loss
- Key recovery guidance:
  - Instructions for key recovery
  - Support contact information

**Acceptance Criteria:**

- ✅ Lost key scenario detected
- ✅ Server ciphertext exported with instructions
- ✅ User warned about data loss
- ✅ Key recovery guidance provided

**Risk:** Medium (edge case handling)

**Parallelization:** None (depends on export service)

---

### Batch 5: Bulk Deletion Service (Weeks 9-10)

**Feature Units:**

- **FU-903**: GDPR Bulk Deletion Service

**Dependencies:** FU-906

**Deliverables:**

- Bulk deletion service:
  - Delete local data:
    - SQLite database (delete entire database)
    - OPFS files (delete all files)
    - IndexedDB (clear all data)
  - Delete server data:
    - Encrypted ciphertext (delete from Supabase)
    - Subscription data (cancel subscription, delete records)
    - Usage metrics (delete from Supabase)
  - Deletion verification:
    - Verify all data deleted
    - Audit trail of deletion
- E2EE handling:
  - Delete encrypted local data
  - Delete encrypted server ciphertext
  - Handle multi-device sync cleanup

**Acceptance Criteria:**

- ✅ All user data deleted (local + server)
- ✅ Deletion verified (audit trail)
- ✅ Account disabled after deletion

**Risk:** High (data loss risk)

**Parallelization:** None (critical service)

---

### Batch 6: Encrypted Server Data Deletion (Week 11)

**Feature Units:**

- **FU-913**: GDPR Deletion of Encrypted Server Data

**Dependencies:** FU-903

**Deliverables:**

- Encrypted data deletion:
  - Delete ciphertext from Supabase `records` table
  - Delete encrypted file storage (Supabase Storage)
  - Delete encrypted metadata
- Verification:
  - Verify ciphertext deleted
  - Verify file storage cleared
  - Audit trail

**Acceptance Criteria:**

- ✅ Encrypted server data deleted
- ✅ Deletion verified
- ✅ Audit trail complete

**Risk:** Medium (E2EE-specific)

**Parallelization:** None (depends on deletion service)

---

### Batch 7: Multi-Device Sync Cleanup (Week 12)

**Feature Units:**

- **FU-914**: GDPR Multi-Device Sync Cleanup

**Dependencies:** FU-913

**Deliverables:**

- Encrypted delta sync cleanup:
  - Delete encrypted deltas from server
  - Delete sync metadata
  - Verify cleanup completion
- Multi-device handling:
  - Handle users with multiple devices
  - Clean up all device sync data

**Acceptance Criteria:**

- ✅ Encrypted deltas deleted
- ✅ Sync metadata cleared
- ✅ Cleanup verified

**Risk:** Low (cleanup work)

**Parallelization:** None (depends on server deletion)

---

### Batch 8: Account Deletion API & UI (Weeks 13-14)

**Feature Units:**

- **FU-904**: GDPR Account Deletion API Endpoint
- **FU-905**: GDPR Account Deletion UI

**Dependencies:** FU-903

**Deliverables:**

- API endpoint: `POST /api/gdpr/delete`
  - Request body: `{ confirmation: 'DELETE' }`
  - Response: `{ request_id: string, status: 'pending' }`
- API endpoint: `GET /api/gdpr/delete/:request_id`
  - Response: `{ status: string, completed_at?: string }`
- UI components:
  - Settings → Privacy → Delete My Account button
  - Confirmation dialog (warn about data loss)
  - Request status display
- Email notifications:
  - Deletion request received
  - Deletion completed

**Acceptance Criteria:**

- ✅ API endpoints functional
- ✅ UI allows users to request deletion
- ✅ Confirmation required (prevent accidental deletion)
- ✅ Users receive email notifications
- ✅ Account disabled after deletion

**Risk:** High (irreversible action)

**Parallelization:** Can parallelize FU-904 and FU-905 (API + UI)

---

### Batch 9: Request Management UI & Notifications (Week 15)

**Feature Units:**

- **FU-907**: GDPR Request Management UI
- **FU-908**: GDPR Request Notification System

**Dependencies:** FU-906

**Deliverables:**

- Request management UI:
  - Request history view (all past requests)
  - Request status display (pending, processing, completed)
  - Download links for exports
  - Request details (type, date, status)
- Notification system:
  - Email notifications for status changes
  - Deadline reminders (if approaching 30 days)
  - Completion notifications (with download links)

**Acceptance Criteria:**

- ✅ Users can view request history
- ✅ Users can track request status
- ✅ Users receive email notifications
- ✅ Deadline reminders sent

**Risk:** Low (UI and notifications)

**Parallelization:** Can parallelize FU-907 and FU-908 (UI + notifications)

---

### Batch 10: Legal Document Serving Service (Week 16)

**Feature Units:**

- **FU-915**: Legal Document Serving Service

**Dependencies:** None (independent)

**Deliverables:**

- Legal document serving service:
  - Read markdown files from `docs/legal/` directory
  - Parse markdown to HTML (using markdown parser)
  - Serve Privacy Policy (`docs/legal/privacy_policy.md`)
  - Serve Terms of Service (`docs/legal/terms_of_service.md`)
  - Version management (track document versions from changelogs)
  - Cache rendered HTML (invalidate on file changes)
- Document metadata:
  - Last updated date (from file metadata or changelog)
  - Version number (from changelog)
  - Document status (draft, published, legal review required)

**Acceptance Criteria:**

- ✅ Privacy Policy served from markdown source
- ✅ Terms of Service served from markdown source
- ✅ Documents rendered as HTML correctly
- ✅ Version information displayed
- ✅ Last updated date accurate

**Risk:** Low (document serving)

**Parallelization:** None (foundational service)

---

### Batch 11: Legal Document API & UI (Week 17)

**Feature Units:**

- **FU-916**: Legal Document API Endpoints
- **FU-917**: Legal Document UI Links

**Dependencies:** FU-915

**Deliverables:**

- API endpoints:
  - `GET /legal/privacy` — Returns Privacy Policy HTML
  - `GET /legal/terms` — Returns Terms of Service HTML
  - `GET /legal/privacy/raw` — Returns Privacy Policy markdown (optional)
  - `GET /legal/terms/raw` — Returns Terms of Service markdown (optional)
- UI components:
  - Footer links (Privacy Policy, Terms of Service)
  - Settings → Legal section (links to documents)
  - Signup flow: Terms of Service acceptance checkbox with link
  - Login flow: Link to Terms of Service (if updated)
- Document pages:
  - Privacy Policy page (`/legal/privacy`)
  - Terms of Service page (`/legal/terms`)
  - Responsive design, readable typography
  - Print-friendly styling

**Acceptance Criteria:**

- ✅ API endpoints functional
- ✅ Footer links work
- ✅ Settings → Legal section displays links
- ✅ Signup flow includes Terms acceptance
- ✅ Document pages render correctly
- ✅ Documents accessible without authentication

**Risk:** Low (UI work)

**Parallelization:** Can parallelize FU-916 and FU-917 (API + UI)

---

### Batch 12: Consent Management & Cookie Consent (Weeks 16-17)

**Feature Units:**

- **FU-918**: Consent Management System
- **FU-919**: Cookie Consent Banner

**Dependencies:** None (independent)

**Deliverables:**

- Consent management system:
  - Database schema for `consent_records` table:
    ```sql
    CREATE TABLE consent_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL, -- 'service', 'cookies', 'marketing', etc.
      consent_method TEXT NOT NULL, -- 'signup', 'upload', 'settings', etc.
      consent_scope TEXT NOT NULL, -- 'document_processing', 'analytics', etc.
      granted BOOLEAN NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      withdrawn_at TIMESTAMPTZ,
      version TEXT, -- Version of Privacy Policy/Terms when consent given
      metadata JSONB -- Additional consent metadata
    );
    ```
  - Consent tracking: Record consent for signup, uploads, cookie preferences
  - Consent withdrawal: Allow users to withdraw consent via UI
  - Consent history: Display all consent records to user
- Cookie consent banner:
  - Display cookie consent banner on first visit
  - Cookie categories: Essential, Analytics, Marketing
  - Cookie preferences management (Settings → Privacy → Cookie Preferences)
  - Consent tracking for cookie preferences

**Acceptance Criteria:**

- ✅ Consent records tracked for all user actions
- ✅ Cookie consent banner displayed
- ✅ Users can manage cookie preferences
- ✅ Users can withdraw consent
- ✅ Consent history displayed

**Risk:** Medium (consent tracking is compliance-critical)

**Parallelization:** Can parallelize FU-918 and FU-919 (independent features)

---

### Batch 13: Terms/Privacy Acceptance Tracking (Week 18)

**Feature Units:**

- **FU-920**: Terms/Privacy Acceptance Tracking

**Dependencies:** FU-917

**Deliverables:**

- Acceptance tracking system:
  - Database schema for `legal_acceptances` table:
    ```sql
    CREATE TABLE legal_acceptances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL, -- 'privacy_policy', 'terms_of_service'
      version TEXT NOT NULL, -- Document version (e.g., '1.0')
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address INET, -- IP address when accepted
      user_agent TEXT -- Browser user agent
    );
    ```
  - Track Terms acceptance during signup
  - Track Privacy Policy acceptance (if required)
  - Notify users when Terms/Privacy updated (require re-acceptance if material changes)

**Acceptance Criteria:**

- ✅ Terms acceptance tracked during signup
- ✅ Privacy Policy acceptance tracked (if required)
- ✅ Users notified when documents updated
- ✅ Acceptance history displayed

**Risk:** Low (tracking work)

**Parallelization:** None (depends on legal documents)

---

### Batch 14: Restrict Processing & Data Retention (Weeks 19-20)

**Feature Units:**

- **FU-921**: Right to Restrict Processing UI
- **FU-922**: Data Retention Enforcement

**Dependencies:** None (independent)

**Deliverables:**

- Restrict processing UI:
  - Settings → Privacy → Restrict Processing toggle
  - When enabled: Set `processing_restricted = true` flag
  - Block new data ingestion (reject uploads, MCP writes)
  - Retain existing data but do not process further
  - User can lift restriction (toggle off)
- Data retention enforcement:
  - Retention policy configuration:
    - User data: Until deletion request (no automatic deletion)
    - Logs: 90 days (application), 1 year (access), 7 years (audit)
    - Backups: 30 days
  - Automated deletion job:
    - Check retention policies daily
    - Identify data exceeding retention period
    - Notify user 30 days before deletion (if applicable)
    - Delete expired data automatically
    - Log deletion in audit trail

**Acceptance Criteria:**

- ✅ Users can restrict processing via UI toggle
- ✅ Restriction blocks new ingestion
- ✅ Data retention policies enforced
- ✅ Expired data deleted automatically
- ✅ Users notified before deletion (if applicable)

**Risk:** Medium (data deletion risk)

**Parallelization:** Can parallelize FU-921 and FU-922 (independent features)

---

### Batch 15: Breach Notification & Processing Records (Weeks 21-22)

**Feature Units:**

- **FU-923**: Breach Notification Automation
- **FU-924**: Records of Processing Activities Generator

**Dependencies:** None (independent)

**Deliverables:**

- Breach notification automation:
  - Breach detection integration (from security monitoring)
  - Breach assessment workflow:
    - Risk classification (high/medium/low)
    - Scope identification (users, data types, time range)
  - DPA notification generation:
    - Template-based notification (GDPR Article 33 format)
    - Auto-populate with breach details
    - Submit to DPA within 72 hours (automated workflow)
  - User notification automation:
    - High risk: Notify within 48 hours
    - Medium risk: Notify within 7 days
    - Low risk: No notification (document decision)
- Records of processing activities generator:
  - Auto-generate Article 30 records from system data:
    - Purpose (from system configuration)
    - Categories of data subjects (from user base)
    - Categories of personal data (from schema types)
    - Recipients (from vendor list)
    - Third countries (from vendor locations)
    - Retention periods (from retention policies)
    - Security measures (from system configuration)
  - Export to markdown format
  - Quarterly auto-updates
  - Store in `docs/legal/processing_records.md`

**Acceptance Criteria:**

- ✅ Breach notification sent within 72 hours (automated)
- ✅ DPA notification template functional
- ✅ User notification automated (if high risk)
- ✅ Records of processing activities auto-generated
- ✅ Quarterly updates automated

**Risk:** Medium (breach notification is compliance-critical)

**Parallelization:** Can parallelize FU-923 and FU-924 (independent features)

---

### Batch 16: US State Privacy Compliance (Weeks 21-22)

**Feature Units:**

- **FU-925**: Global Privacy Control (GPC) Signal Support
- **FU-926**: Sensitive Data Opt-In Consent
- **FU-927**: Right to Correct UI

**Dependencies:** None (independent)

**Deliverables:**

- GPC signal support:
  - Detect GPC header (`Sec-GPC: 1`) in requests
  - Honor GPC signal → Set opt-out preferences automatically
  - Store GPC preference in user settings
  - Respect GPC signal for all processing decisions
- Sensitive data opt-in consent:
  - Detect sensitive data in uploaded documents:
    - Racial/ethnic origin
    - Religious beliefs
    - Health data
    - Precise geolocation
    - Biometric data
    - Financial account numbers
  - Request opt-in consent before processing sensitive data
  - Track opt-in consent (timestamp, scope, document)
  - Allow consent withdrawal → Stop processing sensitive data
- Right to correct UI:
  - Settings → Privacy → Correct My Data
  - User selects record/field to correct
  - System explains correction method (upload corrected document)
  - User uploads corrected document → New record created
  - System links original to corrected (superseded_by field)

**Acceptance Criteria:**

- ✅ GPC signals detected and honored
- ✅ Sensitive data opt-in consent requested
- ✅ Consent tracked and withdrawable
- ✅ Right to correct UI functional
- ✅ Correction workflow clear to users

**Risk:** Low (UI and preference management)

**Parallelization:** Can parallelize FU-925, FU-926, and FU-927 (all independent)

---

### Batch 17: US State Breach Notification (Week 23)

**Feature Units:**

- **FU-928**: US State Breach Notification

**Dependencies:** FU-923

**Deliverables:**

- US state breach notification:
  - California-specific requirements:
    - Notification to affected California residents
    - Specific notification content requirements
    - Timing requirements (may differ from GDPR)
  - State-specific notification templates:
    - California (CCPA/CPRA)
    - Virginia (VCDPA)
    - Colorado (CPA)
    - Connecticut (CTDPA)
  - Multi-state breach handling:
    - Identify affected users by state
    - Send state-specific notifications
    - Comply with strictest requirements

**Acceptance Criteria:**

- ✅ California breach notification compliant
- ✅ State-specific templates functional
- ✅ Multi-state breach handling works
- ✅ Notifications sent per state requirements

**Risk:** Medium (compliance-critical)

**Parallelization:** None (depends on breach notification)

---

## Critical Path Analysis

**Longest Path:** FU-906 → FU-900 → FU-901 → FU-902 (7 weeks)

**Legal Document Path:** FU-915 → FU-916 → FU-917 (2 weeks, independent)

**Bottlenecks:**

- Batch 2 (FU-900): Data export service is complex (E2EE handling)
- Batch 5 (FU-903): Bulk deletion service is high-risk (data loss)

**Optimization Opportunities:**

- Batch 1: Parallelize FU-910 and FU-911
- Batch 3: Parallelize FU-901 and FU-902
- Batch 8: Parallelize FU-904 and FU-905
- Batch 9: Parallelize FU-907 and FU-908
- Batch 10: Can start early (independent, no dependencies)
- Batch 11: Parallelize FU-916 and FU-917
- Batch 12: Parallelize FU-918 and FU-919 (consent + cookies)
- Batch 14: Parallelize FU-921 and FU-922 (restrict + retention)
- Batch 15: Parallelize FU-923 and FU-924 (breach + processing records)
- Batch 16: Parallelize FU-925, FU-926, and FU-927 (GPC + sensitive consent + correct)
- Batches 10, 12, 14, 15, 16: Can run in parallel (all independent)
- Batch 10: Can start early (independent, no dependencies)
- Batch 11: Parallelize FU-916 and FU-917

---

## Risk Mitigation

**High-Risk Batches:**

- **Batch 1 (Identity Verification):** Security audit required
- **Batch 5 (Bulk Deletion):** Comprehensive testing, dry-run deletion
- **Batch 8 (Account Deletion):** Confirmation required, audit trail

**Mitigation Strategies:**

- Security audit before Batch 1 deployment
- Comprehensive testing for deletion batches
- Dry-run deletion testing (verify before actual deletion)
- Audit trail for all GDPR activities
- Fallback manual processes (if automation fails)

---

## Testing Strategy

**Unit Tests:**

- Each FU has unit tests (>85% coverage)
- Critical paths: 100% coverage

**Integration Tests:**

- Cross-FU integration tests (see `integration_tests.md`)
- E2EE-specific tests (decryption, lost keys)

**E2E Tests:**

- Full GDPR request workflows
- Identity verification flows
- Export and deletion flows

---

## Deployment Strategy

**Staging Deployment:**

- Deploy after Batch 9 completion
- End-to-end testing
- Security audit verification

**Production Rollout:**

- Gradual rollout (feature flag)
- Monitor request volume
- Monitor processing times
- Monitor error rates

---

## Success Metrics

**Key Metrics:**

- Request processing time (target: <24 hours, deadline: 30 days)
- Request success rate (target: >99%)
- Identity verification failure rate (target: <5%)
- Lost key scenario frequency (monitor)

**Alerts:**

- Request processing time > 25 days
- Request failure rate > 1%
- Identity verification failures > 5%

---









