# Release v2.1.0 Status
## Release Status
- **Release ID**: v2.1.0
- **Name**: GDPR & US State Privacy Compliance
- **Release Type**: Not Marketed (compliance release)
- **Deployment**: Production (neotoma.io)
- **Status**: Planning
- **Current Phase**: Pre-Release (awaiting v2.0.0 completion)
- **Marketing**: No (compliance release, no marketing activities)
- **Last Updated**: 2025-01-XX
## Feature Unit Status
| FU ID  | Name                              | Status         | Dependencies | Notes                                  |
| ------ | --------------------------------- | -------------- | ------------ | -------------------------------------- |
| FU-900 | GDPR Data Export Service          | ⏳ Not Started | FU-906       | E2EE complexity, decrypt local data    |
| FU-901 | GDPR Data Export API Endpoint     | ⏳ Not Started | FU-900       | Medium complexity                      |
| FU-902 | GDPR Data Export UI               | ⏳ Not Started | FU-901       | Low complexity                         |
| FU-903 | GDPR Bulk Deletion Service        | ⏳ Not Started | FU-906       | High-risk, data loss prevention        |
| FU-904 | GDPR Account Deletion API         | ⏳ Not Started | FU-903       | High-risk, irreversible action         |
| FU-905 | GDPR Account Deletion UI          | ⏳ Not Started | FU-904       | Medium complexity                      |
| FU-906 | GDPR Request Tracking System      | ⏳ Not Started | -            | Foundation, low complexity             |
| FU-907 | GDPR Request Management UI        | ⏳ Not Started | FU-906       | Low complexity                         |
| FU-908 | GDPR Request Notification System  | ⏳ Not Started | FU-906       | Medium complexity                      |
| FU-909 | GDPR Identity Verification        | ⏳ Not Started | FU-906       | High-risk, security-critical           |
| FU-910 | GDPR Request Rate Limiting        | ⏳ Not Started | -            | Low complexity                         |
| FU-911 | GDPR Audit Logging                | ⏳ Not Started | FU-906       | Low complexity                         |
| FU-912 | GDPR Export with Lost Keys        | ⏳ Not Started | FU-900       | Medium complexity, edge case           |
| FU-913 | GDPR Deletion of Encrypted Data   | ⏳ Not Started | FU-903       | Medium complexity, E2EE-specific       |
| FU-914 | GDPR Multi-Device Sync Cleanup    | ⏳ Not Started | FU-913       | Low complexity                         |
| FU-915 | Legal Document Serving Service    | ⏳ Not Started | -            | Low complexity                         |
| FU-916 | Legal Document API Endpoints      | ⏳ Not Started | FU-915       | Low complexity                         |
| FU-917 | Legal Document UI Links           | ⏳ Not Started | FU-916       | Low complexity                         |
| FU-918 | Consent Management System         | ⏳ Not Started | -            | Medium complexity, compliance-critical |
| FU-919 | Cookie Consent Banner             | ⏳ Not Started | -            | Medium complexity, GDPR requirement    |
| FU-920 | Terms/Privacy Acceptance Tracking | ⏳ Not Started | FU-917       | Low complexity                         |
| FU-921 | Right to Restrict Processing UI   | ⏳ Not Started | -            | Low complexity                         |
| FU-922 | Data Retention Enforcement        | ⏳ Not Started | -            | Medium complexity, data deletion risk  |
| FU-923 | Breach Notification Automation    | ⏳ Not Started | -            | Medium complexity, 72-hour compliance  |
| FU-924 | Processing Records Generator      | ⏳ Not Started | -            | Medium complexity                      |
| FU-925 | Global Privacy Control (GPC)      | ⏳ Not Started | -            | Low complexity, US state compliance    |
| FU-926 | Sensitive Data Opt-In Consent     | ⏳ Not Started | -            | Medium complexity, US state compliance |
| FU-927 | Right to Correct UI               | ⏳ Not Started | -            | Low complexity, US state compliance    |
| FU-928 | US State Breach Notification      | ⏳ Not Started | FU-923       | Medium complexity, US state compliance |
**Status Legend:**
- ⏳ Not Started
- 🔨 In Progress
- ✅ Complete
- ❌ Blocked
- 🚫 Cancelled
## Batch Progress
| Batch ID | Feature Units          | Status         | Dependencies | Target Date | Actual Date |
| -------- | ---------------------- | -------------- | ------------ | ----------- | ----------- |
| 0        | FU-906                 | ⏳ Not Started | -            | TBD         | -           |
| 1        | FU-909, FU-910, FU-911 | ⏳ Not Started | FU-906       | TBD         | -           |
| 2        | FU-900                 | ⏳ Not Started | FU-906       | TBD         | -           |
| 3        | FU-901, FU-902         | ⏳ Not Started | FU-900       | TBD         | -           |
| 4        | FU-912                 | ⏳ Not Started | FU-900       | TBD         | -           |
| 5        | FU-903                 | ⏳ Not Started | FU-906       | TBD         | -           |
| 6        | FU-913                 | ⏳ Not Started | FU-903       | TBD         | -           |
| 7        | FU-914                 | ⏳ Not Started | FU-913       | TBD         | -           |
| 8        | FU-904, FU-905         | ⏳ Not Started | FU-903       | TBD         | -           |
| 9        | FU-907, FU-908         | ⏳ Not Started | FU-906       | TBD         | -           |
## Checkpoint Status
| Checkpoint   | Status      | Target Date | Actual Date | Notes                                                                |
| ------------ | ----------- | ----------- | ----------- | -------------------------------------------------------------------- |
| Checkpoint 0 | ✅ Complete | 2025-01-XX  | 2025-01-XX  | Release planning complete                                            |
| Checkpoint 1 | ⏳ Pending  | TBD         | -           | After Batch 3 (export features)                                      |
| Checkpoint 2 | ⏳ Pending  | TBD         | -           | After Batch 8 (deletion features)                                    |
| Checkpoint 3 | ⏳ Pending  | TBD         | -           | After Batch 11 (legal documents)                                     |
| Checkpoint 4 | ⏳ Pending  | TBD         | -           | After Batch 17 (final review, includes all GDPR + US state features) |
## Dependencies
**Required Pre-Release:**
- ✅ v2.0.0 (E2EE) — **Status**: Planning (not yet deployed)
- ⚠️ E2EE architecture must be functional before starting v2.1.0
**External Dependencies:**
- Email service (Supabase Auth or SendGrid)
- Request storage (Supabase database)
- File storage (Supabase Storage or S3)
## Risks and Blockers
**Current Blockers:**
- ⚠️ **v2.0.0 not yet deployed** — Cannot start v2.1.0 until E2EE architecture is stable
**Identified Risks:**
- **E2EE Export Decryption Failure** (Probability: Low, Impact: High)
  - **Mitigation**: Comprehensive key validation, fallback to ciphertext export
  - **Status**: Monitoring
- **Lost Key Scenario** (Probability: Medium, Impact: Medium)
  - **Mitigation**: Export server ciphertext with instructions, key recovery guidance
  - **Status**: Monitoring
- **Deletion Incomplete** (Probability: Low, Impact: Critical)
  - **Mitigation**: Comprehensive deletion verification, audit trail
  - **Status**: Monitoring
- **Request Deadline Missed** (Probability: Low, Impact: High)
  - **Mitigation**: Automated processing, queue monitoring, alerts
  - **Status**: Monitoring
- **Identity Verification Bypass** (Probability: Low, Impact: Critical)
  - **Mitigation**: Strong identity verification, rate limiting, audit logging
  - **Status**: Monitoring
## Decision Log
**2025-01-XX: v2.1.0 Release Created**
- **Decision**: Create GDPR compliance release (v2.1.0) for E2EE architecture
- **Rationale**: Legal compliance requirement, operational efficiency, E2EE-specific handling needed
- **Status**: Approved
**2025-01-XX: Not Marketed Release**
- **Decision**: v2.1.0 is not marketed release (compliance, not feature)
- **Rationale**: Compliance release, no marketing activities needed
- **Status**: Approved
**2025-01-XX: Automated GDPR Workflows**
- **Decision**: Implement automated GDPR workflows (not manual)
- **Rationale**: Operational efficiency, legal compliance (30-day deadline), scalability
- **Status**: Approved
## Next Steps
1. ⏳ Wait for v2.0.0 (E2EE) deployment and stabilization
2. ⏳ Create detailed Feature Unit specs (FU-900 through FU-914)
3. ⏳ Schedule security audit (identity verification)
4. ⏳ Set target ship date based on v2.0.0 completion
5. ⏳ Begin Batch 0 execution (FU-906: Request Tracking System)
## Notes
- **Legal Compliance**: This release is required for GDPR compliance with E2EE architecture
- **E2EE Considerations**: Special handling needed for encrypted local data and server ciphertext
- **Automation**: All GDPR requests automated (no manual processing required)
- **Deadline**: Must meet GDPR 30-day response deadline (target: <24 hours automated)
- **Legal Documents**: Privacy Policy and Terms of Service published and accessible via website (`/legal/privacy`, `/legal/terms`)
- **Legal Review**: Privacy Policy and Terms of Service require legal review before publishing (see `docs/legal/README.md`)
- **Consent Management**: Consent records tracked for all user actions (GDPR Article 7 requirement)
- **Cookie Consent**: Cookie consent banner required for GDPR/ePrivacy compliance
- **Breach Notification**: 72-hour notification workflow automated (GDPR Article 33 requirement)
- **Processing Records**: Records of processing activities auto-generated (GDPR Article 30 requirement)
- **US State Compliance**: GPC signal support, sensitive data opt-in consent, right to correct, state-specific breach notification (CCPA/CPRA, VCDPA, CPA, CTDPA)
