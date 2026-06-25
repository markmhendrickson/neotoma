---
title: Documentation Outline
summary: The complete set of documentation needed to cover Neotoma's functionality for its ICP, categorized and ordered by priority.
category: development
subcategory: site
audience: developer
visibility: public
order: 5
tags: [documentation, outline, information-architecture, icp]
---

# Documentation Outline

This is the target documentation set for Neotoma, derived from the first-principles [functional audit](../icp/icp_from_functionality.md) and organized by what the [primary ICP](../icp/icp_from_functionality.md) needs, in priority order. It is the backbone for reconciling the in-app/bundled docs (see the [bundled docs reconciliation plan](../plans/bundled_docs_reconciliation_plan.md)).

Priority reflects the primary ICP: a technically proficient individual who runs multiple AI agents and wants one private, self-hosted, deterministic, owned memory. Tiers run from "needed to adopt at all" (P0) down to "contributor and internal" (P5). Each item names the functionality it must cover.

## How to read this

- **Tier** is the ICP priority, not authoring effort.
- **Audience** uses the four roles the docs system already supports: `user`, `operator`, `developer`, `agent`.
- **Covers** lists the audited functionality the doc must describe.
- This outline is interface-and-capability complete: every major functional surface from the audit maps to at least one entry.

---

## P0. Adopt: get running and connected

The first session has to succeed. Without these, nothing else matters.

| Doc | Audience | Covers |
| --- | --- | --- |
| **What Neotoma is** | user | The state-layer concept in plain terms; deterministic vs retrieval memory; what it is not. The single orientation page. |
| **Install** | operator | `npm install -g neotoma`, `neotoma init`, prerequisites (Node 20), data directory, dev vs prod, Docker option. |
| **Connect your tool** | operator | `neotoma setup --tool <host>`, `neotoma mcp config` options, per-host setup (Cursor, Claude Code, Claude Desktop, Codex, ChatGPT, Windsurf, Continue, VS Code, OpenCode, OpenClaw), MCP vs hooks. |
| **First ingestion / quick start** | user | Store a record, upload a file, retrieve it, see it in the Inspector. The five-minute success path. |
| **Verify your setup** | operator | `neotoma doctor`, what it checks, reading the output, common first-run failures. |

## P1. Use and trust day to day

The recurring loop: agents read and write, the human inspects and corrects, and the human trusts what is stored.

| Doc | Audience | Covers |
| --- | --- | --- |
| **What gets stored and when** | user | The agent behavior contract (store-first, retrieve-before-store, the turn lifecycle), explicit control, no background scanning. |
| **Record types and schema** | user | Built-in types (contacts, tasks, transactions, contracts, decisions, events); flexible/auto-inferred schema; singular type naming. |
| **Using the Inspector** | user | Tour of every screen: entities, detail, history/provenance, graph explorer, timeline, sources, observations, schemas, agents/grants, peers, subscriptions, issues, conversations/turns, search, analytics, settings. |
| **Correcting and editing state** | user | Corrections as high-priority observations; batch correction; why nothing is ever overwritten; how corrections propagate. |
| **Merging, splitting, deleting, restoring entities** | user | Duplicate detection, merge, split by predicate, soft delete and restore, GDPR deletion. |
| **Searching and retrieving** | user | Identifier resolution, multi-signal identity, filters, graph neighborhood, timeline queries, optional semantic vector search and how to enable it. |
| **File ingestion** | user | Supported formats (PDF with page image, CSV with chunking, Parquet, JSON, text; images/audio as raw), content-addressed dedup, idempotency. |
| **Exporting and owning your data** | user | `MEMORY.md` export, JSON snapshot export with provenance, full Markdown mirror; portability and exit. |
| **Privacy and data ownership** | user | Local-first storage, no training use, PII-free logs, what leaves the machine and what does not. |
| **What is guaranteed (and not yet)** | user | Deterministic state, versioned history, append-only log, provenance, CLI/MCP parity; preview caveats and breaking-change posture. |
| **Skills** | user | What skills are, the catalog, how `neotoma setup` installs them, how an agent uses them. |

## P2. Control multi-agent access and operate

Once it is in daily use, the ICP needs to control what agents may do and keep the service healthy.

| Doc | Audience | Covers |
| --- | --- | --- |
| **Agent identity and attribution** | operator | How writers are identified (key thumbprint, JWT subject, client name), trust tiers, the per-write audit trail. |
| **Agent grants and capabilities** | operator | Least-privilege grants, capability operations and entity-type scope, lifecycle (active/suspended/revoked/restore), managing grants in the Inspector and CLI. |
| **Hardware-attested agent auth (AAuth)** | operator | Apple Secure Enclave, TPM 2.0, WebAuthn/FIDO2, YubiKey, Windows TBS; attestation, revocation checks, when to require it. |
| **Authentication and access control** | operator | Local auth, MCP OAuth, guest access tokens, sandbox modes, access policies, tenant scoping. |
| **Encryption and key management** | operator | Optional AES-256-GCM column encryption, key file vs BIP-39 mnemonic, which columns are covered, encrypted-volume guidance. |
| **Running the server** | operator | Transports (stdio, WebSocket, HTTP), ports, environments, launch agents, tunnels/HTTPS, the API and MCP processes. |
| **Backup, recovery, and health** | operator | Database location, backup, SQLite salvage/recovery, snapshot health checks, the runbook. |
| **Configuration reference** | operator | The `NEOTOMA_*` environment variables, data directory model, dev/prod profiles, precedence. |

## P3. Build on it and federate

The ICP often builds on the API and connects instances.

| Doc | Audience | Covers |
| --- | --- | --- |
| **REST API reference** | developer | The OpenAPI surface, auth, the ~100 endpoints by group, error envelope and hints, idempotency. |
| **MCP tool reference** | agent | The ~60 tools by category, input/output shapes, the agent instruction contract, CLI-equivalent logging. |
| **Client SDKs** | developer | `@neotoma/client` (TypeScript) and `neotoma-client` (Python): install, auth, store/retrieve, transports. |
| **Hooks and plugins** | developer | The per-harness packages (Claude Code, Cursor, Codex, OpenCode, Claude Agent SDK), the OpenClaw native plugin, what hooks guarantee vs MCP. |
| **Schema management** | developer | SchemaDefinition fields, inference, recommendation, auto-enhancement, incremental updates and versioning, schema-agnostic design. |
| **Subscriptions and events** | developer | Event types, webhook (HMAC) and SSE delivery, filters, retries, loop prevention. |
| **Federation and peers** | operator | Peer registration, sync scope and direction, conflict resolution strategies, multi-device sync. |
| **Canonical Markdown mirror** | operator | Mirror profiles, deterministic rendering, git-tracking, rebuild modes. |
| **Webhooks and integrations beyond MCP** | developer | Inbound sync webhook, GitHub issue federation, external actor promotion. |

## P4. Understand the system deeply

For the builder/debugger mode and anyone deciding to trust the design.

| Doc | Audience | Covers |
| --- | --- | --- |
| **Architecture overview** | developer | The pipeline (source to observation to entity to snapshot), the layered State-Layer boundary, components. |
| **Data model** | developer | Sources, observations, entities, snapshots, relationships, timeline events, interpretations, raw fragments; what is immutable. |
| **Determinism** | developer | Hash-based IDs, stable ordering, canonicalization, why output is reproducible. |
| **The reducer and merge policies** | developer | Per-field merge strategies, observation source priority, snapshot computation, provenance map. |
| **Entity resolution and identity** | developer | Canonical name rules, multi-signal resolution, duplicate detection, equivalence/aliases. |
| **Timeline and relationships** | developer | Event derivation from date fields, typed relationships, cycle prevention, liveness. |
| **Consistency, idempotence, and provenance** | developer | Transactional writes, idempotency keys, the provenance/audit chain. |
| **Foundations** | developer | Core identity, philosophy, the manifest invariants. |

## P5. Reference, contribute, and internal

Lower priority for the ICP using the product; needed for completeness and contributors.

| Doc | Audience | Covers |
| --- | --- | --- |
| **CLI reference** | developer | Every command and flag, runtime overrides, exit codes. |
| **Error and hint reference** | developer | Error codes, the structured hint contract, common causes. |
| **Vocabulary / glossary** | user | Terms: observation, snapshot, entity, source, interpretation, grant, attestation, tier, mirror. |
| **Legal and compliance** | user | Privacy posture, data handling, GDPR deletion, terms. |
| **Troubleshooting** | user | Common failures across install, connect, ingest, search, sync, with fixes. |
| **Contributing and development** | developer | Local setup, tests, conventions, release process. |
| **Internal (hidden in production)** | developer | Plans, proposals, prototypes, reports, feature units, implementation notes. |

---

## Coverage check against the functional audit

Every audited surface maps to at least one outline entry:

- Ingestion and storage: *File ingestion*, *What gets stored and when*, *Architecture overview*, *Data model*.
- Retrieval and search: *Searching and retrieving*, *MCP tool reference*, *REST API reference*.
- Corrections and interpretations: *Correcting and editing state*, *The reducer and merge policies*.
- Schema subsystem: *Record types and schema*, *Schema management*, *Entity resolution and identity*.
- Entity lifecycle: *Merging, splitting, deleting, restoring entities*.
- Relationships and timeline: *Timeline and relationships*.
- Auth and multi-agent control: *Agent identity*, *Agent grants and capabilities*, *Hardware-attested agent auth*, *Authentication and access control*.
- Federation and sync: *Federation and peers*, *Subscriptions and events*, *Canonical Markdown mirror*.
- Storage, encryption, portability: *Configuration reference*, *Encryption and key management*, *Exporting and owning your data*, *Backup, recovery, and health*.
- Interfaces: *Connect your tool*, *Using the Inspector*, *REST API reference*, *MCP tool reference*, *CLI reference*, *Running the server*.
- Packages ecosystem: *Client SDKs*, *Hooks and plugins*.
- Foundations and guarantees: *What is guaranteed*, *Foundations*, *Determinism*, *Consistency, idempotence, and provenance*.
