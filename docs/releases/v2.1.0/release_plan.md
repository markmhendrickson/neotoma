## Release v2.1.0 — GDPR & US State Privacy Compliance

_(Automated Privacy Compliance for E2EE Architecture — GDPR, CCPA/CPRA, VCDPA, CPA, CTDPA)_

---

### Purpose

This document provides the overview and coordination framework for v2.1.0, which implements automated GDPR compliance features required legally and operationally for v2.0.0's E2EE architecture. With end-to-end encryption, GDPR requests require special handling since data is encrypted locally and the server cannot decrypt user data.

**Release Classification:**

- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Not Marketed (compliance release, no marketing activities)

- `execution_schedule.md` — FU execution plan with batches and dependencies
- `manifest.yaml` — FU list, dependencies, schedule, release type
- `integration_tests.md` — Cross-FU integration test specifications
- `status.md` — Live status tracking and decision log

---

### 1. Release Overview

- **Release ID**: `v2.1.0`
- **Name**: GDPR & US State Privacy Compliance
- **Release Type**: Not Marketed (compliance release, silent deployment)
- **Goal**: Implement automated privacy compliance features for GDPR (EU/EEA) and US state privacy laws (CCPA/CPRA, VCDPA, Colorado CPA, Connecticut CTDPA) that work with v2.0.0's E2EE architecture. Enable users to exercise all data subject rights through automated workflows, ensure consent management, and comply with breach notification requirements across jurisdictions.
- **Priority**: P0 (legal compliance requirement)
- **Target Ship Date**: TBD (must ship after v2.0.0, before EU user acquisition)
- **Discovery Required**: No (compliance-driven, not user-driven)
- **Marketing Required**: No (compliance release)
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **Legal Compliance**: `docs/legal/compliance.md` — GDPR procedures and requirements
- **Privacy Requirements**: `docs/subsystems/privacy.md` — Technical privacy implementation
- **E2EE Architecture**: `docs/releases/v2.0.0/release_plan.md` — E2EE architecture context

This release plan implements the GDPR procedures defined in `docs/legal/compliance.md` as automated features compatible with v2.0.0's E2EE architecture.

---

### 2. Scope

#### 2.1 Included Feature Units (P0 Critical Path)

**Phase 1: GDPR Data Export**

- `FU-900`: GDPR Data Export Service (compile all user data, handle encrypted local data)
- `FU-901`: GDPR Data Export API Endpoint (`/api/gdpr/export`)
- `FU-902`: GDPR Data Export UI (Settings → Privacy → Export My Data)

**Phase 2: GDPR Account Deletion**

- `FU-903`: GDPR Bulk Deletion Service (delete all user data, handle encrypted data cleanup)
- `FU-904`: GDPR Account Deletion API Endpoint (`/api/gdpr/delete`)
- `FU-905`: GDPR Account Deletion UI (Settings → Privacy → Delete My Account)

**Phase 3: GDPR Request Management**

- `FU-906`: GDPR Request Tracking System (request logging, status tracking, audit trail)
- `FU-907`: GDPR Request Management UI (request history, status, download exports)
- `FU-908`: GDPR Request Notification System (email notifications, deadline tracking)

**Phase 4: Identity Verification & Security**

- `FU-909`: GDPR Identity Verification (verify user identity before processing requests)
- `FU-910`: GDPR Request Rate Limiting (prevent abuse, limit request frequency)
- `FU-911`: GDPR Audit Logging (log all GDPR requests and fulfillments)

**Phase 5: E2EE-Specific Handling**

- `FU-912`: GDPR Export with Lost Keys (handle users who lost encryption keys)
- `FU-913`: GDPR Deletion of Encrypted Server Data (delete ciphertext from server)
- `FU-914`: GDPR Multi-Device Sync Cleanup (handle encrypted delta sync cleanup)

**Phase 6: Legal Document Publishing**

- `FU-915`: Legal Document Serving Service (serve Privacy Policy, Terms of Service from markdown source)
- `FU-916`: Legal Document API Endpoints (`/legal/privacy`, `/legal/terms`)
- `FU-917`: Legal Document UI Links (footer links, Settings → Legal, signup/login links)

**Phase 7: Consent Management & Additional GDPR Rights**

- `FU-918`: Consent Management System (track consent records, consent withdrawal, consent history)
- `FU-919`: Cookie Consent Banner (GDPR cookie consent, preference management)
- `FU-920`: Terms/Privacy Acceptance Tracking (track which users accepted which version)
- `FU-921`: Right to Restrict Processing UI (Settings → Privacy → Restrict Processing toggle)
- `FU-922`: Data Retention Enforcement (automated deletion after retention period)

**Phase 8: Breach Notification & Compliance Automation**

- `FU-923`: Breach Notification Automation (72-hour notification workflow, DPA notification templates)
- `FU-924`: Records of Processing Activities Generator (automated generation from system data)

**Phase 9: US State Privacy Law Compliance**

- `FU-925`: Global Privacy Control (GPC) Signal Support (honor GPC opt-out signals)
- `FU-926`: Sensitive Data Opt-In Consent (CPRA/VCDPA/CPA/CTDPA requirement for sensitive data processing)
- `FU-927`: Right to Correct UI (CPRA/VCDPA/CPA/CTDPA right to correct inaccurate data)
- `FU-928`: US State Breach Notification (California-specific breach notification requirements)

#### 2.2 Explicitly Excluded

- Manual GDPR request processing (replaced by automated workflows)
- GDPR request processing for v1.0.0 plaintext data (handled separately if needed)
- Data rectification automation (manual process due to immutable truth layer)
- Processing restriction automation (manual flag setting, future enhancement)

---

### 3. Release-Level Acceptance Criteria

**Product:**

- ✅ Users can request data export via UI (Settings → Privacy)
- ✅ Users receive data export within 30 days (automated)
- ✅ Users can request account deletion via UI (Settings → Privacy)
- ✅ Account deletion completes within 30 days (automated)
- ✅ Users can track request status (pending, processing, completed)
- ✅ Users receive email notifications for request status changes
- ✅ Data exports include all user data (records, entities, events, subscriptions, usage)
- ✅ Data exports work with encrypted local data (decrypt locally, export plaintext)
- ✅ Account deletion removes all user data (local + server encrypted data)
- ✅ Privacy Policy and Terms of Service available via website (`/legal/privacy`, `/legal/terms`)
- ✅ Legal documents linked in footer and signup/login flows
- ✅ Cookie consent banner displayed (GDPR requirement)
- ✅ Consent records tracked (timestamp, method, scope)
- ✅ Terms/Privacy acceptance tracked (which version each user accepted)
- ✅ Users can restrict processing via UI toggle
- ✅ Users can withdraw consent via UI
- ✅ Automated data retention enforcement (delete after retention period)

**Technical:**

- ✅ GDPR export API endpoint functional (`/api/gdpr/export`)
- ✅ GDPR deletion API endpoint functional (`/api/gdpr/delete`)
- ✅ Request tracking system logs all requests and fulfillments
- ✅ Identity verification prevents unauthorized requests
- ✅ Rate limiting prevents abuse (max 1 export per 30 days, 1 deletion per account lifetime)
- ✅ Audit logging captures all GDPR activities
- ✅ E2EE compatibility: exports decrypt local data, delete encrypted server data
- ✅ Lost key handling: export server ciphertext if user lost keys (with warning)
- ✅ Multi-device sync cleanup: delete encrypted deltas from server
- ✅ Legal documents served from markdown source (version-controlled)
- ✅ Legal document versioning and changelog tracking
- ✅ Consent management system operational
- ✅ Cookie consent functional
- ✅ Breach notification automation functional (72-hour workflow)
- ✅ Records of processing activities auto-generated
- ✅ Global Privacy Control (GPC) signal support (US state compliance)
- ✅ Sensitive data opt-in consent tracked (CPRA/VCDPA/CPA/CTDPA)
- ✅ Right to correct UI functional (US state compliance)
- ✅ US state breach notification compliant (California requirements)
- ✅ 100% test coverage on GDPR critical paths

**Business:**

- ✅ GDPR compliance: All data subject rights automated
- ✅ Legal compliance: Meets GDPR 30-day response deadline
- ✅ Operational efficiency: Automated workflows reduce manual support burden
- ✅ Zero manual GDPR request processing required (all automated)

---

### 4. Cross-FU Integration Scenarios

**See `integration_tests.md` for complete integration test specifications.**

**Summary of Integration Scenarios:**

1. **GDPR Data Export Flow (E2EE)**

   - User requests export via UI → Identity verification → System compiles data:
     - Local encrypted data (decrypt locally) → Records, entities, events
     - Server encrypted data (export ciphertext with decryption instructions)
     - Subscription data (from Supabase, unencrypted)
     - Usage metrics (from Supabase, unencrypted)
   - Export packaged as JSON/CSV → User downloads → Email notification sent

2. **GDPR Account Deletion Flow (E2EE)**

   - User requests deletion via UI → Identity verification → Confirmation required
   - System deletes:
     - Local encrypted data (delete SQLite database, OPFS files)
     - Server encrypted data (delete ciphertext from Supabase)
     - Encrypted delta sync data (delete from server)
     - Subscription data (cancel subscription, delete from Supabase)
     - Usage metrics (delete from Supabase)
   - Deletion confirmed → Email notification sent → Account disabled

3. **GDPR Request Tracking Flow**

   - User submits request → Request logged → Status: "pending"
   - System processes request → Status: "processing" → Email notification
   - Request completed → Status: "completed" → Email notification with download link
   - User views request history → Sees all past requests with status

4. **Lost Key Handling Flow**

   - User requests export but lost encryption keys → System detects missing keys
   - System exports server ciphertext with instructions → Warns user about data loss
   - User can attempt key recovery (if backup exists) → Re-request export with keys

5. **Multi-Device Sync Cleanup Flow**

   - User requests deletion → System identifies encrypted deltas on server
   - System deletes encrypted deltas → Verifies cleanup → Completes deletion

6. **Legal Document Access Flow**

   - User visits website → Footer links to Privacy Policy and Terms of Service
   - User clicks "Privacy Policy" → Navigates to `/legal/privacy` → Document rendered from markdown
   - User clicks "Terms of Service" → Navigates to `/legal/terms` → Document rendered from markdown
   - User signs up → Required to accept Terms of Service → Link to full document
   - User views Settings → Legal section → Links to Privacy Policy and Terms of Service

7. **Cookie Consent Flow**

   - User visits website → Cookie consent banner displayed
   - User accepts/rejects cookies → Preferences saved
   - User can manage cookie preferences → Settings → Privacy → Cookie Preferences
   - Consent records tracked (timestamp, preferences)

8. **Consent Management Flow**

   - User signs up → Consent recorded (timestamp, method: signup, scope: service provision)
   - User uploads document → Consent recorded (timestamp, method: upload, scope: document processing)
   - User withdraws consent → Settings → Privacy → Withdraw Consent
   - System blocks new processing → Existing data retained
   - Consent history displayed → User can view all consent records

9. **Right to Restrict Processing Flow**

   - User restricts processing → Settings → Privacy → Restrict Processing toggle
   - System sets `processing_restricted = true` → Blocks new data ingestion
   - User can lift restriction → Toggle off → Processing resumes

10. **Data Retention Enforcement Flow**

    - System checks retention policies → Identifies data exceeding retention period
    - System notifies user → Email notification (30 days before deletion)
    - System deletes expired data → Automated deletion after retention period
    - Deletion logged → Audit trail

11. **Breach Notification Flow**

    - Breach detected → System creates breach record
    - System assesses risk → High/Medium/Low classification
    - System generates DPA notification → Template populated with breach details
    - System sends notification → Within 72 hours (automated)
    - System notifies affected users → If high risk (automated)

12. **Global Privacy Control (GPC) Flow**

    - User enables GPC signal in browser → System detects GPC header
    - System honors GPC signal → Sets opt-out preferences automatically
    - System blocks targeted advertising/profiling → If applicable
    - User can manage preferences → Settings → Privacy → Opt-Out Preferences

13. **Sensitive Data Opt-In Consent Flow**

    - User uploads document containing sensitive data → System detects sensitive data
    - System requests opt-in consent → "This document contains sensitive data. Do you consent to processing?"
    - User grants consent → System records opt-in consent (timestamp, scope)
    - User can withdraw consent → Settings → Privacy → Withdraw Sensitive Data Consent
    - System stops processing sensitive data → If consent withdrawn

14. **Right to Correct Flow (US States)**

    - User requests correction → Settings → Privacy → Correct My Data
    - System identifies incorrect data → User selects record/field to correct
    - System explains correction method → Upload corrected document (immutable truth layer)
    - User uploads corrected document → New record created with correct data
    - System links original to corrected → Original record marked as superseded

All scenarios must pass end-to-end before v2.1.0 is approved for deployment.

---

### 5. E2EE-Specific Considerations

**Challenge:** With E2EE, GDPR requests require special handling:

1. **Data Export:**

   - Local data is encrypted → Must decrypt locally before export
   - Server data is encrypted → Export ciphertext with decryption instructions
   - User must have encryption keys → Handle lost key scenario

2. **Data Deletion:**

   - Local data deletion → Delete SQLite database, OPFS files
   - Server data deletion → Delete ciphertext (server cannot decrypt anyway)
   - Encrypted sync data → Delete encrypted deltas from server

3. **Identity Verification:**

   - Standard email verification → Verify user owns account
   - Additional verification → Require password or 2FA for sensitive requests

4. **Request Processing:**
   - Cannot process on server → Must process in browser (local data)
   - Server-side processing → Only for server-stored data (subscriptions, metrics)

**Solution Architecture:**

- **Browser-Side Processing:** Export/delete local encrypted data in browser
- **Server-Side Processing:** Export/delete server-stored data (subscriptions, metrics, ciphertext)
- **Hybrid Approach:** Browser initiates request → Server coordinates → Browser processes local data → Server processes server data → Combined result

---

### 6. GDPR Request Types

**Right to Access (Article 15):**

- **Automated:** ✅ Data export feature (FU-900, FU-901, FU-902)
- **Response Time:** 30 days (automated, typically <24 hours)
- **Format:** JSON or CSV export

**Right to Erasure (Article 17):**

- **Automated:** ✅ Account deletion feature (FU-903, FU-904, FU-905)
- **Response Time:** 30 days (automated, typically <24 hours)
- **Scope:** All user data deleted (local + server)

**Right to Data Portability (Article 20):**

- **Automated:** ✅ Same as Right to Access (data export)
- **Response Time:** 30 days (automated)
- **Format:** Machine-readable (JSON, CSV)

**Right to Rectification (Article 16):**

- **Manual:** ⚠️ Not automated (immutable truth layer limitation)
- **Process:** User uploads corrected document → New record created
- **Documentation:** Handled via support tickets

**Right to Object (Article 21):**

- **Manual:** ⚠️ Not automated (requires assessment)
- **Process:** Support ticket → Assessment → Decision → Notification
- **Future:** Could be automated with processing restriction flag

**Right to Restrict Processing (Article 18):**

- **Automated:** ✅ UI toggle feature (FU-921)
- **Response Time:** Immediate (automated)
- **Process:** User toggles restriction → System blocks new ingestion → Existing data retained

**Consent Management (Article 7):**

- **Automated:** ✅ Consent tracking system (FU-918)
- **Features:** Consent records, consent withdrawal, consent history
- **Compliance:** GDPR requires consent records (timestamp, method, scope)

**Cookie Consent (ePrivacy Directive):**

- **Automated:** ✅ Cookie consent banner (FU-919)
- **Features:** Cookie preferences, consent tracking
- **Compliance:** GDPR/ePrivacy requires cookie consent

**Data Retention Enforcement:**

- **Automated:** ✅ Automated deletion after retention period (FU-922)
- **Features:** Retention policy enforcement, user notification before deletion
- **Compliance:** GDPR requires data retention policies

**Breach Notification (Article 33/34):**

- **Automated:** ✅ Breach notification workflow (FU-923)
- **Response Time:** 72 hours (automated workflow)
- **Features:** DPA notification templates, user notification automation

**Records of Processing Activities (Article 30):**

- **Automated:** ✅ Auto-generation from system data (FU-924)
- **Features:** Automated documentation, quarterly updates
- **Compliance:** GDPR requires records of processing activities

**US State Privacy Laws (CCPA/CPRA, VCDPA, Colorado CPA, Connecticut CTDPA):**

**Right to Opt-Out (CCPA/CPRA):**

- **Status:** Not applicable (Neotoma does not sell data)
- **Future-Proof:** ✅ GPC signal support (FU-925) — honor opt-out signals even if not selling

**Right to Limit Sensitive Data (CPRA):**

- **Automated:** ✅ Sensitive data opt-in consent (FU-926)
- **Features:** Opt-in consent for sensitive data processing, consent withdrawal
- **Compliance:** CPRA/VCDPA/CPA/CTDPA require opt-in consent for sensitive data

**Right to Correct (CPRA/VCDPA/CPA/CTDPA):**

- **Automated:** ✅ UI workflow (FU-927)
- **Process:** User requests correction → Upload corrected document → New record created
- **Compliance:** US state laws require right to correct inaccurate data

**Breach Notification (California):**

- **Automated:** ✅ US state breach notification (FU-928)
- **Requirements:** California-specific notification requirements (may differ from GDPR)
- **Compliance:** California requires breach notification to affected residents

**Non-Discrimination:**

- **Status:** ✅ Enforced (users cannot be denied service for exercising rights)
- **Implementation:** System allows all users to exercise rights without service impact

---

### 7. Pre-Mortem: Failure Mode Analysis

**Identified Failure Modes:**

1. **E2EE Export Decryption Failure** (Probability: Low, Impact: High)

   - **Early Warning:** Export failures, user reports
   - **Mitigation:** Comprehensive key validation, fallback to ciphertext export
   - **Rollback:** Manual export process as fallback

2. **Lost Key Scenario** (Probability: Medium, Impact: Medium)

   - **Early Warning:** Users report lost keys, cannot export
   - **Mitigation:** Export server ciphertext with instructions, key recovery guidance
   - **Rollback:** Manual export process with key recovery support

3. **Deletion Incomplete** (Probability: Low, Impact: Critical)

   - **Early Warning:** Audit logs show incomplete deletions, user reports
   - **Mitigation:** Comprehensive deletion verification, audit trail
   - **Rollback:** Manual cleanup process, restore from backup if needed

4. **Request Deadline Missed** (Probability: Low, Impact: High)

   - **Early Warning:** Request queue backlog, processing delays
   - **Mitigation:** Automated processing, queue monitoring, alerts
   - **Rollback:** Manual processing escalation

5. **Identity Verification Bypass** (Probability: Low, Impact: Critical)
   - **Early Warning:** Unauthorized requests, security audit findings
   - **Mitigation:** Strong identity verification, rate limiting, audit logging
   - **Rollback:** Disable automated processing, manual verification required

---

### 8. Success Criteria

**v2.1.0 is Complete When:**

1. ✅ All Phase 1-8 Feature Units deployed
2. ✅ GDPR export functional (works with E2EE)
3. ✅ GDPR deletion functional (works with E2EE)
4. ✅ Request tracking system operational
5. ✅ Identity verification working
6. ✅ Audit logging complete
7. ✅ Lost key handling implemented
8. ✅ Multi-device sync cleanup working
9. ✅ Legal documents published and accessible via website
10. ✅ Consent management system operational
11. ✅ Cookie consent functional
12. ✅ Terms/Privacy acceptance tracking operational
13. ✅ Right to restrict processing UI functional
14. ✅ Data retention enforcement automated
15. ✅ Breach notification automation functional
16. ✅ Records of processing activities auto-generated
17. ✅ Global Privacy Control (GPC) signal support functional
18. ✅ Sensitive data opt-in consent tracked
19. ✅ Right to correct UI functional
20. ✅ US state breach notification compliant
21. ✅ All integration tests passing
22. ✅ Legal compliance verified (GDPR 30-day deadline, 72-hour breach notification, US state requirements)

---

### 9. Dependencies

**Required Pre-Release:**

- v2.0.0 (E2EE) must be deployed and stable
- E2EE architecture must be functional (local datastore, encryption, sync)

**External Dependencies:**

- Email service (for notifications) — Supabase Auth or SendGrid
- Request storage (for tracking) — Supabase database
- File storage (for exports) — Supabase Storage or S3
- Legal review — Privacy Policy and Terms of Service require legal counsel review before publishing (see `docs/legal/README.md`)

---

### 10. Risk Assessment

**High-Risk Areas:**

- E2EE compatibility (decryption, lost keys)
- Data deletion completeness (local + server cleanup)
- Identity verification security (prevent unauthorized access)
- Request deadline compliance (30-day GDPR requirement)

**Mitigation:**

- Comprehensive testing (unit, integration, E2E)
- Security audit (identity verification, rate limiting)
- Automated monitoring (request queue, processing time)
- Fallback manual processes (if automation fails)

---

### 11. Post-Release Monitoring

**Key Metrics:**

- GDPR export request volume
- GDPR deletion request volume
- Request processing time (target: <24 hours, deadline: 30 days)
- Request success rate (target: >99%)
- Lost key scenario frequency
- Identity verification failure rate

**Alerts:**

- Request processing time > 25 days (approaching deadline)
- Request failure rate > 1%
- Identity verification failures > 5%
- Lost key scenarios > 10% of requests

---

### 12. Related Documentation

**For Implementation:**

- `docs/legal/compliance.md` — GDPR procedures and requirements
- `docs/legal/privacy_policy.md` — Privacy Policy template (source for website)
- `docs/legal/terms_of_service.md` — Terms of Service template (source for website)
- `docs/legal/privacy_policy_changelog.md` — Privacy Policy version history
- `docs/legal/terms_of_service_changelog.md` — Terms of Service version history
- `docs/subsystems/privacy.md` — Technical privacy implementation
- `docs/releases/v2.0.0/release_plan.md` — E2EE architecture context

**For Users:**

- Privacy Policy (`/legal/privacy`) — Published via website
- Terms of Service (`/legal/terms`) — Published via website
- GDPR request guide (to be created)

---

### 13. Release Timeline (Tentative)

**Assumption:** All timeline estimates assume Cursor agent execution (not human developers).

**Phase 1: GDPR Data Export** (Weeks 1-2)

- FU-900, FU-901, FU-902

**Phase 2: GDPR Account Deletion** (Weeks 3-4)

- FU-903, FU-904, FU-905

**Phase 3: GDPR Request Management** (Weeks 5-6)

- FU-906, FU-907, FU-908

**Phase 4: Identity Verification & Security** (Weeks 7-8)

- FU-909, FU-910, FU-911

**Phase 5: E2EE-Specific Handling** (Weeks 9-10)

- FU-912, FU-913, FU-914

**Phase 6: Legal Document Publishing** (Weeks 11-12)

- FU-915, FU-916, FU-917

**Phase 7: Consent Management & Additional GDPR Rights** (Weeks 13-15)

- FU-918, FU-919, FU-920, FU-921, FU-922

**Phase 8: Breach Notification & Compliance Automation** (Weeks 16-17)

- FU-923, FU-924

**Phase 9: US State Privacy Law Compliance** (Weeks 18-19)

- FU-925, FU-926, FU-927, FU-928

**Testing & Security Audit** (Weeks 20-21)

- Integration tests
- Security audit (identity verification)
- Performance testing

**Staging Deployment** (Week 22)

- Staging deployment
- End-to-end testing

**Production Rollout** (Week 23)

- Production deployment
- Monitoring

**Total Estimated Duration:** 23 weeks (5.75 months, assumes Cursor agent execution)

---

### 14. Decision Log

**Key Decisions:**

1. **2025-01-XX**: GDPR compliance release scheduled for v2.1.0 (post-E2EE)

   - **Rationale**: E2EE architecture requires special GDPR handling; compliance is legal requirement
   - **Status**: Approved

2. **2025-01-XX**: Automated GDPR workflows (not manual)

   - **Rationale**: Operational efficiency, legal compliance (30-day deadline), scalability
   - **Status**: Approved

3. **2025-01-XX**: E2EE-specific handling (lost keys, encrypted data)

   - **Rationale**: E2EE architecture requires special handling for encrypted data
   - **Status**: Approved

4. **2025-01-XX**: Not marketed release (compliance, not feature)

   - **Rationale**: Compliance release, no marketing activities needed
   - **Status**: Approved

5. **2025-01-XX**: Legal documents included in v2.1.0 (Privacy Policy, Terms of Service)

   - **Rationale**: Legal documents required for GDPR compliance, must be publicly accessible via website
   - **Status**: Approved
   - **Note**: Legal review required before publishing (see `docs/legal/README.md`)

6. **2025-01-XX**: US state privacy law compliance included (CCPA/CPRA, VCDPA, CPA, CTDPA)
   - **Rationale**: US state privacy laws require specific features (GPC support, sensitive data consent, right to correct, state-specific breach notification)
   - **Status**: Approved
   - **Note**: Even though Neotoma doesn't sell data, GPC support is future-proof and demonstrates compliance

---

### 15. Next Steps

1. Create detailed Feature Unit specs (FU-900 through FU-928)
2. Create execution schedule with batches
3. Create integration test specifications
4. Set target ship date based on v2.0.0 completion
5. Schedule security audit (identity verification, consent management)
6. Legal review of Privacy Policy and Terms of Service (required before publishing)
7. Legal review of cookie consent implementation (ePrivacy compliance)
8. Legal review of US state privacy law compliance (CCPA/CPRA, VCDPA, CPA, CTDPA)

---









