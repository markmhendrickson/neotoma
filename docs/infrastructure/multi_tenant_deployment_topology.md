# Multi-Tenant Deployment Topology

## Scope

This document is a decision aid for choosing how to run Neotoma when more than one
tenant's data is served from the same operator. It states the current single-node
constraints accurately, lays out three deployment topologies with their trade-offs,
and gives a recommendation keyed to the common case: a self-hosted application
serving many tenants, with its own system of record, that wants Neotoma as a
rebuildable derived layer.

It is a starting point for a deployment conversation, not a final standard. The
recommendation is defensible from the current code, but the boundary conditions
(tenant count, write concurrency, isolation requirements) are operator-specific and
should be confirmed against a real workload.

Related:

- `docs/plans/multi-tenant-operational-patterns.md` — the `neotoma fleet` CLI design
  for operating an instance-per-tenant fleet (Topology A below).
- `docs/infrastructure/deployment.md` — single-instance deployment mechanics.
- `docs/subsystems/auth.md` — per-request tenant resolution via `getAuthenticatedUserId`.
- `docs/foundation/substrate_and_applications.md` — what the substrate owns vs. the application.

## Current state (what the code actually does)

These are the constraints any topology choice has to start from, verified against
`src/repositories/sqlite/sqlite_client.ts` and the server entrypoint:

- **Backend is SQLite** (`better-sqlite3`). The repository layer defines storage
  interfaces (`src/repositories/interfaces.ts`), so a second backend is a real seam,
  but only the SQLite binding exists today — there is no Postgres adapter.
- **WAL is enabled** (`journal_mode = WAL`), and `foreign_keys = ON`. WAL allows
  concurrent readers alongside a single writer.
- **`busy_timeout` is not set.** With `better-sqlite3`'s default of 0, a second
  _process_ that contends for the write lock fails immediately with `SQLITE_BUSY`
  rather than waiting. This is the single most important fact for multi-process plans.
- **Writes serialize within one process.** `better-sqlite3` is synchronous, so a
  single Node process is itself a single writer; there is no in-process write
  contention. The server runs as one process (no clustering/forking), so today the
  whole deployment is effectively one writer.
- **Tenant isolation is per-row, enforced on every query path** via
  `getAuthenticatedUserId` + `.eq("user_id", userId)`, with a cross-tenant read
  matrix (`tests/security/tenant_isolation_matrix.test.ts`). Isolation does not
  depend on physical separation; it holds within a shared database.

Net: the current single-process + single-file model is correct and safe for one
writer. It is not, as shipped, a multi-writer or multi-process serving story —
`busy_timeout` unset means a naive "run two processes against one file" deployment
will throw under concurrent writes.

## The three topologies

### A. Instance-per-tenant (one SQLite file + one process per tenant)

Each tenant gets its own data directory, database file, and server process. Isolation
is physical as well as per-row. This is the model the `neotoma fleet` CLI is being
built around.

- **Strengths:** strongest isolation (a tenant cannot contend with or read another at
  the storage layer); no shared-writer problem (each process is its own single writer,
  WAL as-is is sufficient); per-tenant backup/restore/retention is trivial; blast
  radius of a corruption or migration bug is one tenant; maps cleanly onto self-hosted
  single-tenant deployments (a tenant can later take their instance and run it
  themselves with zero migration).
- **Costs:** process and memory overhead scales linearly with tenant count (~350 MB ×
  N storage, one process each); a control plane is needed to provision, route, health-
  check, back up, and migrate the fleet (this is what `neotoma fleet` addresses, and
  it is not finished); cross-tenant operator queries are deliberately impossible.
- **Practical ceiling:** good to the low hundreds of tenants per host before the
  process/memory overhead and fleet-coordination cost dominate. Past that, you are
  effectively running an orchestration platform.

### B. Shared Postgres backend (one database, per-row tenant scoping)

Replace the SQLite binding with a Postgres adapter behind the existing repository
interfaces. One database, many tenants, isolation by `user_id` scoping (already
enforced in the query layer) — optionally hardened with row-level security.

- **Strengths:** real multi-writer concurrency (Postgres MVCC removes the single-writer
  constraint entirely — the `busy_timeout` problem disappears); one operational surface
  to back up, monitor, and scale; connection pooling and horizontal read replicas are
  standard; supports many more tenants per deployment than instance-per-tenant.
- **Costs:** requires building and hardening the Postgres adapter (the seam exists; the
  adapter does not) — every query path, the reducer's determinism guarantees, and the
  idempotency/transactional-write contracts must be re-verified against Postgres
  semantics; isolation becomes logical-only, so the `user_id` scoping and (recommended)
  RLS are now load-bearing for tenant separation rather than belt-and-suspenders;
  a Postgres dependency raises the self-hosting bar for a tenant who later wants to run
  their own instance.
- **Practical ceiling:** the standard multi-tenant SaaS ceiling — thousands+ of tenants
  on one cluster, bounded by Postgres scaling rather than by Neotoma.

### C. Dedicated self-hosted (one tenant runs Neotoma entirely themselves)

The tenant runs their own Neotoma instance inside their own infrastructure, against
their own storage, behind their own interface. The operator never holds their data.

- **Strengths:** maximal data control and the cleanest answer to "what if the sponsor
  diverges?" — there is no shared infrastructure to diverge on; pairs naturally with
  treating Neotoma as a derived layer rebuilt from the tenant's own system of record;
  no multi-tenant concurrency question at all (it is single-tenant by construction).
- **Costs:** the tenant owns deployment, upgrades, and operations; no operator-side
  fleet view; only viable for tenants with the appetite to self-operate.
- **Practical ceiling:** one tenant per deployment, by design. Scales by replication of
  the pattern, not by a shared cluster.

## Recommendation (for the common self-hosted-multi-tenant case)

For an application that serves many tenants, keeps its own system of record, and wants
Neotoma reversible:

1. **Start on Topology A (instance-per-tenant), self-hosted by the application.** It is
   the only option that works today with no new storage code, it gives the strongest
   isolation, and — critically — it keeps the dependency reversible: each tenant's
   instance is a standalone Neotoma that can be lifted out and self-run with zero
   migration. The cost is the fleet control plane, which is already on the roadmap.

2. **Set `busy_timeout` and document the single-writer envelope now**, regardless of
   topology, so that even an instance-per-tenant host with an occasional second process
   (a backup job, a migration) degrades to waiting rather than throwing `SQLITE_BUSY`.
   This is a small, unambiguous hardening with no downside.

3. **Treat Topology B (shared Postgres) as the scale path, not the starting point.**
   Build the Postgres adapter when tenant count or write concurrency actually exceeds
   what instance-per-tenant comfortably serves — not preemptively. When it is built, it
   must come with the determinism, idempotency, and isolation re-verification called out
   above; it is not a drop-in.

4. **Offer Topology C to any tenant who wants it.** It is the strongest possible answer
   to the governance/divergence question and costs the substrate nothing to support,
   because self-hosting is already the default posture.

This sequences risk correctly: ship on what exists (A), harden the known sharp edge
(`busy_timeout`), and earn the larger storage investment (B) against real load rather
than a hypothetical.

## Open questions for the working session

These are the operator-specific inputs that move the recommendation, and the agenda for
a deployment conversation:

- **Tenant count and growth curve** — tens, hundreds, thousands? This is the main fork
  between Topology A and Topology B.
- **Write concurrency per tenant** — bursty interactive writes vs. steady ingestion
  changes how much the single-writer envelope matters.
- **Isolation requirement** — is per-row scoping (with RLS) acceptable, or is physical
  separation a hard requirement (regulatory, contractual)? A hard requirement points at
  A or C and rules out B.
- **Self-host appetite per tenant** — does the application self-host the whole fleet, or
  do some tenants want to run their own instance (Topology C)?
- **System-of-record relationship** — if Neotoma is a rebuildable derived layer over the
  tenant's own Postgres, the bulk-import/rebuild path (and its cost) is part of the
  topology decision, because it sets how cheaply a tenant can be re-homed or recovered.
