---
title: Embedded (in-process) configuration
summary: Use Neotoma inside a host application with explicit configuration, no env files and no server.
---

# Embedded (in-process) configuration

The CLI and the server resolve configuration from a project `.env` file, a
user-level env file and the process environment. A host application that embeds
Neotoma should not depend on any of those. The embedded entry point takes the
configuration in code.

```ts
import { createEmbeddedNeotoma } from "neotoma/embedded";

const neotoma = await createEmbeddedNeotoma({
  dataDir: "/srv/my-app/neotoma-data", // required, absolute
  environment: "development", // optional, default "development"
});

const ops = neotoma.createOperations({ userId: "host-user-id" });
await ops.store({ entities: [{ entity_type: "note", title: "hello" }] });
```

## What the embedded path guarantees

- Reads no env file: not the project `.env*` files, not the user-level env
  file, not the user-level CLI config file.
- Needs no running server or daemon. Operations run in-process.
- Does not write to the host process environment.
- Does not read the host process environment unless you ask. Name the
  variables you want in `allowProcessEnv`; explicit options and `env` always
  win over them.
- Reads no tunnel-discovery files.
- Makes no network request unless you configure an adapter. Embeddings are off
  unless you pass `openaiApiKey`; without it, embedding calls report
  `embedding_not_configured`.

## Options

| Option                                                   | Meaning                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dataDir`                                                | Absolute data directory (required). Database, raw sources and logs default to paths under it.                       |
| `environment`                                            | `"development"` (default) or `"production"`. Selects default file names such as `neotoma.db` and `neotoma.prod.db`. |
| `projectRoot`                                            | Absolute package root used to find bundled docs. Defaults to the installed package location.                        |
| `sqlitePath`, `rawStorageDir`, `logsDir`, `eventLogPath` | Optional absolute overrides for individual locations.                                                               |
| `openaiApiKey`                                           | Optional embeddings adapter.                                                                                        |
| `env`                                                    | Other explicit settings by their usual names, for example `NEOTOMA_ENCRYPTION_ENABLED`.                             |
| `allowProcessEnv`                                        | Host variable names to read. Empty by default.                                                                      |

Invalid options throw an `EmbeddedConfigError` with `code: "invalid_option"`.

## Ordering

Embedded mode must be established before any other Neotoma module is loaded in
the process. If the standard configuration has already loaded, or a second
call asks for a different data directory, `createEmbeddedNeotoma` throws an
`EmbeddedConfigError` with `code: "config_already_loaded"`. Call it first and
import the rest of Neotoma afterwards.

## Not yet covered

This first slice routes the central runtime configuration (`src/config.ts`)
and database initialization. A few optional features still read the process
environment directly (for example mirroring, overflow sinks and some tuning
knobs) and are not switched on by the embedded path. Lazy loading of further
optional adapters, with structured errors when one is unavailable, is a
follow-up.

The CLI and server startup are unchanged; see the CLI reference for the
file-based path.
