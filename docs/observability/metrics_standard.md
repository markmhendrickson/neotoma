# Neotoma Metrics Standard
*(Metrics Naming, Types, and Collection Rules)*

---

## Purpose

Defines metrics for observability and monitoring.

**Note:** Neotoma uses a dual-metrics approach:
- **Technical metrics** (this document): Stored in Prometheus, exposed via `/metrics` endpoint
- **Product analytics**: Tracked via PostHog/Mixpanel for user behavior, activation, retention

See `docs/specs/METRICS_REQUIREMENTS.md` for complete metrics requirements.

---

## Metric Naming

**Pattern:** `neotoma_{subsystem}_{operation}_{unit}`

**Examples:**
- `neotoma_record_upload_total` (counter)
- `neotoma_record_upload_duration_ms` (histogram)
- `neotoma_search_results_count` (histogram)

---

## Metric Types

### Counter
**When:** Monotonically increasing values

**Examples:**
- `neotoma_record_upload_total{status="success"}`
- `neotoma_extraction_errors_total{error_code="OCR_FAILED"}`

### Gauge
**When:** Values that go up and down

**Examples:**
- `neotoma_active_ingestions` (current active)
- `neotoma_db_connection_pool_size`

### Histogram
**When:** Distribution of values

**Examples:**
- `neotoma_record_upload_duration_ms` (buckets: 100, 500, 1000, 5000)
- `neotoma_search_duration_ms`

---

## Required Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `neotoma_record_upload_total` | Counter | `status` | Total uploads |
| `neotoma_record_upload_duration_ms` | Histogram | - | Upload duration |
| `neotoma_extraction_errors_total` | Counter | `error_code` | Extraction errors |
| `neotoma_search_duration_ms` | Histogram | - | Search duration |

---

## Agent Instructions

Load when adding metrics or planning observability for Feature Units.

Required co-loaded: `docs/subsystems/events.md`, `docs/observability/logging.md`

Constraints:
- MUST use standard naming pattern
- MUST NOT include PII in labels
- MUST document metric meaning





