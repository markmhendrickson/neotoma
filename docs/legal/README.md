# Neotoma Legal & Compliance Documentation

This directory contains legal and compliance documentation for Neotoma operations.

---

## Documents

### Core Compliance

- **[`compliance.md`](compliance.md)** — GDPR compliance procedures, data breach response, incident management, vendor compliance
- **[`privacy_policy.md`](privacy_policy.md)** — Privacy Policy template (requires legal review)
- **[`terms_of_service.md`](terms_of_service.md)** — Terms of Service template (requires legal review)

### Supporting Documents

- **[`privacy_policy_changelog.md`](privacy_policy_changelog.md)** — Privacy Policy version history
- **[`terms_of_service_changelog.md`](terms_of_service_changelog.md)** — Terms of Service version history

### Vendor Documentation

- **`dpas/`** — Data Processing Agreements (DPAs) with vendors
- **`vendor_assessments/`** — Vendor security and compliance assessments

### Audit Documentation

- **`audits/`** — Compliance audit reports
- **`dpias/`** — Data Protection Impact Assessments (DPIAs)

---

## Quick Reference

### Data Subject Requests

- **Access Request:** `data_request@neotoma.com` (30 days)
- **Deletion Request:** `delete_request@neotoma.com` (30 days)
- **Privacy Inquiry:** `privacy@neotoma.com` (30 days)

### Security Incidents

- **Report:** `security@neotoma.com` (immediate for P0/P1)
- **Response Time:** P0 (<15 min), P1 (<1 hour), P2 (<4 hours), P3 (<24 hours)

### Compliance Deadlines

- **GDPR Breach Notification:** 72 hours (regulatory authority)
- **Data Subject Response:** 30 days (or 60 days with extension notice)
- **Privacy Policy Updates:** Notify users of material changes (30 days' notice)

---

## Legal Review Status

⚠️ **All legal documents require review by qualified legal counsel before publication.**

**Status:**

- `compliance.md`: ✅ Procedures documented (review recommended)
- `privacy_policy.md`: ⚠️ Template (legal review required)
- `terms_of_service.md`: ⚠️ Template (legal review required)

---

## Related Documentation

- [`docs/subsystems/privacy.md`](../subsystems/privacy.md) — Technical privacy implementation
- [`docs/subsystems/auth.md`](../subsystems/auth.md) — Security and access controls
- [`docs/observability/logging.md`](../observability/logging.md) — Logging standards (PII exclusion)
- [`docs/operations/troubleshooting.md`](../operations/troubleshooting.md) — Operational procedures

---

## Agent Instructions

### When to Load Legal Documentation

Load when:

- Handling data subject requests
- Responding to security incidents or data breaches
- Updating privacy policy or terms of service
- Assessing vendor compliance
- Conducting compliance audits

### Required Co-Loaded Documents

- `docs/legal/compliance.md` — Core compliance procedures
- `docs/subsystems/privacy.md` — Technical privacy implementation
- `docs/subsystems/auth.md` — Security controls

### Constraints

1. **Legal Review:** All legal documents MUST be reviewed by legal counsel before publication
2. **Response Times:** MUST meet GDPR deadlines (30 days for requests, 72 hours for breaches)
3. **Documentation:** MUST document all compliance activities (requests, breaches, audits)
4. **Updates:** MUST notify users of material changes to policies (30 days' notice)









