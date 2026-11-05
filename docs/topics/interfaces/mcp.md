# MCP

Neotoma exposes tools through Model Context Protocol so a configured AI host can read and write the same record.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Connection before use

The host must be connected to the intended Neotoma instance. Local stdio and remote HTTP are different connection paths with different runtime and authentication requirements. A tool appearing in the host's list confirms registration, but the useful check is a read-only retrieval from the intended instance.

With local stdio, the host starts the Neotoma MCP process on the machine where its configuration points. The local binary and initialized data location must be available in that process's environment. This path does not by itself start a persistent HTTP API service. With remote HTTP, the host connects to a reachable server endpoint; the endpoint and its authentication must correspond to the record the user intended. A local setup command and a remote connector entry are therefore different instructions.

The [install chooser](https://neotoma.io/install/) identifies which hosts have a supported setup command, which use a plugin, and which need manual configuration. The [integration matrix](https://neotoma.io/integrations/) gives the current host inventory.

## What a tool call means

MCP is an interface to Neotoma's record, not a separate memory per agent. Store or correct an observation through the documented action, then retrieve the entity and inspect its current field and provenance. Keep the distinction between an empty query result and a query against the wrong instance or field.

An agent writing through MCP can be attributed to a reported client name or a verified signing identity, depending on the connection and credentials. Those are different levels of evidence. Inspect the recorded attribution rather than assuming that a tool name proves who made the write. Permissions likewise depend on the active grant and instance policy, not on the fact that a host exposes the tool.

## Verify the path you selected

First confirm the intended host lists the Neotoma tools. Then make a read-only call that should return a known entity or an expected instance-level response. If that fails, inspect the host's actual MCP configuration, local binary path or remote URL, and authentication state. Do not interpret an empty data result as success until a known-positive query works.

If you are about to store a fact, inspect the entity schema and use the documented action shape for that surface. Afterward retrieve the entity and check the exact field. This establishes the effect that matters to the user, rather than only that a transport accepted a request.

For tool names, parameters, transport details, and examples, use the [full MCP reference](../../developer/mcp_overview.md). For the complete boundary between observations, entities, and snapshots, read [How the record works](https://neotoma.io/architecture/).
