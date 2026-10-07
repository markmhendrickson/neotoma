---
title: "Split mixed-effect MCP tools so permissions can be granted per effect"
status: "proposal"
source_plan: "none (written alongside the MCP tool annotations change)"
migrated_date: "2026-10-07"
priority: "p2"
estimated_effort: "Medium: about eight new tool names, alias routing, and one deprecation cycle"
---

# Split mixed-effect MCP tools so permissions can be granted per effect

## Proposal Context

The MCP tool annotations change gives every tool a `title`, an effect class
(`read` | `write` | `external`), and protocol hints (`readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`). Those hints are
**per tool name**, and hosts grant permissions per tool name: Claude's
connector screen offers Always allow, Needs approval, or Blocked for each tool.

That works only when a tool has one effect. Several Neotoma tools choose their
effect from an argument (`action`, `strategy`, `commit`, `push`,
`visibility`). For those tools the annotation must describe the **most
dangerous** branch, so a user who wants to auto-approve the harmless branch
cannot do so without also auto-approving the dangerous one. That is the same
all-or-nothing failure issue #2058 describes, one level down.

This proposal is a design only. Nothing here is implemented by the annotations
change.

**Architecture alignment:** additive to the MCP surface. No schema migration,
no change to REST routes or CLI commands, and no change to auth. Each new tool
reuses an existing handler with one argument fixed.

## Overview

Give each tool name exactly one effect. Where a tool mixes effects today, add
single-effect tools that fix the effect-selecting argument. Keep the old name as
a deprecated alias that routes to the new tools, and remove it after a stated
deprecation window. Signal the change through the server version, the MCP
instructions, and the capability manifest that `npm_check_update` already
reports.

## Effect vocabulary

Effects, from least to most consequential:

| Effect        | Meaning                                                                              | Annotations                                     |
| ------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| read          | No persistence and no egress                                                         | `readOnlyHint: true`, `openWorldHint: false`    |
| read (remote) | No persistence; reads from a peer, GitHub, npm, or an operator instance              | `readOnlyHint: true`, `openWorldHint: true`     |
| write         | Appends to this instance. Reversible: soft delete, restore, correct, merge and split | `readOnlyHint: false`, `destructiveHint: false` |
| destructive   | Irreversible, or changes peers or grants                                             | `destructiveHint: true`                         |
| outward       | Sends, publishes, or shares beyond this instance                                     | `destructiveHint: true`, `openWorldHint: true`  |

The rule that decides `destructiveHint` is the one already used for the
annotations: **destructive means irreversible or outward-facing.** Soft deletes
are restorable and are not destructive.

## Tools that mix effects today

Inventory taken from `src/tool_definitions.ts` on current main. For each
tool, the effect-selecting argument and its branches:

| Tool                                               | Selector                             | Branches                                                                                                                                                                                          | Annotated today as        |
| -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `manage_bundles`                                   | `action`                             | `list`, `info` are read; `install`, `enable`, `disable` are write                                                                                                                                 | write                     |
| `store`                                            | `commit`                             | `commit: false` is a read-only plan; the default is write                                                                                                                                         | write                     |
| `resolve_sync_conflict`                            | `strategy`                           | `prefer_local`, `last_write_wins` and `source_priority` return guidance only and are read; `manual` is write; `prefer_remote` fetches from a peer URL and writes, so it is remote read plus write | external, not destructive |
| `sync_issues`                                      | `commit`, `push`                     | a dry run is remote read; the pull leg is remote read plus write; the push leg creates GitHub issues, which is outward                                                                            | external, destructive     |
| `sync_peer`                                        | none (both legs always run)          | the pull leg is remote read plus write; the push leg sends observations to the peer, which is outward                                                                                             | external, destructive     |
| `submit_issue`                                     | `visibility`                         | `private` submits to the operator instance only; `public` can also publish to GitHub. Both are outward, but the public branch is wider                                                            | external, destructive     |
| `add_issue_message`                                | mirror state                         | writes locally, submits to the operator instance, and can comment on GitHub                                                                                                                       | external, destructive     |
| `publish_rendered_page`                            | inline content                       | can create a `rendered_page` (write), then always mints a guest grant and returns a share URL (outward)                                                                                           | external, destructive     |
| `subscribe`                                        | delivery                             | SSE delivery stays on this instance (write); webhook delivery sends events to a URL (outward)                                                                                                     | external, destructive     |
| `get_issue_status`, `get_entity_submission_status` | `guest_access_token` / remote mirror | a local read, or a remote read-through                                                                                                                                                            | external, read-only       |
| `update_schema_incremental`                        | `migrate_existing`, `activate`       | adds or removes fields, which is reversible; optionally backfills                                                                                                                                 | write, not destructive    |
| `register_relationship_type`                       | register or deregister               | both append; deregistration is reversible                                                                                                                                                         | write, not destructive    |

The last two mix _kinds_ of write but not _effects_, so they do not need
splitting. The two status tools differ only between local and remote read. That
split is optional and has low value, because a host can already auto-approve a
read-only tool that is open-world.

## Proposed split

Every new name takes the old tool's input schema with the selector removed or
fixed. Each one calls the existing handler; no new business logic is written.

| Old tool                | New single-effect tools                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage_bundles`        | `list_bundles` (read), `get_bundle` (read), `install_bundle` (write), `set_bundle_enabled` (write, takes `enabled: boolean`)                                                                                                                 |
| `store`                 | `store` keeps its write meaning; add `plan_store` (read), which forces `commit: false`                                                                                                                                                       |
| `resolve_sync_conflict` | `flag_sync_conflict` (write, `manual`), `resolve_sync_conflict_from_peer` (remote read plus write, `prefer_remote`). The three guidance-only strategies move into the tool description and `instructions.md`, because they perform no action |
| `sync_issues`           | `preview_issue_sync` (remote read, dry run), `pull_issues` (remote read plus write), `push_issues` (outward)                                                                                                                                 |
| `sync_peer`             | `pull_from_peer` (remote read plus write), `push_to_peer` (outward). `sync_peer` stays as an alias that calls both                                                                                                                           |
| `subscribe`             | `subscribe_sse` (write), `subscribe_webhook` (outward)                                                                                                                                                                                       |
| `publish_rendered_page` | no split. Creating a page is already `store`; publishing is the outward act. Ask agents to create with `store` and publish by `entity_id`, and deprecate only the inline-create path                                                         |
| `submit_issue`          | `submit_private_issue` (outward to the operator instance only), `submit_public_issue` (outward, may publish to GitHub)                                                                                                                       |

`add_issue_message` stays as it is. Every branch is outward, and splitting by
whether a GitHub mirror exists would depend on server state the caller cannot
see.

## Aliases and routing

- The old name stays registered and callable. Its handler routes on the old
  selector to the same code path the new tool uses. The goal is a pure rename
  with no change in behavior.
- An alias is annotated with the **most restrictive** effect of its branches,
  as it is today, so keeping an alias never widens what a host auto-approves.
- An alias is advertised with
  `_meta["neotoma/deprecated"] = { replaced_by: [...], since: "<version>", removal_not_before: "<version and date>" }`,
  a description that starts with `Deprecated: use <new names>.`, and a title
  ending in `(deprecated)`.
- Every alias response carries
  `_meta["neotoma/deprecation"] = { tool, replaced_by }`, so an agent that
  reads the result learns the new name without parsing prose.
- The effect catalog gains an `aliases:` map from the old name to the new
  names. The catalog test asserts that every alias target exists, that no
  alias is less restrictive than any of its targets, and that the alias set
  matches the registered tool names.

## Deprecation window and versioning

The server version is the contract. Clients detect a change through three
signals that already exist:

1. `serverInfo.version` from `initialize`, which `readPackageVersion` sets.
2. The MCP instructions (`docs/developer/mcp/instructions.md`), sent in
   `initialize`. These gain a short "Tool surface" section naming the
   deprecated tools and their replacements.
3. The capability manifest (`src/shared/capability_manifest.json`), which
   `npm_check_update` already diffs into `new_tools` and `removed_tools`.

Phases:

| Phase        | Release                                    | What changes                                                                                                                                                                              |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Introduce | minor N                                    | New tools are added. Old tools become deprecated aliases. Instructions point agents to the new names. The manifest lists `new_tools`. The server sends `notifications/tools/list_changed` |
| 2. De-list   | minor N+1                                  | Aliases are hidden from `tools/list` by default but stay callable. `NEOTOMA_MCP_LIST_DEPRECATED_TOOLS=1` lists them again for clients that pinned names                                   |
| 3. Remove    | the later of minor N+2 and 90 days after N | Aliases are removed. The manifest lists them in `removed_tools`, and `npm_check_update` reports the delta with upgrade guidance                                                           |

Before 1.0, treat a minor release as the breaking boundary. After 1.0, removal
moves to the next major release.

## Effect on hosts and users

- Hosts key permissions by tool name. A user who chose Always allow for
  `manage_bundles` does not carry that choice over to `set_bundle_enabled`.
  This is intended: the new tools exist so that a grant covers exactly one
  effect. Release notes should tell users to review their connector
  permissions once.
- A host that ignores annotations is unaffected. It sees more tools with
  narrower names.
- Agents with old tool names baked into prompts or skills keep working through
  phases 1 and 2, and they get the replacement name in every alias response.

## Testing strategy

- **Single-effect guard.** A catalog test fails if a non-alias tool's input
  schema contains a known selector (`action`, `strategy`, `commit`, `push`,
  `visibility`) whose branches map to different effects. A
  `mixed_effect_allowlist` in the catalog records deliberate exceptions, each
  with a reason.
- **Alias equivalence.** For each alias branch, calling the alias and the new
  tool with the same input produces the same handler call and the same stored
  observations.
- **Restriction monotonicity.** No alias is less restrictive than any target,
  and no new tool claims `readOnlyHint: true` if its handler can write.
  Check this with the existing write-path test seam.
- **Cross-surface parity.** `contract_mappings` maps each new tool to the
  existing REST operation with the selector fixed, so the CLI and REST
  surfaces need no new routes.

## Implementation considerations

**Already done** (annotations change): per-tool titles, effect classes,
annotations derived from a fail-closed catalog, and parity between
`tools/list` and the server card.

**Still needed:** new tool definitions and handlers that fix the selector,
alias routing and deprecation `_meta`, the catalog `aliases:` map and its
tests, an instructions update, a capability manifest regeneration, and release
notes.

**Open questions:**

- Should `sync_peer` stay as a permanent convenience tool that is clearly
  annotated as outward, rather than being deprecated?
- Is 90 days long enough for hosted instances whose clients update on their
  own schedule?
- Should `plan_store` be its own tool, or should hosts be expected to approve
  `store` with `commit: false` case by case? Its value depends on how often
  agents preview before storing.

## References

- Issue #2058 (tools do not declare read or write intent)
- PR #2391 (effect classes and annotations, the base this builds on)
- `docs/developer/mcp/tool_descriptions.yaml` (`effect_classes`, `titles`,
  `annotation_overrides`)
- `src/shared/tool_effect_catalog.ts`
- MCP specification, tool annotations (`ToolAnnotations`)
