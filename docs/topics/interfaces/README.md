# Interfaces

MCP, the CLI, and the REST API expose the same Neotoma record to different kinds of clients.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Choose by client

| Client | Start with | Why |
| --- | --- | --- |
| An AI host with MCP support | [MCP](https://neotoma.io/mcp/) | The host can call Neotoma tools after its server connection is configured. |
| A terminal workflow | [CLI](https://neotoma.io/cli/) | Commands let a person or script inspect and manage the local instance. |
| An application or service | [REST API](https://neotoma.io/rest-api/) | HTTP clients use the documented request and response contract. |

The [integration matrix](https://neotoma.io/integrations/) records the current host paths. A host having an MCP client does not by itself mean Neotoma's setup command writes that host's configuration. Use the [install chooser](https://neotoma.io/install/) to distinguish supported setup commands, native plugins, and manual configuration.

## Common tasks

- [Find and read a record](read-search.md) starts with an ID, identifier, or type and checks an empty result.
- [Store and correct a record](store-correct.md) checks declared fields and reads the resulting value back.
- [Inspect a change](../architecture/history.md) compares the current field with its observations.

## One record, several entrances

The interface changes how a request reaches Neotoma; it does not turn each tool into a separate store of truth. After a write, retrieve the entity and check the field you intended to change. A success response alone does not prove the resulting value is present.

For the underlying model, continue to [How the record works](https://neotoma.io/architecture/).
