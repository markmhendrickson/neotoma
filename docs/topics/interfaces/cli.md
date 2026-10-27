# CLI

The Neotoma CLI is a terminal entrance to the same record exposed through MCP and HTTP.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Start with a read

After [installation](https://neotoma.io/install/), check the selected instance before changing anything:

```bash
neotoma status --json
neotoma schemas list
neotoma entities list --limit 5
```

`status` helps establish which local setup is active. The schema list tells you which entity types and fields the instance accepts; an entity list tells you whether that instance contains the record you expected. An empty list is not proof that no record exists elsewhere. If you expected a known entity, retrieve it by its ID or identifier and check that the response is from the intended profile.

## Choose a command family

| Goal                   | Start with                                                                                                     | Follow-up                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Find an entity         | `entities list` or `entities search`                                                                           | `entities get` for the exact ID           |
| Inspect evidence       | `observations list` for recorded claims; `sources get` for source metadata; `sources content` for source bytes | Compare the current entity fields         |
| Write structured facts | `store`                                                                                                        | Retrieve each returned entity and field   |
| Preserve a copy        | `entities export` or `backup create`                                                                           | Check export scope or run `backup verify` |

Use [Find and read a record](https://neotoma.io/read-search/) for the search sequence and [Store and correct a record](https://neotoma.io/store-correct/) for the write sequence. Commands that affect a local database or runtime require the same care as API calls: choose the environment and user scope first. A command returning successfully is a transport result; the read-back establishes the record's resulting value.

## Go to the full reference

The [CLI reference](../../developer/cli_reference.md) holds flags, environment precedence, server operations, and commands outside the normal reader workflow. It describes the installed command contract; check the running version before using a flag. For a direct OpenAPI call through the CLI, see its `request --operation` section. This overview is a starting path, not a substitute for the detailed contract.
