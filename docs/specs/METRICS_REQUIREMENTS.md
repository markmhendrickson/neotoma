# Neotoma Metrics Requirements
*(Product Activation, Business, Technical, and AI Reliability Metrics)*

---

## Purpose

This document defines the **complete metrics requirements** for Neotoma MVP, including product activation, business health, technical performance, graph integrity, and AI reliability metrics. These metrics determine whether Neotoma successfully delivers on its promise as a deterministic Truth Layer.

---

## Scope

This document covers:
- Product activation metrics (user onboarding success)
- Business metrics (usage, retention, growth)
- Technical performance metrics (latency, throughput, errors)
- Graph health metrics (integrity, completeness, quality)
- AI reliability metrics (MCP accuracy, provenance coverage)
- Acceptance criteria (required thresholds for MVP launch)

This document does NOT cover:
- Implementation details (see `docs/observability/metrics_standard.md`)

**Metric Collection Infrastructure:**
- **Technical metrics** (latency, errors, system health): Prometheus + Grafana
- **Product analytics** (activation, retention, funnels): PostHog (recommended) or Mixpanel
- See `docs/specs/MVP_FEATURE_UNITS.md` Phase 8 for implementation details

---

## 1. Product Activation Metrics

### 1.1 First-Session Activation

**Goal:** User completes meaningful interaction within first 5 minutes.

| Metric | Definition | Required Threshold | Target Threshold |
|--------|------------|-------------------|------------------|
| `activation_first_upload_rate` | % of users who upload ≥1 file in first session | >60% | >80% |
| `activation_first_extraction_rate` | % of users who see ≥1 extracted field | >50% | >70% |
| `activation_first_entity_rate` | % of users who see ≥1 entity | >40% | >60% |
| `activation_first_event_rate` | % of users who see ≥1 timeline event | >40% | >60% |
| `activation_first_search_rate` | % of users who perform ≥1 search | >30% | >50% |
| `activation_first_ai_query_rate` | % of users who ask ≥1 AI question via MCP | >20% | >40% |

**Measurement:**
- Track user actions in first session (0-5 minutes after signup)
- Session = authenticated activity within 30-minute window
- Denominator = all users who complete signup

---

### 1.2 Core Action Completion

**Goal:** Users complete the fundamental Neotoma workflows.

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `activation_upload_to_view_rate` | % who upload → view record detail | >70% | >85% |
| `activation_upload_to_timeline_rate` | % who upload → view timeline | >40% | >60% |
| `activation_upload_to_entity_click_rate` | % who upload → click entity | >30% | >50% |
| `activation_search_to_click_rate` | % who search → click result | >50% | >70% |

---

### 1.3 Time-to-Value

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `time_to_first_upload_seconds` | Median time from signup to first upload | <180s | <120s |
| `time_to_first_extraction_seconds` | Median time from upload to seeing extraction | <10s | <5s |
| `time_to_first_timeline_view_seconds` | Median time from signup to timeline view | <300s | <180s |

---

## 2. Business Metrics

### 2.1 Usage Metrics

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `daily_active_users` | Users with ≥1 action per day | >10 (MVP) | >100 (6mo) |
| `weekly_active_users` | Users with ≥1 action per week | >20 (MVP) | >300 (6mo) |
| `avg_uploads_per_user_per_week` | Mean uploads across active users | >2 | >5 |
| `avg_searches_per_user_per_week` | Mean searches across active users | >3 | >10 |

---

### 2.2 Retention Metrics

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `day_1_retention` | % returning on day 2 | >40% | >60% |
| `week_1_retention` | % returning in week 2 | >30% | >50% |
| `month_1_retention` | % returning in month 2 | >20% | >40% |

---

### 2.3 Growth Metrics

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `total_records_ingested` | Cumulative records across all users | >100 (MVP) | >10,000 (6mo) |
| `total_entities_extracted` | Cumulative unique entities | >50 (MVP) | >5,000 (6mo) |
| `total_events_generated` | Cumulative timeline events | >100 (MVP) | >10,000 (6mo) |

---

## 3. Technical Performance Metrics

### 3.1 Ingestion Performance

| Metric | Definition | Required | Target | Notes |
|--------|------------|----------|--------|-------|
| `neotoma_record_upload_duration_ms` | P50 upload latency | <3000ms | <2000ms | Full pipeline |
| `neotoma_record_upload_duration_ms` | P95 upload latency | <8000ms | <5000ms | 95th percentile |
| `neotoma_record_upload_duration_ms` | P99 upload latency | <15000ms | <10000ms | 99th percentile |
| `neotoma_extraction_duration_ms` | P95 extraction time | <2000ms | <1000ms | Field extraction |
| `neotoma_ocr_duration_ms` | P95 OCR time | <5000ms | <3000ms | Image OCR |

---

### 3.2 Search Performance

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_search_duration_ms` | P95 search latency | <500ms | <200ms |
| `neotoma_search_results_count` | P50 results returned | ≥5 | ≥10 |
| `neotoma_search_index_lag_seconds` | P95 indexing delay | <5s | <3s |

---

### 3.3 MCP Performance

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_mcp_call_duration_ms` | P95 MCP action latency | <1000ms | <500ms |
| `neotoma_mcp_retrieve_records_duration_ms` | P95 retrieve latency | <500ms | <200ms |
| `neotoma_mcp_store_record_duration_ms` | P95 store latency | <3000ms | <2000ms |

---

### 3.4 Error and Success Rates

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_record_upload_success_rate` | % uploads completing successfully | >95% | >98% |
| `neotoma_extraction_success_rate` | % extractions yielding ≥1 field | >80% | >90% |
| `neotoma_ocr_success_rate` | % OCR operations succeeding | >90% | >95% |
| `neotoma_search_error_rate` | % searches failing | <5% | <1% |
| `neotoma_mcp_error_rate` | % MCP calls failing | <5% | <2% |

---

### 3.5 Resource Utilization

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_db_connection_pool_usage` | % of DB connections in use | <80% | <60% |
| `neotoma_storage_bytes_total` | Total file storage consumed | N/A | Monitor |
| `neotoma_db_size_bytes` | Database size | N/A | Monitor |

---

## 4. Graph Health Metrics

### 4.1 Graph Integrity

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_graph_orphan_nodes_total` | Records with no edges | 0 | 0 |
| `neotoma_graph_duplicate_entities_rate` | % entities with potential duplicates | <5% | <2% |
| `neotoma_graph_cycle_count` | Graph cycles detected | 0 | 0 |
| `neotoma_graph_edge_integrity_rate` | % edges with valid endpoints | 100% | 100% |

**Testing:**
```typescript
test('no orphan records exist', async () => {
  const orphans = await db.query(`
    SELECT r.id FROM records r
    LEFT JOIN record_entity_edges e ON r.id = e.record_id
    LEFT JOIN record_event_edges ev ON r.id = ev.record_id
    WHERE e.record_id IS NULL AND ev.record_id IS NULL
  `);
  
  expect(orphans.length).toBe(0);
});
```

---

### 4.2 Extraction Quality

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_extraction_field_coverage_rate` | % records with ≥3 extracted fields | >60% | >80% |
| `neotoma_entity_extraction_rate` | % records with ≥1 entity | >50% | >70% |
| `neotoma_event_extraction_rate` | % records with ≥1 event | >40% | >60% |
| `neotoma_schema_detection_accuracy` | % correct schema assignments | >85% | >95% |

**Measurement:**
- Schema detection accuracy requires labeled test set
- Manually label 100 documents with correct schema type
- Measure % where detected type matches label

---

## 5. AI Reliability Metrics

### 5.1 MCP Response Accuracy

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_mcp_truth_accuracy_rate` | % MCP responses with correct record_id references | >95% | >99% |
| `neotoma_mcp_hallucination_rate` | % responses referencing nonexistent records | <2% | <0.5% |
| `neotoma_mcp_provenance_coverage_rate` | % MCP responses including source record_id | >90% | >98% |

**Testing:**
```typescript
test('MCP responses reference real records', async () => {
  const response = await mcpClient.call('retrieve_records', { type: 'FinancialRecord' });
  
  for (const record of response.records) {
    const exists = await db.recordExists(record.id);
    expect(exists).toBe(true); // No hallucinated IDs
  }
});
```

---

### 5.2 Truth Layer Purity

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_nondeterminism_violations` | Count of nondeterministic operations detected | 0 | 0 |
| `neotoma_truth_mutation_violations` | Count of immutability violations | 0 | 0 |
| `neotoma_layer_boundary_violations` | Strategy/execution logic in Truth Layer | 0 | 0 |

**Measurement:**
- Code review checklist compliance
- Static analysis for forbidden patterns (random IDs, LLM extraction)
- Regression tests for determinism

---

## 6. User Experience Metrics

### 6.1 UI Responsiveness

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_ui_page_load_ms` | P95 page load time | <2000ms | <1000ms |
| `neotoma_ui_interaction_delay_ms` | P95 click-to-response | <300ms | <150ms |
| `neotoma_ui_search_feedback_ms` | Time to show search results | <500ms | <300ms |

---

### 6.2 Error Recovery

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_user_retry_success_rate` | % retries that succeed | >80% | >90% |
| `neotoma_error_message_clarity_score` | User survey: error message helpful? (1-5) | >3.5 | >4.0 |

---

## 7. Observability Coverage

### 7.1 Instrumentation Completeness

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `neotoma_instrumented_endpoints_rate` | % API endpoints with metrics | 100% | 100% |
| `neotoma_log_coverage_rate` | % error paths with logs | 100% | 100% |
| `neotoma_trace_coverage_rate` | % critical paths with tracing | >90% | 100% |

**Critical Paths (Must Have Tracing):**
- Ingestion pipeline (upload → extract → graph)
- Search query (query → rank → return)
- Entity resolution (extract → normalize → hash)
- Event generation (extract dates → create events)

---

## 8. Acceptance Criteria for MVP Launch

### 8.1 Product Readiness

**MUST Meet (Required for Launch):**
- [ ] `activation_first_upload_rate` >60%
- [ ] `neotoma_record_upload_success_rate` >95%
- [ ] `neotoma_extraction_success_rate` >80%
- [ ] `neotoma_graph_orphan_nodes_total` = 0
- [ ] `neotoma_nondeterminism_violations` = 0
- [ ] `neotoma_truth_mutation_violations` = 0
- [ ] `neotoma_mcp_hallucination_rate` <2%

**SHOULD Meet (Target for Launch):**
- [ ] `activation_first_extraction_rate` >50%
- [ ] `neotoma_record_upload_duration_ms` P95 <8s
- [ ] `neotoma_search_duration_ms` P95 <500ms
- [ ] `day_1_retention` >40%

---

### 8.2 Technical Stability

**MUST Meet:**
- [ ] All critical paths have 100% test coverage
- [ ] No flaky tests (100 consecutive runs, all pass)
- [ ] All determinism tests pass
- [ ] All graph integrity constraints verified

---

## 9. Metrics Collection and Reporting

### 9.1 Metrics Storage Architecture

Neotoma uses a dual-metrics approach:

**Prometheus (Technical Metrics):**
- System performance: `neotoma_record_upload_duration_ms`, `neotoma_search_duration_ms`
- Error rates: `neotoma_extraction_errors_total`, `neotoma_mcp_error_rate`
- Infrastructure health: `neotoma_db_connection_pool_usage`, `neotoma_graph_orphan_nodes_total`
- Real-time alerting and operational dashboards
- Storage: Prometheus time-series database (90-day retention)
- Access: Grafana dashboards, PromQL queries

**PostHog/Mixpanel (Product Analytics):**
- User behavior: `activation_first_upload_rate`, `activation_first_extraction_rate`
- Retention: `day_1_retention`, `week_1_retention`, `month_1_retention`
- Usage: `daily_active_users`, `weekly_active_users`
- Funnel analysis: signup → upload → extraction → entity → timeline
- Storage: PostHog/Mixpanel cloud platform (1-year retention)
- Access: Product analytics dashboards, cohort analysis

### 9.2 Collection Frequency

| Metric Type | Collection Frequency | Retention | Platform |
|-------------|---------------------|-----------|----------|
| Real-time (counters, gauges) | Per event | 90 days | Prometheus |
| Histograms (latency) | Per request | 90 days | Prometheus |
| User events (activation, retention) | Per user action | 1 year | PostHog/Mixpanel |
| Aggregated (daily/weekly) | Once per day | 1 year | PostHog/Mixpanel |
| User cohorts | Once per week | 1 year | PostHog/Mixpanel |

---

### 9.2 Alerting Thresholds

**Critical Alerts (Page Immediately):**
- `neotoma_record_upload_success_rate` <90% (5-minute window)
- `neotoma_graph_orphan_nodes_total` >0 (any instance)
- `neotoma_mcp_error_rate` >10% (5-minute window)
- `neotoma_db_connection_pool_usage` >95% (sustained 1 minute)

**Warning Alerts (Notify Team):**
- `neotoma_record_upload_duration_ms` P95 >10s (sustained 5 minutes)
- `neotoma_search_duration_ms` P95 >1s (sustained 5 minutes)
- `neotoma_extraction_success_rate` <85% (sustained 15 minutes)

---

## 10. Metric Naming Conventions

All metrics MUST follow this pattern:
```
neotoma_{subsystem}_{metric_name}_{unit}
```

**Examples:**
- `neotoma_record_upload_total` (counter)
- `neotoma_record_upload_duration_ms` (histogram)
- `neotoma_search_results_count` (histogram)
- `neotoma_graph_orphan_nodes_total` (gauge)

**Labels:**
- `status` (success, failed, error_code)
- `schema_type` (FinancialRecord, IdentityDocument)
- `search_mode` (keyword, semantic, both)

See `docs/observability/metrics_standard.md` for complete naming standards.

---

## 11. Dashboard Requirements

### 11.1 Real-Time Operations Dashboard

**Must Display:**
- Upload success rate (last 5 min, last 1 hour, last 24 hours)
- Active ingestions (current count)
- Search latency (P50, P95, P99)
- Error rate by subsystem
- Database connection pool usage

**Refresh:** Every 30 seconds

---

### 11.2 Product Health Dashboard

**Must Display:**
- DAU / WAU / MAU
- Activation funnel (signup → upload → extraction → entity → timeline)
- Retention cohorts (day 1, week 1, month 1)
- Records ingested (total, last 7 days, last 30 days)
- Top schema types by volume

**Refresh:** Daily

---

### 11.3 Graph Health Dashboard

**Must Display:**
- Total records, entities, events
- Orphan node count (MUST be 0)
- Duplicate entity detection results
- Graph edge count by type
- Schema distribution (pie chart)

**Refresh:** Hourly

---

## 12. Testing Metrics Requirements

### 12.1 Test Coverage

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `test_coverage_lines_pct` | Line coverage (domain layer) | >85% | >90% |
| `test_coverage_branches_pct` | Branch coverage (domain layer) | >85% | >90% |
| `test_coverage_critical_paths_pct` | Critical path coverage | 100% | 100% |

**Critical Paths:**
- Ingestion pipeline
- Entity resolution
- Event generation
- Graph insertion
- Search ranking

---

### 12.2 Test Reliability

| Metric | Definition | Required | Target |
|--------|------------|----------|--------|
| `test_flake_rate` | % test runs with ≥1 flaky test | 0% | 0% |
| `test_suite_duration_seconds` | Full suite runtime | <300s | <120s |
| `test_determinism_rate` | % tests passing 100 consecutive runs | 100% | 100% |

---

## 13. Metrics by Subsystem

### 13.1 Ingestion Subsystem

**Required Metrics:**
- `neotoma_ingestion_started_total` (counter, labels: schema_type)
- `neotoma_ingestion_completed_total` (counter, labels: schema_type, status)
- `neotoma_ingestion_duration_ms` (histogram)
- `neotoma_ingestion_file_size_bytes` (histogram)
- `neotoma_ingestion_errors_total` (counter, labels: error_code)

---

### 13.2 Extraction Subsystem

**Required Metrics:**
- `neotoma_extraction_fields_extracted_count` (histogram)
- `neotoma_extraction_entities_extracted_count` (histogram)
- `neotoma_extraction_events_generated_count` (histogram)
- `neotoma_extraction_errors_total` (counter, labels: error_code, schema_type)

---

### 13.3 Search Subsystem

**Required Metrics:**
- `neotoma_search_queries_total` (counter, labels: search_mode)
- `neotoma_search_duration_ms` (histogram)
- `neotoma_search_results_count` (histogram)
- `neotoma_search_zero_results_rate` (gauge)

---

### 13.4 Graph Subsystem

**Required Metrics:**
- `neotoma_graph_records_total` (gauge)
- `neotoma_graph_entities_total` (gauge)
- `neotoma_graph_events_total` (gauge)
- `neotoma_graph_edges_total` (gauge, labels: edge_type)
- `neotoma_graph_orphan_nodes_total` (gauge) — MUST = 0

---

## 14. Metric Validation and Testing

### 14.1 Metric Accuracy Tests

**Pattern:** Verify metrics match ground truth.

```typescript
test('upload counter increments correctly', async () => {
  const before = await getMetric('neotoma_record_upload_total');
  
  await uploadFile(testFile);
  
  const after = await getMetric('neotoma_record_upload_total');
  expect(after).toBe(before + 1);
});
```

---

### 14.2 Determinism Tests for Metrics

```typescript
test('same upload produces same metrics', async () => {
  const metrics1 = await uploadFileAndCaptureMetrics(file);
  await resetDB();
  const metrics2 = await uploadFileAndCaptureMetrics(file);
  
  expect(metrics1.extraction_fields_count).toBe(metrics2.extraction_fields_count);
  expect(metrics1.entities_extracted_count).toBe(metrics2.entities_extracted_count);
});
```

---

## Detailed Documentation References

For implementation details, see:
- [`docs/observability/metrics_standard.md`](../observability/metrics_standard.md) — Metric naming conventions
- [`docs/observability/logging.md`](../observability/logging.md) — Logging structure
- [`docs/architecture/consistency.md`](../architecture/consistency.md) — Consistency guarantees
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Deterministic behavior
- [`docs/testing/testing_standard.md`](../testing/testing_standard.md) — Test coverage requirements

---

## Agent Instructions

### When to Load This Document
Load when:
- Planning observability for Feature Units
- Defining success criteria for MVP
- Assessing product health
- Planning dashboard features
- Setting alerting thresholds

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (product goals)
- `docs/observability/metrics_standard.md` (naming conventions)
- `docs/architecture/consistency.md` (subsystem consistency tiers)

### Constraints Agents Must Enforce
1. All product metrics MUST have required thresholds
2. All technical metrics MUST align with performance targets in `architecture.md`
3. Graph health metrics MUST enforce integrity (orphans = 0)
4. All metrics MUST NOT include PII in labels
5. Metric names MUST follow naming conventions
6. Critical alerts MUST page immediately
7. All metrics MUST be tested for accuracy

### Validation Checklist
- [ ] All activation metrics defined with thresholds
- [ ] All technical performance metrics aligned with architecture.md targets
- [ ] Graph integrity metrics enforce zero orphans/cycles
- [ ] AI reliability metrics verify MCP accuracy
- [ ] Acceptance criteria complete for MVP launch
- [ ] Dashboard requirements specified
- [ ] Alerting thresholds set
- [ ] No PII in metric labels





