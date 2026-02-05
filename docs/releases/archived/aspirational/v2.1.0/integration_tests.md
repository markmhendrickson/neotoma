# Release v2.1.0 Integration Tests
## Test Categories
1. **GDPR Export Integration Tests** — Data export with E2EE
2. **GDPR Deletion Integration Tests** — Account deletion with E2EE
3. **Request Management Integration Tests** — Request tracking and notifications
4. **Identity Verification Integration Tests** — Security and authorization
5. **E2EE-Specific Integration Tests** — Lost keys, encrypted data handling
6. **Legal Document Integration Tests** — Privacy Policy and Terms of Service access
7. **Consent Management Integration Tests** — Consent tracking and withdrawal
8. **Cookie Consent Integration Tests** — Cookie consent banner and preferences
9. **Additional GDPR Rights Integration Tests** — Restrict processing, data retention
10. **Breach Notification Integration Tests** — 72-hour notification workflow
11. **Compliance Automation Integration Tests** — Processing records generation
12. **US State Privacy Law Integration Tests** — GPC signals, sensitive data consent, right to correct, state breach notification
## IT-001: GDPR Data Export Flow (E2EE)
**Goal:** Verify that users can request and receive data exports with encrypted local data.
**Preconditions:**
- System running with v2.0.0 E2EE deployed
- System running with FU-900, FU-901, FU-902, FU-906, FU-909 deployed
- User has encryption keys
- User has local encrypted records
- User has server encrypted records
**Steps:**
1. User navigates to Settings → Privacy
2. User clicks "Export My Data"
3. System prompts for identity verification (email code)
4. User enters verification code
5. System creates GDPR export request (status: "pending")
6. System processes export request:
   - Decrypts local encrypted records
   - Retrieves server encrypted records (ciphertext)
   - Retrieves subscription data
   - Retrieves usage metrics
   - Packages export (JSON/CSV)
7. System updates request status (status: "completed")
8. System sends email notification with download link
9. User downloads export file
10. User verifies export contains all data
**Expected Results:**
- ✅ Identity verification required
- ✅ Export request created
- ✅ Local encrypted data decrypted successfully
- ✅ Server ciphertext included with instructions
- ✅ Export file contains all user data
- ✅ Email notification sent
- ✅ Download link works
**Machine-Checkable:**
- Assert identity verification required
- Assert export request created
- Assert local data decrypted
- Assert export file format valid (JSON/CSV)
- Assert email notification sent
- Assert download link accessible
## IT-002: GDPR Account Deletion Flow (E2EE)
**Goal:** Verify that users can request and complete account deletion with encrypted data cleanup.
**Preconditions:**
- System running with v2.0.0 E2EE deployed
- System running with FU-903, FU-904, FU-905, FU-906, FU-909, FU-913, FU-914 deployed
- User has encryption keys
- User has local encrypted records
- User has server encrypted records
- User has active subscription
**Steps:**
1. User navigates to Settings → Privacy
2. User clicks "Delete My Account"
3. System shows confirmation dialog (warn about data loss)
4. User confirms deletion (types "DELETE")
5. System prompts for identity verification (password + email code)
6. User enters password and verification code
7. System creates GDPR deletion request (status: "pending")
8. System processes deletion request:
   - Deletes local SQLite database
   - Deletes OPFS files
   - Deletes server encrypted ciphertext
   - Deletes encrypted delta sync data
   - Cancels subscription
   - Deletes subscription records
   - Deletes usage metrics
9. System verifies deletion completion
10. System updates request status (status: "completed")
11. System disables user account
12. System sends email notification (deletion completed)
**Expected Results:**
- ✅ Confirmation required (prevent accidental deletion)
- ✅ Identity verification required (password + email)
- ✅ Deletion request created
- ✅ Local data deleted (SQLite, OPFS)
- ✅ Server data deleted (ciphertext, subscriptions, metrics)
- ✅ Encrypted delta sync data deleted
- ✅ Account disabled
- ✅ Email notification sent
**Machine-Checkable:**
- Assert confirmation required
- Assert identity verification required
- Assert deletion request created
- Assert local data deleted (verify SQLite empty, OPFS cleared)
- Assert server data deleted (verify Supabase records deleted)
- Assert account disabled
- Assert email notification sent
## IT-003: GDPR Request Tracking Flow
**Goal:** Verify that users can track GDPR request status and view request history.
**Preconditions:**
- System running with FU-906, FU-907, FU-908 deployed
- User has submitted export request
- User has submitted deletion request (completed)
**Steps:**
1. User navigates to Settings → Privacy → Request History
2. System displays request history (all past requests)
3. User views export request (status: "completed")
4. User clicks download link
5. System serves export file
6. User views deletion request (status: "completed")
7. User views request details (type, date, status)
**Expected Results:**
- ✅ Request history displayed
- ✅ Request status accurate
- ✅ Download links work
- ✅ Request details complete
**Machine-Checkable:**
- Assert request history displayed
- Assert request status correct
- Assert download links accessible
- Assert request details complete
## IT-004: Identity Verification Flow
**Goal:** Verify that identity verification prevents unauthorized GDPR requests.
**Preconditions:**
- System running with FU-909 deployed
- User A has account
- User B (different account) attempts to access User A's data
**Steps:**
1. User B attempts to request export for User A's account
2. System requires identity verification
3. User B cannot provide User A's verification code
4. System rejects request
5. System logs failed verification attempt
6. User A requests export (legitimate)
7. System requires identity verification
8. User A provides correct verification code
9. System approves request
**Expected Results:**
- ✅ Unauthorized requests blocked
- ✅ Identity verification required
- ✅ Failed attempts logged
- ✅ Legitimate requests approved
**Machine-Checkable:**
- Assert unauthorized requests blocked
- Assert identity verification required
- Assert failed attempts logged
- Assert legitimate requests approved
## IT-005: Rate Limiting Flow
**Goal:** Verify that rate limiting prevents abuse of GDPR request endpoints.
**Preconditions:**
- System running with FU-910 deployed
- User has account
**Steps:**
1. User requests data export (first request)
2. System processes request (approved)
3. User immediately requests second export (< 30 days)
4. System rejects request (rate limit exceeded)
5. System returns error message
6. User waits 30 days
7. User requests export again
8. System processes request (approved)
**Expected Results:**
- ✅ First request approved
- ✅ Second request rejected (rate limit)
- ✅ Error message clear
- ✅ Request approved after waiting period
**Machine-Checkable:**
- Assert first request approved
- Assert second request rejected
- Assert error message returned
- Assert request approved after waiting period
## IT-006: Lost Key Export Flow
**Goal:** Verify that data export works when user has lost encryption keys.
**Preconditions:**
- System running with FU-900, FU-912 deployed
- User has lost encryption keys
- User has server encrypted records
**Steps:**
1. User requests data export
2. System detects missing encryption keys
3. System warns user about data loss
4. System exports server ciphertext only
5. System includes decryption instructions
6. System includes key recovery guidance
7. User receives export file (ciphertext only)
8. User attempts key recovery (if backup exists)
9. User re-requests export with recovered keys
10. System exports decrypted data
**Expected Results:**
- ✅ Lost key scenario detected
- ✅ User warned about data loss
- ✅ Server ciphertext exported with instructions
- ✅ Key recovery guidance provided
- ✅ Export with recovered keys works
**Machine-Checkable:**
- Assert lost key detected
- Assert warning displayed
- Assert server ciphertext exported
- Assert decryption instructions included
- Assert export with recovered keys works
## IT-007: Multi-Device Sync Cleanup Flow
**Goal:** Verify that account deletion cleans up encrypted delta sync data from server.
**Preconditions:**
- System running with FU-903, FU-914 deployed
- User has multiple devices
- User has encrypted delta sync data on server
**Steps:**
1. User requests account deletion
2. System processes deletion:
   - Deletes local data (all devices)
   - Deletes server encrypted ciphertext
   - Deletes encrypted delta sync data
   - Verifies cleanup completion
3. System verifies no encrypted deltas remain
4. System completes deletion
**Expected Results:**
- ✅ Encrypted delta sync data deleted
- ✅ Cleanup verified
- ✅ No encrypted deltas remain
**Machine-Checkable:**
- Assert encrypted deltas deleted
- Assert cleanup verified
- Assert no encrypted deltas remain
## IT-008: Audit Logging Flow
**Goal:** Verify that all GDPR activities are logged for compliance audits.
**Preconditions:**
- System running with FU-911 deployed
- User requests export
- User requests deletion
**Steps:**
1. User requests export
2. System logs request (timestamp, user_id, type)
3. System processes export
4. System logs fulfillment (timestamp, request_id, status)
5. User requests deletion
6. System logs request (timestamp, user_id, type)
7. System processes deletion
8. System logs fulfillment (timestamp, request_id, status)
9. Admin views audit logs
10. System displays all GDPR activities
**Expected Results:**
- ✅ All requests logged
- ✅ All fulfillments logged
- ✅ Audit trail complete
- ✅ Audit logs accessible
**Machine-Checkable:**
- Assert requests logged
- Assert fulfillments logged
- Assert audit trail complete
- Assert audit logs accessible
## IT-009: Email Notification Flow
**Goal:** Verify that users receive email notifications for GDPR request status changes.
**Preconditions:**
- System running with FU-908 deployed
- User requests export
- User requests deletion
**Steps:**
1. User requests export
2. System sends email notification (request received)
3. System processes export
4. System sends email notification (export ready, download link)
5. User requests deletion
6. System sends email notification (deletion request received)
7. System processes deletion
8. System sends email notification (deletion completed)
**Expected Results:**
- ✅ Email notifications sent for all status changes
- ✅ Download links included in export notifications
- ✅ Notifications clear and actionable
**Machine-Checkable:**
- Assert email notifications sent
- Assert download links included
- Assert notification content correct
## IT-010: Deadline Compliance Flow
**Goal:** Verify that GDPR requests are fulfilled within 30-day deadline.
**Preconditions:**
- System running with all GDPR FUs deployed
- User requests export
- System processes requests automatically
**Steps:**
1. User requests export (Day 0)
2. System processes request automatically
3. System completes export (Day 0, < 24 hours)
4. System sends notification (export ready)
5. User requests deletion (Day 0)
6. System processes request automatically
7. System completes deletion (Day 0, < 24 hours)
8. System sends notification (deletion completed)
9. System verifies all requests completed within 30 days
**Expected Results:**
- ✅ Requests processed automatically
- ✅ Requests completed within 30 days (typically < 24 hours)
- ✅ Deadline compliance verified
**Machine-Checkable:**
- Assert requests processed automatically
- Assert completion time < 30 days
- Assert deadline compliance verified
## Test Execution Strategy
**Test Environment:**
- Staging environment with v2.0.0 E2EE deployed
- Test users with encryption keys
- Test users with encrypted data
- Email service configured (test mode)
**Test Data:**
- Local encrypted records (various types)
- Server encrypted records (ciphertext)
- Subscription data
- Usage metrics
- Encrypted delta sync data
**Test Execution Order:**
1. IT-001: GDPR Data Export Flow (foundational)
2. IT-004: Identity Verification Flow (security)
3. IT-005: Rate Limiting Flow (security)
4. IT-006: Lost Key Export Flow (edge case)
5. IT-002: GDPR Account Deletion Flow (critical)
6. IT-007: Multi-Device Sync Cleanup Flow (E2EE-specific)
7. IT-003: GDPR Request Tracking Flow (management)
8. IT-008: Audit Logging Flow (compliance)
9. IT-009: Email Notification Flow (user experience)
10. IT-010: Deadline Compliance Flow (compliance)
11. IT-011: Legal Document Access Flow (legal compliance)
12. IT-012: Signup Terms Acceptance Flow (legal compliance)
13. IT-013: Cookie Consent Flow (GDPR/ePrivacy compliance)
14. IT-014: Consent Management Flow (GDPR compliance)
15. IT-015: Right to Restrict Processing Flow (GDPR compliance)
16. IT-016: Data Retention Enforcement Flow (GDPR compliance)
17. IT-017: Breach Notification Flow (GDPR compliance)
18. IT-018: Records of Processing Activities Generation Flow (GDPR compliance)
19. IT-019: Global Privacy Control (GPC) Signal Flow (US state compliance)
20. IT-020: Sensitive Data Opt-In Consent Flow (US state compliance)
21. IT-021: Right to Correct Flow (US state compliance)
22. IT-022: US State Breach Notification Flow (US state compliance)
**Success Criteria:**
- ✅ All integration tests passing
- ✅ E2EE compatibility verified
- ✅ Security verified (identity verification, rate limiting)
- ✅ Compliance verified (30-day deadline, audit logging)
- ✅ Legal documents accessible and properly linked
- ✅ Terms acceptance required during signup
- ✅ Cookie consent functional and compliant
- ✅ Consent management operational
- ✅ Right to restrict processing functional
- ✅ Data retention enforcement automated
- ✅ Breach notification automated (72-hour compliance)
- ✅ Records of processing activities auto-generated
- ✅ Global Privacy Control (GPC) signals honored
- ✅ Sensitive data opt-in consent tracked
- ✅ Right to correct UI functional
- ✅ US state breach notification compliant
