---
path: /capability-delta
locale: en
page_title: Capability delta
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 31
---

When you upgrade a Neotoma instance, new MCP tools may be added and old ones removed. `npm_check_update` with `include_capability_delta: true` returns a machine-readable diff of those changes — so an agent can enumerate newly available tools in the same call it uses to check for updates, without reading release notes.

## How it works

Pass `include_capability_delta: true` to `npm_check_update`. When an update is available, the response gains three additional fields:

| Field | Type | Description |
|---|---|---|
| `new_tools` | string[] | MCP tool names added between `currentVersion` and the latest release |
| `removed_tools` | string[] | MCP tool names removed in the same range |
| `capability_delta_recommendation` | string | One-line human-readable guidance ("upgrade then extend your integration to use: …") |
| `capability_delta_note` | string? | Present **only** when the delta is degraded — e.g. unparseable versions or a missing manifest |

The delta is sourced from a committed `src/shared/capability_manifest.json`, generated automatically by `scripts/generate-capability-manifest.ts` from versioned release tags. It is not hand-maintained.

## Example call

```json
{
  "packageName": "neotoma",
  "currentVersion": "0.16.2",
  "include_capability_delta": true
}
```

Example response when `0.17.0` is the latest:

```json
{
  "updateAvailable": true,
  "message": "0.17.0 is available (you have 0.16.2)",
  "suggestedCommand": "npm install -g neotoma@0.17.0",
  "new_tools": [
    "identify_entity_by_signals"
  ],
  "removed_tools": [],
  "capability_delta_recommendation": "Upgrade from 0.16.2 to 0.17.0, then extend your integration to use: identify_entity_by_signals"
}
```

## Why agents use it

An auto-upgrading agent can complete its post-upgrade integration check in one call:

1. Call `npm_check_update` with `include_capability_delta: true` at session start.
2. If `updateAvailable` is true, prompt the operator to upgrade (or trigger auto-upgrade if configured).
3. Read `new_tools` to decide whether to re-initialize its tool list or surface new capabilities to the user.
4. Read `removed_tools` to detect breakage — if a tool your integration depends on is gone, raise a warning before the next write.

Without `include_capability_delta`, an agent would need to parse release notes, diff tool lists across versions, or call `initialize` against two instances — each fragile. The delta field makes this robust and single-call.

## When `capability_delta_note` appears

`capability_delta_note` is present only on degraded responses:

- The `currentVersion` string could not be parsed as a semver.
- The capability manifest is missing or malformed on the server.
- The version range spans a gap in the manifest (e.g. pre-release versions with no tagged manifest entry).

When `capability_delta_note` is present, `new_tools` and `removed_tools` default to empty arrays and `capability_delta_recommendation` is a generic upgrade prompt. Treat a present `capability_delta_note` as a signal to re-validate after upgrading.

## Combining with release notes

`include_release_notes: true` can be combined with `include_capability_delta: true` in the same call. Release notes add `release_url` and human-readable excerpts; the capability delta adds the machine-readable tool diff. Both are opt-in and default to `false`.

Shipped in v0.17.0 (PRs #1605, #1693, #1694). See the [changelog](/changelog) for release notes, and [identity resolver](/identify-entity-by-signals) for the new tool that appears in `new_tools` for this release.
