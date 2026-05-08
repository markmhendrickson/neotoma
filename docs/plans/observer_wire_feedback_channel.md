# Observer Wire / Agent Feedback Channel — Lemonbrand

## Context

Lemonbrand operates a Mac-side CLI observer that captures all Neotoma CLI invocations as JSONL. They want to wire anomaly reports (hard errors, schema rejections, resolver surprises, perf regressions, version drift) into Neotoma's structured issue mechanism.

## Current State

### Issue System
- `issue` entity type exists and is registered in schema definitions
- `submit_issue` MCP tool is implemented for creating issues
- `get_issue_status` and `add_issue_message` tools exist for lifecycle management
- Issues are stored locally and optionally mirrored to GitHub
- PII redaction is enforced before public submissions

### Guest Credentials
- Access policy framework supports `closed` mode per entity type
- AAuth admission (`src/services/aauth_admission.ts`) can provision guest agents
- Guest agents can be restricted to specific entity types and operations

### Observer (Lemonbrand side)
- Captures JSONL of every CLI invocation
- Detects anomalies: errors, unexpected responses, perf degradation
- Currently writes to local files only (no Neotoma integration)

## Proposed Integration

### Anomaly Submission Shape

```typescript
interface ObserverAnomalyReport {
  entity_type: "issue";
  title: string;
  category: "hard_error" | "schema_rejection" | "resolver_surprise" | "perf_regression" | "version_drift";
  severity: "critical" | "high" | "medium" | "low";
  cli_version: string;
  api_version?: string;
  command: string;
  error_class?: string;
  error_message?: string;
  response_time_ms?: number;
  context: Record<string, unknown>;
  timestamp: string;
}
```

### Credential Provisioning

1. Generate an AAuth keypair for `lemonbrand-cli-observer`
2. Register in target Neotoma instance with `software` tier
3. Set access policy: `issue` entity type → `open` for this agent
4. All other entity types remain `closed` (observer is read-nothing, write-issues-only)

### Wire Protocol

Option A: **MCP tool** — Observer calls `submit_issue` via MCP proxy
- Pros: Uses existing infrastructure, PII redaction built-in
- Cons: Requires MCP proxy setup on Mac

Option B: **HTTP POST /store** — Direct API call with AAuth-signed request
- Pros: Simpler deployment, no MCP dependency
- Cons: Needs AAuth signing implementation on observer side

Option C: **CLI command** — `neotoma report --from-observer <jsonl-path>`
- Pros: Batch processing, no persistent connection needed
- Cons: New command to implement, delayed reporting

**Recommendation**: Option C for MVP (batch import from observer JSONL), with Option B as a follow-up for real-time reporting.

## Implementation Plan

### Phase 1: Confirm Schema + Guest Credential (1-2 days)
- Verify `issue` entity type schema accepts the anomaly report fields
- Create AAuth keypair for `lemonbrand-cli-observer`
- Set access policy for the observer agent
- Test end-to-end: observer agent can write issues, nothing else

### Phase 2: CLI Report Command (2-3 days)
- Implement `neotoma report --from-observer <jsonl-path>`
- Parse JSONL, extract anomalies, submit as issues
- Deduplicate by error class + command combination
- JSON output with submitted issue IDs

### Phase 3: Real-Time Wire (future)
- HTTP client with AAuth signing for the observer
- Near-real-time anomaly submission
- Backpressure handling for burst failures

## Timeline

| Milestone | Target |
|-----------|--------|
| Schema + credential confirmed | 2026-05-12 |
| CLI report command | 2026-05-19 |
| Lemonbrand integration test | 2026-05-23 |
| Real-time wire (stretch) | 2026-06-15 |

## Open Questions

- Rate limiting for observer submissions? (Recommendation: 100 issues/hour cap)
- Auto-resolution when a fix ships? (Link to release supplement)
- Cross-instance deduplication? (Same error across 100 tenants = 1 issue or 100?)
