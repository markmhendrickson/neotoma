# Security review — atomic corrections

Status: implementation review prepared; independent review pending. No release approval is implied.

## Scope

A new authenticated HTTP/MCP correction operation composes the existing correction service inside the existing database driver's transaction. CLI uses the shared OpenAPI operation map. No authentication policy, signing identity, schema registration or external network privilege changes.

## Threats and controls

- Cross-graph writes: authenticated user resolution is reused; every receipt/target read is scoped. HTTP tenant matrix and direct service scope tests reject foreign targets.
- Concurrent lost updates: observation counts and reviewed expected fields are compared inside the write transaction. Two drafts competing for one resource permit one winner.
- Retry double writes: graph-scoped receipt keys and canonical payload hashes reject changed payloads and make identical requests replay without extra observations.
- Partial writes/events: injected failure after the first correction rolls the entire transaction back; notification callbacks run only after commit.
- Misleading reducer success: all changed fields are re-read inside the transaction; if a higher-priority observation wins, the entire attempt fails and rolls back.
- Agent authority: the shared service calls existing correction capability enforcement, preserving the authenticated request context across HTTP/MCP/CLI.
- Resource bounds: 50 entities, 50 changes each, existing request body limits. No additional data lookup outside the supplied graph/targets.

## Validation and residual limits

The focused 102-test service/transport/scope set and server build pass. Red-before-fix failures established partial commit, concurrent double acceptance, false replay and payload-mismatch behavior under sequential composition. Existing single-entity behavior is unchanged. The primitive does not establish human consent or freeze external document revisions; applications own these checks. Replays return current snapshots, not the original historical response. Independent review must be resolved before merge.
