# Security Review: PR #1479 — Multi-Hop Graph Traversal + Bulk Entity Import

**Verdict:** Tenant isolation holds across all four examined cross-tenant leak vectors; 2 regression tests added, 2 vectors covered by existing tests.

## Vector results

| Vector                 | Hypothesis                                                                 | Result | Enforcing test                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| seed-entity-ownership  | A caller can seed multi-hop traversal from an entity owned by another user | Safe   | existing coverage                                                                                                                       |
| edge-scoping-escape    | Per-hop BFS expansion follows an edge into another user's subgraph         | Safe   | `tests/security/tenant_isolation_matrix.test.ts` — "planted cross-tenant edge does NOT leak user B's edges or entity via multi-hop BFS" |
| bulk-import-cross-user | Bulk `/store` import writes entities attributed to another user            | Safe   | `tests/security/tenant_isolation_matrix.test.ts` — "/store bulk import (bulk-import-cross-user)"                                        |
| unauth-and-guest       | Unauthenticated or guest callers reach the new traversal/import surfaces   | Safe   | existing coverage                                                                                                                       |

## What was probed

The adversarial pass examined four angles against the new traversal and bulk-import surfaces. First, seed-entity ownership: whether a traversal can be rooted at an entity belonging to another tenant. Second, per-hop edge scoping: whether BFS expansion across hops can follow a planted cross-tenant edge into another user's entities or edges. Third, bulk-import cross-user write: whether a batched `/store` import can attribute writes to, or overwrite data owned by, a different user. Fourth, unauthenticated and guest reach: whether these surfaces are accessible without proper authentication or via guest credentials.

For the edge-scoping and bulk-import vectors, an explicit cross-tenant fixture was planted (user B data, user A request) and a regression test added asserting no leak or misattribution. The seed-entity-ownership and unauth/guest vectors were already covered by existing tests in the security suite; those tests were cited and confirmed passing.

## What this is and isn't

This note records an independent adversarial agent pass that converted each examined attack into a durable regression test (or cited existing coverage where present). It is NOT a substitute for human code review. It does not assert the absence of vulnerabilities outside the four vectors listed above, and it does not evaluate non-isolation concerns (correctness, performance, denial of service). Reviewers SHOULD treat the added tests as the enforceable contract for these four vectors and MUST NOT interpret a passing run as blanket security sign-off for the PR.
