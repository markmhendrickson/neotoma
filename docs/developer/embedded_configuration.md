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
// Call createEmbeddedNeotoma BEFORE anything else imports a Neotoma module.
// Configuration is read once, when the first Neotoma module loads.
import { createEmbeddedNeotoma } from "neotoma/embedded";

const neotoma = await createEmbeddedNeotoma({
  dataDir: "/srv/my-app/neotoma-data", // required, absolute
  environment: "development", // optional, default "development"
});

const ops = neotoma.createOperations({ userId: "host-user-id" });
await ops.store({ entities: [{ entity_type: "note", title: "hello" }] });
```

## What the embedded path guarantees

Each statement below is covered by a test in `tests/unit/embedded_config.test.ts`,
`tests/unit/embedded_env_routing.test.ts`, `tests/unit/embedded_issues_client.test.ts`
or `tests/unit/embedded_standard_pins.test.ts`. The exceptions that apply to a
statement are listed next to it.

- **No env file is read.** Not the project `.env*` files, not the user-level env
  file, not the user-level CLI config file, and no tunnel-discovery file.
  _Exception:_ none known on the embedded operations path.
- **The host process environment is not written.** _Exception:_ none known.
- **The host process environment is not read unless you name a variable in
  `allowProcessEnv`.** Every runtime setting in the code that embedded
  operations run through is read from the explicit configuration instead:
  `config.ts`, plus the attribution policy, entity-type guards, tenant and
  sandbox scoping, schema mode, guest access-policy overrides
  (`NEOTOMA_ACCESS_POLICY_*`), the logger switches, mirroring, overflow sinks,
  the API client used by the issue tools and the remaining tuning variables. A
  value in `env` takes effect, a host value takes effect only when named in
  `allowProcessEnv`, and `env` wins when both are given. A test fails if a new
  direct read of the process environment, an alias of it, or a home-directory
  lookup is added to that code, or if that code imports a CLI-only module.
  _Exceptions:_ the CLI, the stdio proxy, the OpenClaw entry point, the
  WebSocket bridge, the dev shim, the `neotoma/aauth` SDK helper and the
  maintenance migration tool still read the process environment; they are
  separate programs and are not part of the embedded operations. Two reviewed
  sites read it on purpose: a test-only barrier inside worker-thread source
  (which cannot import), and the start of the local API child process, which
  embedded mode refuses to start. Child processes started by the embedded code
  are given the explicit configuration rather than the host environment, except
  that the sandbox seeder child gets a minimal fixed `PATH`
  (`/usr/local/bin:/usr/bin:/bin`) when neither `env` nor `allowProcessEnv`
  provides one, so it can still find `node`. The tests cover that environment,
  not the spawn itself.
- **No home-directory file is read.** The small state files that Neotoma keeps
  beside a user's CLI configuration (the access-policy and issues settings in
  `config.json`, the mirror settings, and `bundle_state.json`) are read from and
  written to `dataDir` instead. A conflicting file under a home directory is
  ignored, and the `gh` command-line tool and its stored credentials are not
  consulted: provide a GitHub token through `env`
  (`NEOTOMA_ISSUES_GITHUB_TOKEN`) if you use the issue tools. The key pair that
  the CLI keeps under the home directory for request signing is not read
  either: embedded mode signs no request and starts no local transport.
  _Exception:_ if you name `HOME` (or `USERPROFILE`) in `allowProcessEnv`, those
  state files are read from and written to that home directory, as in standard
  mode. The signing key pair is still not read.
- **Issue tools act only on what you configure.** `submit_issue`,
  `add_issue_message` and the thread read-through use no built-in remote target.
  Name a target with `NEOTOMA_ISSUES_TARGET_URL` in `env`, or a GitHub token with
  `NEOTOMA_ISSUES_GITHUB_TOKEN`. With neither, `submit_issue` and
  `add_issue_message` refuse with `embedded_issues_not_configured`, the read
  calls return nothing, and no request is made. With a target, requests go to
  that target only, unsigned (as an anonymous guest); the host user's CLI key
  pair, its `config.json` and the host `NEOTOMA_AAUTH_*` and
  `NEOTOMA_CLI_AAUTH_*` variables are not consulted. AAuth-signed peer sync
  deliveries are refused for the same reason (shared-secret peers are
  unaffected).
  _Exception:_ a signed identity for issue submission is not available in
  embedded mode. This is a limit of this first slice, not a setting.
- **No server or daemon is needed.** Operations run in-process.
- **No network request is made on the default store, retrieve and embedding
  paths.** The tests watch `fetch`, `http.request` and `https.request` while
  storing without an adapter, and check that embedding calls report
  `embedding_not_configured` when `openaiApiKey` is absent. The issue tools
  above are watched the same way: no request without a named target.
  _Exception:_ this is not a guarantee about every tool. Tools reachable through
  `executeTool` that exist to contact another system (GitHub issue sync, peer
  sync with shared-secret peers, webhooks, mirror pushes) make requests when you
  configure and call them; the tests do not cover those.

## Options

| Option                                                   | Meaning                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dataDir`                                                | Absolute data directory (required). Database, raw sources and logs default to paths under it.                       |
| `environment`                                            | `"development"` (default) or `"production"`. Selects default file names such as `neotoma.db` and `neotoma.prod.db`. |
| `projectRoot`                                            | Absolute package root used to find bundled docs. Defaults to the installed package location.                        |
| `sqlitePath`, `rawStorageDir`, `logsDir`, `eventLogPath` | Optional absolute overrides for individual locations.                                                               |
| `openaiApiKey`                                           | Optional embeddings adapter, a string.                                                                              |
| `env`                                                    | Other explicit settings by their usual names, as string values, for example `NEOTOMA_ENCRYPTION_ENABLED`.           |
| `allowProcessEnv`                                        | Array of host variable names to read. Names may not have leading or trailing whitespace. Empty by default.          |

Invalid options throw an `EmbeddedConfigError` with `code: "invalid_option"`:
a missing or relative path, an unknown `environment`, an `allowProcessEnv` that
is not an array of names (each non-empty, with no leading or trailing
whitespace), an `env` that is not an object of string values, or an
`openaiApiKey` that is not a string. The message names the first offending
`allowProcessEnv` index or `env` key, never a value.

## Ordering

Embedded mode must be established before any other Neotoma module is loaded in
the process. If the standard configuration has already loaded,
`createEmbeddedNeotoma` throws an `EmbeddedConfigError` with
`code: "config_already_loaded"`. Call it first and import the rest of Neotoma
afterwards.

## Calling it more than once

Calling `createEmbeddedNeotoma` again with the same options returns the same
instance. Any difference in the resolved options (data directory, environment,
path overrides, `env`, `openaiApiKey`, or the names in `allowProcessEnv`)
throws `config_already_loaded`: the configuration is read once per process and
cannot change.

If the first call fails after the configuration loaded (for example the data
directory cannot be created), retry with the same options after fixing the
cause. A retry with a different data directory throws `config_already_loaded`
rather than reporting the first call's locations; restart the process to use a
different configuration.

## Shutting down

There is no separate server to stop. `ops.dispose()` is the lifecycle hook for
an operations handle; today it releases nothing beyond the handle itself, and
handles from `createOperations` need no other cleanup. The SQLite connection
belongs to the process and closes when it exits. A host that needs to release
the data directory earlier should end the process (or worker) that embedded
Neotoma.

## Not yet covered

- Lazy loading of optional adapters with a structured "unavailable" error is
  done for embeddings only. Other adapters are not yet loaded lazily.
- Signed issue submission (a host-supplied key location) is not offered in
  embedded mode.
- The source scan finds direct process-environment reads, aliases of the process
  object, home-directory lookups and imports of CLI-only modules from code that
  embedded operations reach, and it limits reviewed opt-out markers to a fixed
  list of sites. It scans source files and does not observe every setting at run
  time. The run-time tests cover the attribution policy, entity-type guards,
  tenant and sandbox scoping, schema mode, access-policy overrides, the logger
  switch and the issue tools.
- The CLI and server startup are unchanged. For the file-based path see the
  [CLI reference](cli_reference.md#configuration-and-storage-paths) and the
  [environment variable documentation](environment/README.md).
