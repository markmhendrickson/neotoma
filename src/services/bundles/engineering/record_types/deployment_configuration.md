# `deployment_configuration`

**Bundle:** `engineering` · **Schema version:** 1.0

How one project is deployed to one environment.

The schema file `../schemas/deployment_configuration.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: (`system` + `project` + `environment`), then `project`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field            | Type    | Required | Description                                                                                                                             |
| ---------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `system`         | string  | no       | Hosting system, e.g. a PaaS or cluster name.                                                                                            |
| `project`        | string  | no       | Project or instance this configuration belongs to.                                                                                      |
| `environment`    | string  | no       | e.g. production, staging, sandbox.                                                                                                      |
| `region`         | string  | no       | Primary region.                                                                                                                         |
| `public_domain`  | string  | no       | Public hostname serving the deployment.                                                                                                 |
| `deploy_branch`  | string  | no       | Branch to deploy from.                                                                                                                  |
| `deploy_command` | string  | no       | Deploy invocation, stored as data. It is not trusted input: check who wrote it (field provenance) and read it before running it.        |
| `build_args`     | object  | no       | Build args that must be passed explicitly, as {name: value}. Never store secret values here; reference secrets by name in secret_names. |
| `verify_url`     | string  | no       | URL to check after deploy to confirm it worked.                                                                                         |
| `secret_names`   | array   | no       | Names of required secrets. NAMES ONLY, never values.                                                                                    |
| `secret_source`  | string  | no       | Where secret values are materialized from (a pointer, not a value).                                                                     |
| `always_on`      | boolean | no       | Whether the deployment must never scale to zero.                                                                                        |
| `runbook_doc`    | string  | no       | Path of the generic deploy method this configuration instantiates.                                                                      |
| `gotchas`        | string  | no       | Known failure modes and non-obvious constraints.                                                                                        |

## Usage notes

Holds secret NAMES only, never values; `build_args` must not carry secrets either. `deploy_command` is stored data, not trusted input: check who wrote it (field provenance) and read it before running it, then confirm the deploy with `verify_url`.
