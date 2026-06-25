---
title: What Neotoma Is
summary: A plain-language orientation to Neotoma, the deterministic memory layer your AI agents share.
category: getting_started
audience: user
visibility: public
order: 10
featured: true
tags: [overview, orientation, getting-started]
---

# What Neotoma Is

Neotoma is a memory layer for your AI agents. You run it on your own machine. Your agents store facts in it once, and read them back across every tool and session. You own the data and can inspect every change.

## The problem it solves

You use more than one AI agent: maybe Claude Code, Cursor, ChatGPT, and Codex. Each one starts every session knowing nothing. You re-explain the same context. Two agents store two versions of the same person. You correct a fact in one tool and it is wrong again in the next. Neotoma gives those agents one shared, consistent memory so the context carries over and corrections hold.

## How it is different from chat memory and RAG

Most "AI memory" stores text and finds it again by similarity. That is useful for recall, but it does not give you a reliable, current version of a fact, and it cannot show you why a value is what it is.

Neotoma is a state layer. It records each fact as an immutable observation, resolves observations into entities (a person, a task, a transaction), and computes a current snapshot for each entity. Three things follow:

- **Deterministic.** The same observations always produce the same snapshot. IDs are derived by hashing the inputs, so results are reproducible.
- **Immutable and traceable.** Observations are append-only. Corrections add a new observation; they never erase the old one. Every field in a snapshot traces back to the observation, source, agent, and time that set it.
- **Yours.** Everything lives in a local SQLite file and local file storage under a directory you control. Nothing is used for training, and you can export it all.

## What it stores

Any typed record: contacts, tasks, transactions, contracts, decisions, events, and types you invent. The schema is flexible; Neotoma infers fields from your data and evolves the schema over time. You can ingest files too (PDF, CSV, Parquet, JSON, text), and agents extract structured records from them.

## How you use it

You reach the same memory four ways, all backed by one contract:

- **Your AI agents** call it through the MCP protocol (the main path).
- **The Inspector** is a bundled web app for browsing and managing everything. See [Using the Inspector](using_the_inspector.md).
- **The CLI** (`neotoma`) is for setup, scripting, and direct access.
- **The REST API** is for building your own applications on top.

## Next steps

- [Getting Started](getting_started.md): install, connect a tool, run your first ingestion.
- [Working with your memory](working_with_your_memory.md): what gets stored, correcting, merging, searching, exporting.
- For the deeper model, see [Architecture](../architecture/architecture.md) and [Determinism](../architecture/determinism.md).

## What it is not

Neotoma is not a note-taking app or a personal wiki. It is not a hosted, zero-install product; it requires npm and the command line today. It is not a retrieval cache; similarity search is an optional secondary feature, not the point. For who it suits best, see the [ICP](../icp/icp_from_functionality.md).
