---
title: Upgrading
summary: How a Neotoma instance moves to a newer release, how to tell whether it is current, and how to automate the check.
category: operations
audience: operator
visibility: public
order: 25
tags: [upgrade, versions, releases, operations, npm_check_update]
---

# Upgrading

## Scope

This document covers:

- How to determine which version an instance is running
- How to upgrade a self-hosted instance
- What `npm_check_update` does, and why it is not an automatic upgrade
- Why schema currency and server version are separate concerns
- How to automate an update check with a polling service

It does not cover:

- Initial installation (see [install.md](../../install.md))
- Deployment topologies (see [Deployment Modes](deployment.md))
- Release authoring or changelog process (see [Release notes](../subsystems/release_notes.md))

## Invariants

1. Neotoma never upgrades itself. Every version change is an explicit operator action.
2. A running server reports the version of the code it started with, not the version installed on disk. Restart is required for an upgrade to take effect.
3. Schema evolution and server version are independent. Current schemas do not imply a current server.

## Definitions

- **Running version**: the version of the process currently serving requests, reported by `GET /health`.
- **Installed version**: the version present on disk in the global npm package or source checkout.
- **Latest version**: the version published to the npm registry under the `latest` dist-tag.

## Checking the running version

Every instance exposes an unauthenticated health endpoint that reports its version:

```bash
curl -s https://your-instance.example.com/health
```

```json
{ "ok": true, "version": "0.21.0" }
```

For a local instance, use the configured port (`3080` dev, `3180` prod):

```bash
curl -s http://127.0.0.1:3180/health
```

Compare that against the published release:

```bash
npm view neotoma version
```

If the two differ, the instance is behind.

Check the installed package separately from the running process. The two diverge whenever a package was upgraded without a restart:

```bash
npm list -g neotoma
```

## Upgrading an installed instance

Upgrade, apply migrations, restart, then verify. Run all four steps. Skipping migrations or the restart leaves the instance in a mixed state.

```bash
npm install -g neotoma@latest
```

```bash
npm run migrate
```

```bash
neotoma api stop --env prod
```

```bash
neotoma api start --env prod --background
```

Verify the restart took effect:

```bash
curl -s http://127.0.0.1:3180/health
```

The reported version must match the version installed. If it does not, the old process is still running. See [Runbook](runbook.md) for process inspection with `neotoma processes servers`.

Then run the health check:

```bash
npm run doctor
```

This validates environment, database, migrations, storage, and security configuration. See [Health check](health_check.md).

### Instances under a supervisor

When the server runs under `systemd` (see [install.md, Production deployment](../../install.md#production-deployment-headless--systemd)), restart through the supervisor rather than the CLI:

```bash
sudo systemctl restart neotoma-api
```

### Source checkouts

A source checkout tracks git, not npm. Pull, install, migrate, then restart:

```bash
git pull origin main && npm install && npm run migrate
```

## What `npm_check_update` does

`npm_check_update` is an MCP tool that compares a supplied version against the npm registry. It reports; it does not install. No Neotoma component calls it on a schedule, and no component upgrades an instance in response to it.

The tool runs only when an agent chooses to call it. An instance whose agents never call it will never surface an update notice, regardless of how far behind it falls. This is the intended design: upgrades are operator-controlled. It also means the absence of a warning is not evidence that an instance is current.

Request:

```json
{
  "packageName": "neotoma",
  "currentVersion": "0.18.8",
  "include_capability_delta": true
}
```

Response fields of interest:

| Field | Meaning |
|---|---|
| `updateAvailable` | Whether `latestVersion` is newer than `currentVersion` |
| `latestVersion` | Published version, or `null` when the registry is unreachable |
| `suggestedCommand` | The install command to run, or `null` |
| `new_tools` | MCP tools added between the two versions, with `include_capability_delta` |
| `removed_tools` | MCP tools removed in the same range |

Results are cached in memory for 10 minutes per package and tag. On registry failure the tool returns `updateAvailable: false` with `message: "Registry unreachable."`, so a network fault is indistinguishable from being current unless `latestVersion` is checked for `null`.

Pass `include_capability_delta: true` when a session needs to know which tools an upgrade adds or removes. Pass `include_release_notes: true` for human-readable excerpts. Both default to `false`. See [Capability delta](../site/pages/en/capability-delta.md).

To have an agent check at session start, see the update-check rule in [MCP instructions](../developer/mcp/instructions.md).

## Schemas and server version are independent

Schemas evolve as agents write data. An instance accumulates schema changes through normal activity without any version change. This makes a stale instance feel current: entity types are up to date and writes succeed, while the server binary is months behind.

The consequences of a stale server are not visible through schema state. A stale instance lacks MCP tools added in later releases, carries fixed defects, and may disagree with a peer on API contract. Query results from a stale instance are not wrong in the sense of corrupt data, but the tool surface available to produce them is smaller than the current release.

Check the version explicitly. Do not infer currency from working queries or current schemas.

## Automating the check

Neotoma ships no update daemon. Operators who want an unattended check run one externally. The following service polls the registry, compares against the running instance, and logs when they diverge. It notifies only. It does not upgrade, because an unattended upgrade would restart the server and apply migrations without supervision.

```bash
#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${NEOTOMA_HEALTH_URL:-http://127.0.0.1:3180/health}"

running="$(curl -fsS -m 10 "$HEALTH_URL" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("version",""))')"
latest="$(curl -fsS -m 10 https://registry.npmjs.org/neotoma/latest \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("version",""))')"

if [ -z "$running" ] || [ -z "$latest" ]; then
  echo "neotoma update check: version lookup failed" >&2
  exit 1
fi

if [ "$running" != "$latest" ]; then
  echo "neotoma update available: $running -> $latest"
fi
```

Both branches of this script are verified: it reports nothing when the versions match, and prints the upgrade line when they differ. A non-zero exit means the check itself failed, which must be treated as unknown rather than current.

Run it on a timer. With `systemd`, pair a service unit with a timer:

```ini
[Unit]
Description=Neotoma update check

[Service]
Type=oneshot
ExecStart=/usr/local/bin/neotoma-update-check
```

```ini
[Unit]
Description=Daily Neotoma update check

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Daily is sufficient. The registry is the source of truth and releases are not more frequent than that.

On macOS, use a LaunchAgent with `StartInterval` instead. See `developer/launchd_prod_server.md` for the established pattern.

## Examples

Determining whether an instance needs an upgrade:

```bash
curl -s http://127.0.0.1:3180/health   # {"ok":true,"version":"0.18.8"}
npm view neotoma version               # 0.21.0
```

The instance is three minor versions behind. Upgrade with the steps above.

An instance reporting the same version as the registry is current, and no action is required.

## Testing requirements

- `/health` returns `ok` and a `version` string matching `package.json` (`src/actions.ts`).
- `npm_check_update` returns `updateAvailable: false` and `latestVersion: null` when the registry is unreachable. See `tests/integration/mcp_npm_check_update.test.ts`.
- Capability delta fields appear only when `include_capability_delta` is true. See `tests/integration/mcp_npm_check_update_capability_delta.test.ts`.

## Agent instructions

- Report the running version from `GET /health`. Do not infer it from the installed package or from schema state.
- When asked whether an instance is current, check both the running version and the registry. Treat a failed lookup as unknown, not as current.
- Never run an upgrade, migration, or server restart without explicit operator approval. These are irreversible in the sense that they interrupt service and mutate the database.
- When `npm_check_update` reports `updateAvailable`, surface the version delta and `suggestedCommand` to the operator. Do not execute it unprompted.
