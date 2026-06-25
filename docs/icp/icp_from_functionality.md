---
title: ICP from Functionality
summary: Who Neotoma is for, derived from a first-principles audit of what the code actually does.
category: use_cases
subcategory: icp
audience: user
visibility: public
order: 5
tags: [icp, audience, positioning, personas]
---

# ICP from Functionality

This document states who Neotoma is primarily for. It is derived only from a first-principles audit of the repository's actual functionality (source code, the MCP tool surface, the REST API contract, the CLI, the Inspector, the packages, and the storage and auth layers). It does not draw on marketing copy, the public site, or prior positioning documents. For reconciliation with the existing `docs/icp/` materials, see [ICP reconciliation](icp_reconciliation.md).

## Method

The functional audit covered:

- The MCP server (about 60 tools) and the REST API (about 100 endpoints), over stdio, WebSocket, and HTTP transports.
- The core data model: immutable sources and observations, deterministic entity resolution, reduced snapshots, typed relationships, and timeline events.
- The schema subsystem: schema inference, recommendation, auto-enhancement, and schema-agnostic per-type behavior.
- Search: local semantic vector search (sqlite-vec) plus keyword and identifier resolution.
- Auth and multi-agent control: local auth, MCP OAuth, hardware-attested agent auth (Apple Secure Enclave, TPM 2.0, WebAuthn/FIDO2, YubiKey, Windows TBS), agent grants, and capabilities.
- Federation and sync: peers, conflict resolution, subscriptions (webhook and SSE), and the canonical Markdown mirror.
- Storage and portability: local-first SQLite, content-addressed file storage, optional AES-256-GCM encryption, and three export formats.
- The Inspector web app and the CLI as the human-facing surfaces.
- The packages ecosystem: TypeScript and Python SDKs, editor and agent plugins (Claude Code, Cursor, Codex, OpenCode, Claude Agent SDK, OpenClaw), and evaluation harnesses.

The ICP below is inferred from what that functionality optimizes for and from the friction it removes.

## Primary ICP

**Developers building and operating AI agents who need a persistent, deterministic, auditable memory layer shared across the tools they run.**

Neotoma ships as an MCP server and REST API with drop-in hook packages (Claude Code, Cursor, Codex, OpenCode), a Claude Agent SDK adapter, and TypeScript and Python clients. Its core value (versioned observations, deterministic snapshots, field-level provenance, idempotency, corrections-win) is memory-engine infrastructure for agent loops, not an end-user app. At personal scale this developer-operator is one individual who is at once the operator who runs the service, the subject whose data it holds, and the builder who wires it into tools; the audience does not fragment into separate buyers.

### Why the functionality points here

| Functional evidence | What it implies about the user |
| --- | --- |
| MCP is the primary interface, with first-class plugins and hooks for Claude Code, Cursor, Codex, OpenCode, Claude Agent SDK, ChatGPT, and OpenClaw | The user runs several AI agents and wants memory shared across all of them |
| Install and operation are CLI-driven (`npm install -g`, `neotoma init/setup/doctor`, env vars, launch agents, tunnels) | The user is comfortable on the command line; this is not a consumer app |
| Storage is a local SQLite file plus content-addressed files under a user-controlled directory; optional at-rest encryption; no training use | The user wants ownership, privacy, and control of their data, not a hosted black box |
| Three export paths (bounded `MEMORY.md`, JSON snapshot with provenance, full Markdown mirror) | The user values portability and the ability to leave or inspect at any time |
| Personal and work record types (contacts, tasks, transactions, decisions, events) plus skills for email, finances, conversations, calendar, contacts, and codebases | The user manages their own life and work data, not a single narrow vertical |
| Agent attribution, grants, capabilities, and hardware attestation on every write | The user runs more than one agent and needs to control and audit what each may do |
| Deterministic, immutable, fully provenanced state with an Inspector audit trail | The user cares about correctness and being able to trace and trust what agents stored |

### Jobs to be done

- Keep what agents learn from disappearing between sessions and tools.
- Maintain one consistent version of each fact across every agent and host.
- Correct a fact once and have the correction hold everywhere, permanently and traceably.
- Inspect, replay, and audit what any agent stored and why.
- Control, per agent, what can be written and to which types.
- Keep all of this on hardware the person owns, with a clean exit path.

## Secondary ICPs

These are strongly supported by the functionality but are narrower than, or downstream of, the primary developer-operator. The two most common adjacent users are the individual running a personal cross-assistant memory (a single-user instance of the primary) and the operator of a shared or hosted instance (profiles 1 and 2 below).

### 1. Developers building agentic applications on a state layer

The architecture is explicitly a State Layer with no strategy or execution logic inside it. It offers a deterministic, queryable, auditable substrate; a stable OpenAPI contract shared by REST, MCP, and CLI; TypeScript and Python SDKs; idempotent mutating operations; typed relationships; and a subscription/event system. These are the primitives a developer needs to build an Operational Layer (assistants, pipelines, command centers) on top without reimplementing memory, versioning, conflict handling, or audit.

### 2. Security-conscious operators of multi-agent fleets

Hardware-attested agent identity, trust tiers, attestation revocation checks, agent grants with least-privilege capabilities, per-write attribution, tenant scoping, and an immutable provenance chain are disproportionate investments unless the intended operator runs untrusted or third-party agents and must constrain and audit them. This profile cares about who wrote what, under which key, with what authority.

### 3. Privacy-focused individuals consolidating a personal data corpus for AI

Local-first SQLite, content-addressed ingestion of personal documents (PDF, CSV, Parquet, email and finance imports), optional encryption, no training use, and full export support a user whose main motivation is to own a structured corpus of their own data and make it available to AI on their terms.

## Tertiary and emergent

Functionally enabled but not the design center:

- **Small groups sharing a memory substrate** through peer federation and subscriptions across instances and devices.
- **Builders of inspection or command-center UIs** who treat the Inspector and the graph/timeline APIs as a reference pattern.

## Who Neotoma is not for (functionally)

- **Casual note-takers and PKM/Obsidian-style users.** There is no human-first editing experience; the model is agent-written observations with corrections, not freeform documents.
- **Users who need zero-install, hosted onboarding.** Setup requires npm, the CLI, and operator decisions.
- **Teams wanting a managed multi-tenant SaaS today.** Storage is local-only in preview; tenancy exists as `user_id` scoping, not a hosted product.
- **Platform builders whose core product is the memory or state engine itself.** Neotoma is that engine; it is meant to be built upon, not rebuilt.
- **Pure retrieval/RAG use cases.** The system optimizes for deterministic state integrity, versioning, and audit, not similarity recall (semantic search is an optional secondary capability).

## Qualification signals

Someone is in the primary ICP if most of these are true:

- They already use two or more AI agents or assistants and feel the cost of fragmented memory.
- They are comfortable installing an npm CLI and running a local service.
- They want their data on their own machine and care that it is never used for training.
- They want to correct facts once and trust the correction holds and is traceable.
- They run agents they want to constrain and audit, or they intend to build on the API.

## Summary

| Profile | Core motivation | Decisive functional evidence |
| --- | --- | --- |
| **Primary: agent developer/operator** | A persistent, deterministic, shared memory layer for the agents they build and run | MCP server + REST API, hook/SDK packages, deterministic snapshots, provenance, idempotency |
| **Secondary: app/agent developer** | A deterministic state layer to build on | State-Layer boundary, OpenAPI contract, SDKs, subscriptions, idempotency |
| **Secondary: fleet security operator** | Constrain and audit untrusted agents | Hardware attestation, grants/capabilities, provenance, tenant scoping |
| **Secondary: privacy-focused individual** | Own a structured personal corpus for AI | Local storage, document ingestion, encryption, no training |
| **Tertiary: federated small group** | Shared memory across devices/instances | Peers, conflict resolution, subscriptions, mirror |
