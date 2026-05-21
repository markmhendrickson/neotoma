# Security Advisories

Internal record of security findings, their scope, remediation status, and disclosure timeline. Each advisory documents a specific vulnerability class, the release(s) affected, the conditions required for exploitation, and the fix.

## Index

| Advisory | Title | Affected | Severity | Status |
|----------|-------|----------|----------|--------|
| [2026-05-11-inspector-auth-bypass](./2026-05-11-inspector-auth-bypass.md) | Inspector local-auth bypass via alternate path | v0.11.x | High (single-user; now patched) | Fixed in v0.11.1 |
| [2026-05-21-relationship-endpoint-tenant-isolation](./2026-05-21-relationship-endpoint-tenant-isolation.md) | Tenant isolation gap in relationship query endpoints | v0.13.0 | Low (no multi-tenant deployments) | Open — fix tracked in #365, #366 |

## Format

Each advisory file documents:

- **CVE class** — the vulnerability category and which known regression class it belongs to (if any)
- **Affected versions** — which releases contain the vulnerability
- **Prerequisites** — what an attacker needs to exploit it
- **Impact** — what data or functionality is exposed
- **Severity** — low / medium / high and the reasoning
- **Remediation** — the fix and the release it landed in
- **Disclosure timeline** — when it was discovered, reported, fixed, and disclosed
- **Tracking issues** — links to GitHub issues
