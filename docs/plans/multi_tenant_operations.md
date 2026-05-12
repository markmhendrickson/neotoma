# Multi-Tenant Operational Patterns

## Context

Lemonbrand projects 100+ Neotoma instances by December 2026, each representing a client tenant. Today operational tasks (backup, health check, schema lifecycle) are manual shell scripts per instance. At 100+ instances this becomes untenable.

## Current State

- Each instance is a standalone SQLite database with its own data directory
- `neotoma backup create` handles a single instance
- `neotoma api start/stop/logs` manages a single server process
- No fleet-wide coordination or discovery mechanism exists
- VPS-based deployment with SSH access per instance

## Design Principles

1. **No central coordinator** — instances remain independent SQLite databases
2. **Discovery-based** — fleet commands discover instances from a config file or directory scan
3. **Idempotent operations** — all fleet commands are safe to re-run
4. **Progressive disclosure** — single-instance commands continue to work unchanged

## Proposed Commands

### `neotoma fleet list`
Discover and list all managed instances from a fleet configuration.

```yaml
# ~/.config/neotoma/fleet.yaml
instances:
  - name: bolden
    data_dir: /var/neotoma/bolden
    env: production
  - name: ottawa-meetup
    data_dir: /var/neotoma/ottawa
    env: production
```

### `neotoma fleet health`
Run health checks across all instances. Report:
- DB size and growth rate
- Last backup timestamp and validity
- Schema version drift
- Observation count and entity count

### `neotoma fleet backup`
Run `backup create` for all instances. Options:
- `--parallel <n>` — concurrent backup limit
- `--verify` — run verify on each backup after creation
- `--output <dir>` — base directory (creates per-instance subdirs)

### `neotoma fleet schemas`
Report schema versions and field differences across instances.
Detect when one instance has a schema update that others lack.

## Implementation Strategy

### Phase 1: Fleet Configuration (2-3 days)
- Define `fleet.yaml` format
- Implement `neotoma fleet list` with health probing
- Add `--fleet-config` global flag

### Phase 2: Fleet Health + Backup (3-5 days)
- `neotoma fleet health` with aggregated reporting
- `neotoma fleet backup` with parallel execution
- JSON output mode for automation

### Phase 3: Schema Lifecycle (5-7 days)
- `neotoma fleet schemas` for cross-instance comparison
- Schema version pinning and drift alerts
- Per-instance schema registration lifecycle

## Scale Considerations

- At 100 instances × ~350 MB each = ~35 GB total storage
- Backup parallelism capped at available disk I/O
- Health checks are lightweight (SQLite PRAGMA + file stat)
- No cross-tenant queries by design (isolation preserved)

## Timeline

| Milestone | Target |
|-----------|--------|
| Fleet config + list | 2026-05-30 |
| Fleet health + backup | 2026-06-15 |
| Schema lifecycle | 2026-07-01 |
| Documentation complete | 2026-07-08 |

## Open Questions

- Remote instances: SSH-based execution or local-only?
- Alerting: integrate with existing monitoring or standalone?
- Tenant isolation guarantees at the fleet command level?
