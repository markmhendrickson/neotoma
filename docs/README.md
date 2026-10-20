# Neotoma documentation

Neotoma is the system of record for AI agents: a record, not recall. These docs describe what the current build does. Pages under `foundation/` state the design, so read them with the build in mind; where the two differ, the code and the README are the reference.

Applies to main; the latest release is v0.25.0.

A running Neotoma server also serves these files at its own `/docs` route. To install and try Neotoma, start with the [README](../README.md).

## Start here

- [Developer getting started](developer/getting_started.md): local development setup with SQLite and the local filesystem.
- [CLI reference](developer/cli_reference.md): every `neotoma` command.
- [MCP overview](developer/mcp_overview.md): connect an agent host over MCP, with a guide per host.
- [REST API](api/rest_api.md) and the [OpenAPI spec](../openapi.yaml): the same operations over HTTP.
- [Integrations matrix](integrations/matrix.md): every documented host and how it connects. The README table covers the common hosts; the matrix also lists hosts that are configured by hand.

## How the record works

- [Architecture](architecture/architecture.md): sources, observations, entities, snapshots, and relationships.
- [Reducer](subsystems/reducer.md): how the current value of each field is computed from observations.
- [Observation architecture](subsystems/observation_architecture.md): how observations are stored and linked to sources.
- [Determinism](architecture/determinism.md): what is derived from inputs, and how.
- [Atomic corrections](developer/atomic_corrections.md): apply a bounded set of corrections in one transaction.

## Foundation

- [Core identity](foundation/core_identity.md): what Neotoma is and is not.
- [Product positioning](foundation/product_positioning.md): the category and how it is described.
- [Problem statement](foundation/problem_statement.md) and [philosophy](foundation/philosophy.md).

## Folder map

| Folder | Holds |
| --- | --- |
| `developer/` | Setup, CLI, MCP, and release guides for people building with or on Neotoma |
| `api/`, `reference/` | API and reference material |
| `architecture/`, `subsystems/` | Design of the data model and its parts |
| `integrations/` | Host-by-host integration status |
| `foundation/` | Identity, positioning, and principles |
| `security/` | Practices, threat model, and advisories |
| `releases/` | Release material |
| `icp/`, `use_cases/` | Who Neotoma is for, and example uses |

Other folders (`plans/`, `proposals/`, `prototypes/`, `reports/`, `implementation/`) are working material and are not served by the `/docs` route unless internal docs are enabled.

## Limits worth knowing before you rely on the record

- Provenance shows the evidence trail for a value, not that an agent read its source correctly.
- Export writes current state; observation history is not part of the export.
- A later write can override a correction in the current snapshot today ([#2033](https://github.com/markmhendrickson/neotoma/issues/2033)).
- A snapshot can be read as of a past time for one entity (`at` and `at_ingested` on `retrieve_entity_snapshot`); there is no as-of query across the whole record.
- Setup commands exist for five hosts; other hosts are configured by hand. See the [integrations matrix](integrations/matrix.md); the open question is [#2681](https://github.com/markmhendrickson/neotoma/issues/2681).
