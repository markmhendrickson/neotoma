# Start here

Neotoma gives agents a shared record of changing facts, with a way to inspect the evidence behind the current value.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## What it is for

An agent can write an observation, retrieve the resulting entity, and follow that value back to its source. A correction adds new evidence about what should be current; the earlier observation remains available for inspection. The same record is exposed through MCP, the CLI, and the HTTP API.

Neotoma is the system of record for **agent-held state**. It does not replace an application's own business database, and it does not decide what an agent should do next. [How the record works](https://neotoma.io/architecture/) explains that boundary.

## Decide whether it fits

It is useful when multiple agents or tools need to share facts that change, or when a current answer needs a visible source. A single agent working in one narrow domain may not need a separate record. Start with one concrete workflow and check whether the current value and its provenance are both retrievable.

## Next steps

1. [Choose an installation path](https://neotoma.io/install/) for the tool you actually use.
2. [Choose an interface](https://neotoma.io/interfaces/) for that tool or application.
3. Read the [full repository overview](../../README.md) for scope and development context.

The agent-facing [installation protocol](../../install.md) includes evaluation, installation, activation, and tooling configuration. It is a longer operational reference, rather than a substitute for the human install chooser.
