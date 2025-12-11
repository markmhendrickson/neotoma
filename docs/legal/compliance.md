# Neotoma Legal & Compliance

_(GDPR, Data Protection, Incident Response, and Regulatory Compliance)_

---

## Purpose

This document defines legal and compliance procedures for Neotoma operations, including GDPR compliance, data breach response, incident management, and regulatory requirements. Ensures Neotoma operates within legal boundaries and maintains user trust through transparent data handling practices.

---

## Scope

This document covers:

- GDPR compliance procedures and data subject rights
- Data breach detection, assessment, and notification procedures
- Security incident response workflows
- Privacy policy and terms of service management
- Data Processing Agreements (DPAs) with vendors
- Vendor compliance and SLA requirements
- Compliance monitoring and audit procedures
- Data retention and deletion policies

This document does NOT cover:

- Technical security implementation (see `docs/subsystems/auth.md`, `docs/subsystems/privacy.md`)
- Product-specific privacy features (see `docs/subsystems/privacy.md`)
- Development workflow (see `docs/developer/development_workflow.md`)

---

## 1. GDPR Compliance

### 1.1 Legal Basis for Processing

**Lawful Basis:** User consent and contract performance

- **Consent:** Users explicitly upload documents and provide data via MCP actions
- **Contract:** Processing necessary to provide Neotoma service (document structuring, memory storage)
- **Legitimate Interest:** Service improvement, security, fraud prevention (minimal processing)

**Documentation Required:**

- Record legal basis per user/data category
- Maintain consent records (timestamp, method, scope)
- Document legitimate interest assessments

### 1.2 Data Subject Rights

**Right to Access (Article 15):**

**Procedure:**

1. User requests access via support ticket or `data_request@neotoma.com`
2. Verify user identity (email confirmation, account verification)
3. Compile all user data:
   - Records (from `records` table, filtered by `user_id`)
   - Entities (from `entities` table, linked via `record_entity_edges`)
   - Events (from `events` table, linked via `record_event_edges`)
   - Subscription data (from `subscriptions` table)
   - Usage metrics (from `usage_metrics` table)
4. Export to structured format (JSON or CSV)
5. Deliver within 30 days (or notify if extension needed, max 60 days)
6. Log request and fulfillment date

**Response Format:**

```json
{
  "request_id": "uuid",
  "request_date": "2025-01-15T10:00:00Z",
  "fulfillment_date": "2025-01-20T14:30:00Z",
  "data": {
    "records": [...],
    "entities": [...],
    "events": [...],
    "subscription": {...},
    "usage_metrics": [...]
  }
}
```

**Right to Rectification (Article 16):**

**Procedure:**

1. User requests correction via support ticket
2. Verify user identity and data ownership
3. Identify incorrect data (record, entity, or property)
4. **Limitation:** Neotoma stores immutable truth layer — cannot modify extracted data
5. **Solution:** User uploads corrected document → new record created with correct data
6. Document original record as superseded (add `superseded_by` field if needed)
7. Notify user of correction method

**Right to Erasure (Article 17):**

**Procedure:**

1. User requests deletion via support ticket or `delete_request@neotoma.com`
2. Verify user identity
3. Check legal basis:
   - **If consent-based:** Proceed with deletion
   - **If contract-based:** May retain if necessary for contract performance
   - **If legal obligation:** Retain if required by law (e.g., tax records)
4. Execute deletion:
   ```sql
   -- Delete user's records and related data
   DELETE FROM record_entity_edges WHERE record_id IN (
     SELECT id FROM records WHERE user_id = $1
   );
   DELETE FROM record_event_edges WHERE record_id IN (
     SELECT id FROM records WHERE user_id = $1
   );
   DELETE FROM records WHERE user_id = $1;
   -- Note: Entities may be shared; only delete if no other records reference them
   ```
5. Confirm deletion within 30 days
6. Log deletion request and execution date

**Right to Data Portability (Article 20):**

**Procedure:**

1. User requests data export via support ticket
2. Use same export process as Right to Access
3. Provide data in machine-readable format (JSON, CSV)
4. Include all user data in structured format
5. Deliver within 30 days

**Right to Object (Article 21):**

**Procedure:**

1. User objects to processing via support ticket
2. Assess objection:
   - **If legitimate interest:** Evaluate and stop if no overriding interest
   - **If direct marketing:** Stop immediately
3. Notify user of decision within 30 days
4. Document objection and resolution

**Right to Restrict Processing (Article 18):**

**Procedure:**

1. User requests restriction via support ticket
2. Implement restriction:
   - Flag user account: `processing_restricted = true`
   - Block new data ingestion (reject uploads, MCP writes)
   - Retain existing data but do not process further
3. Notify user of restriction implementation
4. Document restriction and date

### 1.3 Data Protection Impact Assessment (DPIA)

**When Required:**

- Before implementing new processing that poses high risk to data subjects
- Before using new third-party processors (e.g., LLM providers for extraction)
- Before implementing automated decision-making

**DPIA Process:**

1. **Identify processing activities:**

   - What data is processed?
   - Who is affected?
   - What are the risks?

2. **Assess necessity and proportionality:**

   - Is processing necessary for service?
   - Are there less invasive alternatives?

3. **Identify and assess risks:**

   - Unauthorized access to PII
   - Data loss or corruption
   - Inability to fulfill data subject rights

4. **Identify mitigating measures:**

   - Encryption at rest and in transit
   - Row-Level Security (RLS)
   - Access controls and audit logs
   - Regular security assessments

5. **Document DPIA:**
   - Store in `docs/legal/dpias/` directory
   - Review annually or when processing changes

**Example DPIA Triggers:**

- Implementing LLM-assisted extraction (processes user documents)
- Adding new external provider (Gmail, Plaid) that accesses user data
- Implementing automated entity resolution that may misidentify individuals

### 1.4 Records of Processing Activities (Article 30)

**Required Documentation:**

| Field                           | Description               | Example                                                   |
| ------------------------------- | ------------------------- | --------------------------------------------------------- |
| **Purpose**                     | Why data is processed     | Document structuring, memory storage, AI access           |
| **Categories of data subjects** | Who data relates to       | Neotoma users, entities in documents                      |
| **Categories of personal data** | What data is processed    | Names, addresses, financial data, IDs (from `properties`) |
| **Recipients**                  | Who receives data         | User (data owner), AI agents via MCP (with user consent)  |
| **Third countries**             | Data transfers outside EU | Supabase (US), Fly.io (US) — requires safeguards          |
| **Retention periods**           | How long data is kept     | Until user deletion request                               |
| **Security measures**           | How data is protected     | Encryption, RLS, access controls                          |

**Maintenance:**

- Update quarterly or when processing changes
- Store in `docs/legal/processing_records.md`

---

## 2. Data Breach Response Plan

### 2.1 Breach Detection

**Detection Sources:**

- Security monitoring alerts (unusual access patterns, failed auth attempts)
- User reports (unauthorized access, data exposure)
- Vendor notifications (Supabase, Fly.io security incidents)
- Internal audits (access log reviews)

**Breach Indicators:**

- Unauthorized access to user accounts
- Unauthorized access to database (service_role key compromise)
- Data exfiltration (unusual data exports)
- Ransomware or malware affecting systems
- Physical security breach (server access)

### 2.2 Breach Assessment

**Immediate Assessment (Within 1 Hour):**

1. **Contain breach:**

   - Revoke compromised credentials
   - Isolate affected systems
   - Block suspicious IP addresses
   - Disable affected user accounts if needed

2. **Assess scope:**

   - What data was accessed? (records, entities, user accounts)
   - How many users affected?
   - What was the access method? (API, database, UI)
   - When did breach occur? (timeline)

3. **Assess risk:**
   - **High risk:** PII accessed, financial data exposed, large user base affected
   - **Medium risk:** Limited PII access, small user base
   - **Low risk:** No PII accessed, metadata only

**Assessment Checklist:**

- [ ] Breach confirmed (not false positive)
- [ ] Scope identified (users, data types, time range)
- [ ] Risk level determined (high/medium/low)
- [ ] Containment measures implemented
- [ ] Evidence preserved (logs, access records)

### 2.3 Notification Procedures

**Regulatory Notification (GDPR Article 33):**

**When Required:** Within 72 hours of becoming aware of breach

**Notification Recipient:** Supervisory Authority (DPA) in user's country or Neotoma's establishment country

**Notification Content:**

- Nature of breach (what happened)
- Categories and approximate number of data subjects affected
- Categories and approximate number of personal data records concerned
- Likely consequences of breach
- Measures proposed or taken to address breach

**Notification Process:**

1. Draft notification within 24 hours of assessment
2. Review with legal counsel (if available)
3. Submit to relevant DPA via official channel
4. Document submission (timestamp, reference number)

**Data Subject Notification (GDPR Article 34):**

**When Required:** Without undue delay if breach likely to result in high risk to rights and freedoms

**Notification Method:**

- Email to affected users
- In-app notification (if breach affects all users)
- Public notice (if email unavailable)

**Notification Content:**

- Description of breach in clear language
- Likely consequences
- Measures taken or proposed to address breach
- Advice on steps user can take to mitigate risks
- Contact information for questions

**Notification Timeline:**

- **High risk:** Within 48 hours of regulatory notification
- **Medium risk:** Within 7 days
- **Low risk:** No notification required (document decision)

### 2.4 Post-Breach Actions

**Immediate (0-24 hours):**

- Contain breach (revoke access, isolate systems)
- Preserve evidence (logs, access records)
- Assess scope and risk
- Notify regulatory authority (if required)

**Short-term (1-7 days):**

- Notify affected users (if required)
- Implement additional security measures
- Conduct root cause analysis
- Document breach and response

**Long-term (1-4 weeks):**

- Complete root cause analysis
- Implement permanent fixes
- Update security procedures
- Conduct post-mortem review
- Update incident response plan if needed

**Breach Response Log Template:**

```markdown
# Data Breach Response Log

**Breach ID:** BR-2025-001
**Detection Date:** 2025-01-15T10:30:00Z
**Assessment Date:** 2025-01-15T11:00:00Z
**Risk Level:** High/Medium/Low

**Scope:**

- Users affected: [number]
- Data types: [records, entities, user accounts]
- Time range: [start] to [end]

**Containment:**

- Actions taken: [revoked credentials, isolated systems]
- Time: [timestamp]

**Notification:**

- Regulatory authority: [DPA name, submission date]
- Data subjects: [notification date, method]

**Root Cause:**
[Description]

**Remediation:**
[Actions taken to prevent recurrence]

**Post-Mortem:**
[Link to post-mortem document]
```

---

## 3. Security Incident Response

### 3.1 Incident Classification

**Severity Levels:**

| Severity          | Description                                       | Response Time       | Examples                                   |
| ----------------- | ------------------------------------------------- | ------------------- | ------------------------------------------ |
| **P0 (Critical)** | Active breach, data exposure, service unavailable | Immediate (<15 min) | Database compromise, ransomware, DDoS      |
| **P1 (High)**     | Potential breach, service degradation             | <1 hour             | Suspicious access patterns, auth failures  |
| **P2 (Medium)**   | Security vulnerability, minor service impact      | <4 hours            | Misconfiguration, exposed credentials      |
| **P3 (Low)**      | Security improvement, no immediate risk           | <24 hours           | Outdated dependencies, minor config issues |

### 3.2 Incident Response Workflow

**Detection → Triage → Containment → Eradication → Recovery → Post-Incident**

**Step 1: Detection**

**Sources:**

- Security monitoring (Cloudflare, Supabase logs)
- User reports (support tickets)
- Automated alerts (failed auth, unusual patterns)
- Vendor notifications (Supabase, Fly.io security alerts)

**Step 2: Triage**

**Actions:**

1. Acknowledge incident (create incident ticket)
2. Assess severity (P0/P1/P2/P3)
3. Assign responder (on-call engineer or security lead)
4. Notify stakeholders (if P0/P1)

**Triage Checklist:**

- [ ] Incident confirmed (not false positive)
- [ ] Severity assigned
- [ ] Responder assigned
- [ ] Stakeholders notified (if needed)

**Step 3: Containment**

**Immediate Actions:**

- Isolate affected systems (disable access, revoke credentials)
- Preserve evidence (logs, access records, screenshots)
- Block malicious IPs (if applicable)
- Disable affected user accounts (if needed)

**Containment Measures:**

- Revoke compromised API keys or service_role keys
- Rotate credentials (database passwords, API tokens)
- Disable affected features (if needed)
- Enable additional monitoring

**Step 4: Eradication**

**Actions:**

- Remove threat (malware, unauthorized access)
- Patch vulnerabilities (update dependencies, fix code)
- Close security gaps (misconfigurations, exposed credentials)
- Verify threat removed (security scan, access review)

**Step 5: Recovery**

**Actions:**

- Restore systems to normal operation
- Re-enable features (if disabled)
- Restore user access (if revoked)
- Monitor for recurrence

**Step 6: Post-Incident**

**Actions:**

1. Document incident (incident report)
2. Conduct post-mortem (within 48 hours)
3. Identify improvements (process, technology)
4. Update procedures (if needed)
5. Share learnings (team review)

**Incident Report Template:**

```markdown
# Security Incident Report

**Incident ID:** INC-2025-001
**Severity:** P0/P1/P2/P3
**Detection:** [timestamp]
**Resolution:** [timestamp]
**Duration:** [duration]

**Summary:**
[Brief description]

**Timeline:**

- [timestamp]: Detection
- [timestamp]: Triage
- [timestamp]: Containment
- [timestamp]: Eradication
- [timestamp]: Recovery

**Root Cause:**
[Description]

**Impact:**

- Users affected: [number]
- Service impact: [description]
- Data impact: [description]

**Remediation:**
[Actions taken]

**Lessons Learned:**
[What went well, what didn't, improvements]

**Action Items:**

- [ ] [Action] (Owner: [name], Due: [date])
```

### 3.3 Escalation Procedures

**Escalation Path:**

1. **On-Call Engineer** (first responder)

   - Responds to P2/P3 incidents
   - Escalates P0/P1 to Security Lead

2. **Security Lead** (P0/P1 incidents)

   - Coordinates response
   - Escalates to CTO/Founder if needed

3. **CTO/Founder** (critical incidents)
   - Makes business decisions
   - Coordinates external communication

**Escalation Triggers:**

- P0 incident (immediate escalation)
- P1 incident affecting >10% of users
- Data breach confirmed
- Legal/compliance implications
- Media attention

**Communication Channels:**

- **Internal:** Slack #security-incidents channel
- **External:** support@neotoma.com, legal@neotoma.com (if exists)

---

## 4. Privacy Policy and Terms of Service

### 4.1 Privacy Policy Management

**Privacy Policy Location:**

- Public URL: `https://neotoma.com/privacy` (or subdomain)
- Source: `docs/legal/privacy_policy.md` (markdown source)
- Version control: Track changes in git

**Required Sections:**

1. **Data Controller Information:**

   - Company name, address, contact details
   - Data Protection Officer (if required)

2. **Data Collected:**

   - Documents uploaded (PDFs, images)
   - Data extracted from documents (structured fields)
   - Account information (email, password)
   - Usage data (API calls, storage usage)

3. **Legal Basis:**

   - Consent (user uploads documents)
   - Contract (service provision)

4. **Data Processing:**

   - How data is processed (extraction, structuring, storage)
   - Who processes data (Neotoma, vendors)

5. **Data Sharing:**

   - Third-party processors (Supabase, Fly.io)
   - AI agents (via MCP, with user consent)
   - No sale of data to third parties

6. **Data Subject Rights:**

   - Right to access, rectification, erasure, portability
   - How to exercise rights (contact information)

7. **Data Retention:**

   - Until user deletion request
   - Legal obligations (if applicable)

8. **Security Measures:**

   - Encryption, access controls, RLS

9. **International Transfers:**

   - Data stored in US (Supabase, Fly.io)
   - Safeguards (Standard Contractual Clauses)

10. **Contact Information:**
    - Privacy inquiries: privacy@neotoma.com
    - Data requests: data_request@neotoma.com

**Update Procedure:**

1. Draft changes in `docs/legal/privacy_policy.md`
2. Review with legal counsel (if available)
3. Update version and date
4. Deploy to public URL
5. Notify users of material changes (email, in-app notice)
6. Document notification date

**Version History:**

- Track in `docs/legal/privacy_policy_changelog.md`
- Include: version, date, changes, notification date

### 4.2 Terms of Service Management

**Terms of Service Location:**

- Public URL: `https://neotoma.com/terms` (or subdomain)
- Source: `docs/legal/terms_of_service.md`
- Version control: Track changes in git

**Required Sections:**

1. **Acceptance of Terms:**

   - By using Neotoma, user agrees to terms
   - Age requirement (18+ or parent consent)

2. **Service Description:**

   - What Neotoma provides (document structuring, memory storage)
   - What Neotoma does not do (no automatic scanning, no email reading)

3. **User Obligations:**

   - Accurate information
   - Lawful use only
   - No abuse or misuse
   - Account security responsibility

4. **Intellectual Property:**

   - User retains ownership of uploaded documents
   - Neotoma owns service and software
   - License to use service (non-exclusive, revocable)

5. **Payment Terms:**

   - Subscription fees (individual, team plans)
   - Billing cycles (monthly, annual)
   - Refund policy (if applicable)
   - Payment failure consequences

6. **Service Availability:**

   - No uptime guarantee (best effort)
   - Maintenance windows
   - Service modifications or discontinuation

7. **Limitation of Liability:**

   - Service provided "as is"
   - No warranties (express or implied)
   - Limitation of damages

8. **Termination:**

   - User may cancel subscription
   - Neotoma may suspend/terminate for violations
   - Data retention after termination

9. **Dispute Resolution:**

   - Governing law (jurisdiction)
   - Arbitration clause (if applicable)

10. **Changes to Terms:**
    - Right to modify terms
    - Notification of changes
    - Continued use constitutes acceptance

**Update Procedure:**

1. Draft changes in `docs/legal/terms_of_service.md`
2. Review with legal counsel
3. Update version and date
4. Deploy to public URL
5. Notify users of material changes (email, in-app notice)
6. Require re-acceptance if material changes

---

## 5. Data Processing Agreements (DPAs)

### 5.1 Vendor DPAs

**Vendors Requiring DPAs:**

| Vendor        | Service                 | Data Processed             | DPA Status                |
| ------------- | ----------------------- | -------------------------- | ------------------------- |
| **Supabase**  | Database, Auth, Storage | User data, documents, PII  | Required                  |
| **Fly.io**    | Hosting, Infrastructure | Application data, logs     | Required                  |
| **Stripe**    | Payment Processing      | Payment data, billing info | Required (via Stripe DPA) |
| **OpenAI**    | Embeddings (future)     | Document text (if used)    | Required (if implemented) |
| **Gmail API** | Email integration       | Email attachments          | Required (via Google DPA) |

**DPA Requirements:**

1. **Data Processing Details:**

   - Subject matter (what data is processed)
   - Duration (how long)
   - Nature and purpose (why)
   - Types of personal data (what categories)
   - Categories of data subjects (who)

2. **Processor Obligations:**

   - Process data only per instructions
   - Ensure confidentiality
   - Implement security measures
   - Assist with data subject rights
   - Notify of data breaches
   - Return or delete data after processing

3. **Sub-processors:**

   - List of sub-processors
   - Right to object to new sub-processors
   - Notification of sub-processor changes

4. **International Transfers:**
   - Standard Contractual Clauses (SCCs) if vendor outside EU
   - Adequacy decisions (if applicable)

**DPA Management:**

**Storage:**

- Signed DPAs: `docs/legal/dpas/` directory
- Naming: `dpa_[vendor]_[date].pdf` or `.md`

**Review Schedule:**

- Review annually or when vendor relationship changes
- Update if processing changes
- Verify vendor compliance

**DPA Checklist:**

- [ ] DPA covers all required clauses
- [ ] International transfers addressed (SCCs if needed)
- [ ] Sub-processors listed and approved
- [ ] Security measures documented
- [ ] Breach notification procedures defined
- [ ] Data return/deletion procedures defined
- [ ] Signed and dated
- [ ] Stored in `docs/legal/dpas/`

### 5.2 Standard Contractual Clauses (SCCs)

**When Required:**

- Vendor processes data outside EU/EEA
- No adequacy decision for vendor's country
- Vendor does not provide DPA with SCCs

**SCC Modules:**

- **Module 2 (Controller → Processor):** Neotoma → Supabase, Fly.io
- **Module 3 (Processor → Processor):** If Neotoma acts as processor for enterprise customers

**Implementation:**

- Use EU Commission SCCs (2021 version)
- Complete Annexes (data processing details, security measures)
- Execute with vendor
- Store in `docs/legal/dpas/`

---

## 6. Vendor Compliance and SLAs

### 6.1 Vendor Assessment

**Assessment Criteria:**

| Criterion         | Description                          | Required |
| ----------------- | ------------------------------------ | -------- |
| **Security**      | SOC 2, ISO 27001, security practices | High     |
| **Compliance**    | GDPR compliance, DPA availability    | High     |
| **Uptime**        | SLA commitment (99.9%, 99.99%)       | Medium   |
| **Data Location** | EU, US (with safeguards)             | Medium   |
| **Support**       | Response time, escalation process    | Low      |

**Assessment Process:**

1. Review vendor security documentation
2. Verify compliance certifications
3. Review DPA and SCCs
4. Assess data location and transfers
5. Document assessment in `docs/legal/vendor_assessments/`

**Vendor Assessment Template:**

```markdown
# Vendor Assessment: [Vendor Name]

**Assessment Date:** [date]
**Assessor:** [name]
**Status:** Approved / Pending / Rejected

**Vendor Details:**

- Service: [description]
- Data Processed: [types]
- Data Location: [country/region]

**Security:**

- Certifications: [SOC 2, ISO 27001, etc.]
- Security Practices: [description]
- Breach History: [if known]

**Compliance:**

- GDPR Compliance: Yes / No
- DPA Available: Yes / No
- SCCs Included: Yes / No

**SLA:**

- Uptime Commitment: [percentage]
- Support Response Time: [hours]

**Risk Assessment:**

- Risk Level: Low / Medium / High
- Mitigation: [measures]

**Decision:**
[Approved / Pending / Rejected with rationale]
```

### 6.2 Vendor SLAs

**Required SLAs:**

**Supabase:**

- Uptime: 99.9% (best effort, no formal SLA on free tier)
- Support: Community support (free tier)
- Data Location: US (with SCCs)

**Fly.io:**

- Uptime: 99.9% (best effort)
- Support: Email support
- Data Location: US (with SCCs)

**Stripe:**

- Uptime: 99.99% (formal SLA)
- Support: Email, phone (paid plans)
- Data Location: US (with DPA and SCCs)

**SLA Monitoring:**

- Track vendor uptime (if metrics available)
- Document incidents (downtime, service degradation)
- Review SLAs annually
- Escalate if SLA violations

**SLA Violation Response:**

1. Document violation (downtime, service degradation)
2. Contact vendor support
3. Request compensation (if SLA provides)
4. Assess impact on Neotoma service
5. Consider alternative vendors if repeated violations

---

## 7. Compliance Monitoring and Audits

### 7.1 Compliance Monitoring

**Regular Reviews:**

| Review Type                  | Frequency | Owner            | Scope                                 |
| ---------------------------- | --------- | ---------------- | ------------------------------------- |
| **Privacy Policy Review**    | Quarterly | Legal/Compliance | Content accuracy, regulatory changes  |
| **DPA Review**               | Annually  | Legal/Compliance | Vendor compliance, processing changes |
| **Data Processing Records**  | Quarterly | Legal/Compliance | Processing activities, updates        |
| **Security Incident Review** | Monthly   | Security Lead    | Incident trends, improvements         |
| **Vendor Assessment**        | Annually  | Legal/Compliance | Vendor security, compliance           |

**Monitoring Checklist:**

- [ ] Privacy policy up to date
- [ ] Terms of service current
- [ ] DPAs signed and valid
- [ ] Processing records updated
- [ ] Data subject requests handled within SLA
- [ ] Security incidents documented
- [ ] Vendor assessments current

### 7.2 Internal Audits

**Audit Schedule:**

- **Quarterly:** Data processing compliance (GDPR)
- **Annually:** Security compliance (access controls, encryption)
- **Ad-hoc:** After security incidents or regulatory changes

**Audit Scope:**

1. **Data Processing Compliance:**

   - Verify legal basis for processing
   - Check data subject rights fulfillment (response times)
   - Review data retention and deletion procedures
   - Verify consent records

2. **Security Compliance:**

   - Access controls (RLS policies, API authentication)
   - Encryption (at rest, in transit)
   - Logging (PII exclusion)
   - Incident response procedures

3. **Vendor Compliance:**
   - DPA completeness and validity
   - Vendor security assessments
   - SLA compliance

**Audit Process:**

1. Define audit scope and objectives
2. Review documentation (policies, procedures, logs)
3. Test procedures (data subject request, incident response)
4. Identify gaps and non-compliance
5. Document findings and recommendations
6. Implement improvements
7. Follow up on action items

**Audit Report Template:**

```markdown
# Compliance Audit Report

**Audit Date:** [date]
**Auditor:** [name]
**Scope:** [GDPR, Security, Vendors, etc.]

**Findings:**

- [Finding 1]: [Description] (Severity: High/Medium/Low)
- [Finding 2]: [Description] (Severity: High/Medium/Low)

**Recommendations:**

- [Recommendation 1]: [Action] (Owner: [name], Due: [date])
- [Recommendation 2]: [Action] (Owner: [name], Due: [date])

**Status:**

- Compliant: [areas]
- Non-Compliant: [areas]
- Improvements Needed: [areas]
```

### 7.3 External Audits

**When Required:**

- Customer requests (enterprise customers)
- Regulatory requirements (if applicable)
- Certification requirements (SOC 2, ISO 27001)

**Audit Preparation:**

1. Gather documentation (policies, procedures, logs)
2. Prepare data processing records
3. Review vendor DPAs
4. Document security measures
5. Prepare audit trail (access logs, incident reports)

**Audit Support:**

- Provide requested documentation
- Answer auditor questions
- Demonstrate compliance measures
- Address findings and recommendations

---

## 8. Data Retention and Deletion

### 8.1 Retention Policies

**User Data:**

- **Retention Period:** Until user deletion request
- **Legal Obligations:** Retain if required by law (e.g., tax records, 7 years)
- **Backup Retention:** 30 days (automated backups)

**Logs:**

- **Application Logs:** 90 days (no PII)
- **Access Logs:** 1 year (for security monitoring)
- **Audit Logs:** 7 years (for compliance)

**Backups:**

- **Frequency:** Daily
- **Retention:** 30 days
- **Deletion:** Automatic after retention period

### 8.2 Deletion Procedures

**User-Requested Deletion:**

**Process:**

1. User requests deletion via support ticket or `delete_request@neotoma.com`
2. Verify user identity
3. Check legal basis:
   - **If consent-based:** Proceed with deletion
   - **If contract-based:** May retain if necessary for contract performance
   - **If legal obligation:** Retain if required by law
4. Execute deletion:
   ```sql
   -- Delete user's records and related data
   DELETE FROM record_entity_edges WHERE record_id IN (
     SELECT id FROM records WHERE user_id = $1
   );
   DELETE FROM record_event_edges WHERE record_id IN (
     SELECT id FROM records WHERE user_id = $1
   );
   DELETE FROM records WHERE user_id = $1;
   -- Note: Entities may be shared; only delete if no other records reference them
   ```
5. Delete from backups (within 30 days)
6. Confirm deletion to user (within 30 days)
7. Log deletion request and execution

**Automated Deletion:**

**Account Inactivity:**

- **Policy:** No automatic deletion (user controls)
- **Future:** Consider deletion after 2+ years of inactivity (with notification)

**Legal Obligation Deletion:**

- **Policy:** Delete when legal obligation expires (e.g., tax records after 7 years)
- **Process:** Automated deletion based on retention policy

**Deletion Verification:**

- Verify data deleted from production database
- Verify data deleted from backups (within retention period)
- Confirm deletion to user
- Document deletion in audit log

---

## 9. Regulatory Compliance

### 9.1 GDPR (EU/EEA)

**Status:** Applicable (if EU users)

**Requirements:**

- Legal basis for processing (consent, contract)
- Data subject rights (access, rectification, erasure, portability)
- Data breach notification (72 hours)
- Data Protection Impact Assessments (DPIAs)
- Records of processing activities
- Data Processing Agreements (DPAs)

**Compliance Status:**

- ✅ Privacy policy (required)
- ✅ Terms of service (required)
- ✅ Data subject rights procedures (Section 1.2)
- ✅ Breach response plan (Section 2)
- ✅ DPAs with vendors (Section 5)
- ⚠️ DPO appointment (required if >250 employees or high-risk processing)
- ⚠️ SCCs with vendors (required for US vendors)

### 9.2 CCPA/CPRA (California)

**Status:** Applicable (if California users)

**Requirements:**

- Privacy policy (required)
- Right to know (what data is collected)
- Right to delete (user deletion requests)
- Right to opt-out (sale of data — not applicable to Neotoma)
- Non-discrimination (cannot deny service for exercising rights)

**Compliance Status:**

- ✅ Privacy policy (required)
- ✅ Deletion procedures (Section 8.2) — Automated in v2.1.0 (FU-903, FU-904, FU-905)
- ✅ Data access procedures (Section 1.2) — Automated in v2.1.0 (FU-900, FU-901, FU-902)
- ✅ No sale of data (aligned with Neotoma principles)
- ✅ Global Privacy Control (GPC) signal support — Automated in v2.1.0 (FU-925)
- ✅ Sensitive data opt-in consent — Automated in v2.1.0 (FU-926)
- ✅ Right to correct — Automated in v2.1.0 (FU-927)
- ✅ Breach notification — Automated in v2.1.0 (FU-928)

### 9.3 Other Regulations

**PIPEDA (Canada):**

- Similar to GDPR
- Consent-based processing
- Data subject rights
- Breach notification

**LGPD (Brazil):**

- Similar to GDPR
- Data subject rights
- Breach notification

**UK GDPR:**

- Post-Brexit UK GDPR
- Similar to EU GDPR
- Separate DPA registration (if required)

**Compliance Approach:**

- Privacy policy covers multiple jurisdictions
- Data subject rights procedures apply globally
- Breach notification follows strictest requirement (72 hours)

---

## 10. Contact Information

**Privacy Inquiries:**

- Email: `privacy@neotoma.com`
- Response Time: Within 30 days

**Data Subject Requests:**

- Email: `data_request@neotoma.com`
- Response Time: Within 30 days (or 60 days with extension notice)

**Deletion Requests:**

- Email: `delete_request@neotoma.com`
- Response Time: Within 30 days

**Security Incidents:**

- Email: `security@neotoma.com`
- Response Time: Immediate (P0/P1), <1 hour (P2), <24 hours (P3)

**Legal/Compliance:**

- Email: `legal@neotoma.com` (if exists)
- Response Time: Within 48 hours

---

## Related Documents

- [`docs/subsystems/privacy.md`](../subsystems/privacy.md) — Technical privacy implementation
- [`docs/subsystems/auth.md`](../subsystems/auth.md) — Authentication and authorization
- [`docs/observability/logging.md`](../observability/logging.md) — Logging standards (PII exclusion)
- [`docs/operations/troubleshooting.md`](../operations/troubleshooting.md) — Operational troubleshooting
- [`docs/infrastructure/deployment.md`](../infrastructure/deployment.md) — Deployment procedures

---

## Agent Instructions

### When to Load This Document

Load when:

- Handling data subject requests (access, deletion, portability)
- Responding to security incidents or data breaches
- Updating privacy policy or terms of service
- Assessing vendor compliance or DPAs
- Conducting compliance audits
- Planning new data processing activities (DPIA)

### Required Co-Loaded Documents

- `docs/subsystems/privacy.md` — Technical privacy implementation
- `docs/subsystems/auth.md` — Security and access controls
- `docs/observability/logging.md` — Logging standards

### Constraints Agents Must Enforce

1. **Data Subject Rights:** MUST respond within 30 days (or notify of extension)
2. **Breach Notification:** MUST notify regulatory authority within 72 hours
3. **Privacy Policy:** MUST update and notify users of material changes
4. **DPAs:** MUST have signed DPAs with all data processors
5. **Deletion:** MUST delete user data upon request (unless legal obligation)
6. **Documentation:** MUST document all compliance activities (requests, breaches, audits)

### Forbidden Patterns

- Ignoring data subject requests
- Delaying breach notifications beyond 72 hours
- Processing data without legal basis
- Sharing data with vendors without DPAs
- Logging PII (see `docs/subsystems/privacy.md`)
- Retaining data beyond retention period (unless legal obligation)

### Validation Checklist

- [ ] Privacy policy published and up to date
- [ ] Terms of service published and up to date
- [ ] DPAs signed with all vendors
- [ ] Data subject rights procedures documented
- [ ] Breach response plan documented and tested
- [ ] Incident response procedures documented
- [ ] Compliance monitoring schedule defined
- [ ] Contact information for requests published



