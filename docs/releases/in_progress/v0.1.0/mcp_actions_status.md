# MCP Actions Status Across Releases

_(Tracking which MCP actions are in which release)_

---

## Purpose

This document tracks which MCP actions from `docs/specs/MCP_SPEC.md` are included in which releases (v0.1.0, v1.0.0, post-MVP).

---

## Complete MCP Action Catalog

### ✅ v0.1.0 (Internal MCP Release) — 13 Actions

**Core Record Operations (4):**
- `store_record` (FU-201)
- `update_record` (FU-203)
- `retrieve_records` (FU-202)
- `delete_record` (FU-204)

**File Operations (2):**
- `upload_file` (FU-205)
- `get_file_url` (FU-206)

**Observation & Snapshot Operations (5):**
- `get_entity_snapshot` (FU-061)
- `list_observations` (FU-061)
- `get_field_provenance`  (FU-061)
- `create_relationship`   (FU-061)
- `list_relationships`    (FU-061)

**Provider Integrations (2, Optional):**
- `list_provider_catalog` (FU-208, optional)
- `sync_provider_imports` (FU-208, optional)

**Total:** 13 actions (11 required + 2 optional)

---

### ✅ v1.0.0 (MVP) — Adds Provider Integrations

**Adds (Required):**
- `list_provider_catalog` (FU-208, now required)
- `sync_provider_imports` (FU-208, now required)

**Total:** 15 actions (13 from v0.1.0 + 2 provider actions)

**Note:** v1.0.0 explicitly excludes Plaid and Metrics actions (see below).

---

### ⏳ Post-MVP (Not Scheduled) — 6 Actions

**Plaid Integration (4 actions):**
- `plaid_create_link_token` (FU-207)
- `plaid_exchange_public_token` (FU-207)
- `plaid_sync` (FU-207)
- `plaid_list_items` (FU-207)

**Rationale:** Plaid serves Tier 3+ ICPs (Cross-Border Solopreneurs, Agentic Portfolio) who need live bank transaction sync, not Tier 1 MVP targets who primarily upload static documents (PDF invoices/receipts/statements).

**Status:** FU-207 marked as "Post-MVP" in `MVP_FEATURE_UNITS.md`. No specific release assigned yet.

---

**Metrics & Analytics (2 actions):**
- `get_technical_metrics` (FU-800, Prometheus integration)
- `get_product_analytics` (FU-803, PostHog/Mixpanel integration)

**Rationale:** Requires Prometheus and PostHog/Mixpanel integration (Phase 8 observability). Enables AI-generated reports on system performance and user behavior.

**Status:** 
- FU-800 (Technical Metrics) — P1 priority, ⏳ Not Started
- FU-803 (Product Analytics) — P1 priority, ⏳ Not Started
- Not explicitly in v1.0.0 scope (v1.0.0 release plan excludes them)

**Likely Release:** Post-v1.0.0 (v1.1.0+ or v2.0.0+)

---

## Summary Table

| Action | v0.1.0 | v1.0.0 | Post-MVP | Feature Unit | Notes |
|--------|--------|--------|----------|--------------|-------|
| **Core Record Operations** |
| `store_record` | ✅ | ✅ | - | FU-201 | Required |
| `update_record` | ✅ | ✅ | - | FU-203 | Required |
| `retrieve_records` | ✅ | ✅ | - | FU-202 | Required |
| `delete_record` | ✅ | ✅ | - | FU-204 | Required |
| **File Operations** |
| `upload_file` | ✅ | ✅ | - | FU-205 | Required |
| `get_file_url` | ✅ | ✅ | - | FU-206 | Required |
| **Observation & Snapshot Operations** |
| `get_entity_snapshot` | ✅ | ✅ | - | FU-061 | Required |
| `list_observations` | ✅ | ✅ | - | FU-061 | Required |
| `get_field_provenance` | ✅ | ✅ | - | FU-061 | Required |
| `create_relationship` | ✅ | ✅ | - | FU-061 | Required |
| `list_relationships` | ✅ | ✅ | - | FU-061 | Required |
| **Provider Integrations** |
| `list_provider_catalog` | ⏳ Optional | ✅ | - | FU-208 | Required in v1.0.0 |
| `sync_provider_imports` | ⏳ Optional | ✅ | - | FU-208 | Required in v1.0.0 |
| **Plaid Integration** |
| `plaid_create_link_token` | ❌ | ❌ | ⏳ | FU-207 | Post-MVP |
| `plaid_exchange_public_token` | ❌ | ❌ | ⏳ | FU-207 | Post-MVP |
| `plaid_sync` | ❌ | ❌ | ⏳ | FU-207 | Post-MVP |
| `plaid_list_items` | ❌ | ❌ | ⏳ | FU-207 | Post-MVP |
| **Metrics & Analytics** |
| `get_technical_metrics` | ❌ | ❌ | ⏳ | FU-800 | Post-MVP |
| `get_product_analytics` | ❌ | ❌ | ⏳ | FU-803 | Post-MVP |

**Legend:**
- ✅ Included
- ⏳ Optional / Planned
- ❌ Explicitly Excluded

---

## Release Breakdown

### v0.1.0 (Internal MCP Release)
- **Total Actions:** 13 (11 required + 2 optional)
- **Focus:** Core Truth Layer validation via MCP
- **Provider Actions:** Optional (FU-208)

### v1.0.0 (MVP)
- **Total Actions:** 15 (all required)
- **Adds:** Provider integrations (FU-208, now required)
- **Excludes:** Plaid (FU-207), Metrics (FU-800, FU-803)

### Post-MVP (Future Releases)
- **Plaid Actions:** 4 actions (FU-207)
- No specific release assigned. Will be added when Tier 3+ ICP demand is validated.
- **Metrics Actions:** 2 actions (FU-800, FU-803)
   No specific release assigned. Requires observability infrastructure (Prometheus, PostHog/Mixpanel).

---

## Related Documentation

- `docs/specs/MCP_SPEC.md` — Complete MCP action specifications
- `docs/specs/MVP_FEATURE_UNITS.md` — Feature Unit definitions
- `docs/releases/in_progress/v0.1.0/release_plan.md` — v0.1.0 scope
- `docs/releases/in_progress/v1.0.0/release_plan.md` — v1.0.0 scope

