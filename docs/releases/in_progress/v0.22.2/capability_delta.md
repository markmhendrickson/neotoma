# Capability delta — MCP session instruction injection (#2054)

## Added

**`serverInfo._neotoma.instruction_entities`** on the authenticated MCP `initialize` response. An array of the instance's durable agent instructions, each item `{ entity_id, entity_type, title, text, scope? }`. This is the canonical key going forward.

Previously the session payload carried only `standing_rule` entities, because the loader was hardcoded to that one type. Instruction-bearing content had since accumulated under `agent_policy` — entities that were active, in some cases marked mandatory, and never reached a session unless a human hand-copied them into a harness instruction file. That manual mirror is what this closes.

**Three new environment variables**, additive, with defaults that preserve prior behavior for `standing_rule`:

| Variable | Default | Effect |
|---|---|---|
| `NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES` | `standing_rule,agent_policy` | Which entity types inject. Empty string disables injection entirely. |
| `NEOTOMA_MCP_INSTRUCTION_SCOPES` | `global,swarm` | Which `scope` values are in scope. Unioned with a `domain` match against the session's agent identity. |
| `NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES` | `50` | Cap on injected entities. Sort happens first; drops are logged by id. |

Surfaced on `config.mcp.*`. Adding a further type (e.g. `conformance_policy`, supported but off by default) needs one registry entry, not a new code path.

## Deprecated

**`serverInfo._neotoma.standing_rules`** is now an alias. It carries the same entities reshaped to the legacy `{ entity_id, title, rule_text, scope?, priority }` item shape, so a consumer reading `rule_text` keeps working — including for `agent_policy`-derived items, whose `priority` is synthesized from the shared rank scale.

**Dual-emit lasts one minor release.** The alias is removed at the following minor. The MCP `initialize` response is a public surface and hosted instances may run older harness code, so consumers cannot be fully enumerated; the cost of the alias is a few dozen bytes and the benefit is a clean cutover. Consumers should migrate to `instruction_entities` now.

## Not a breaking change this release

No schema or migration changes. No existing field is renamed, removed, or retyped. Under default configuration, `standing_rule` injection behaves as before — with one deliberate widening noted below.

## Behavioral notes

- **Wider `standing_rule` field mapping.** The loader now reads instruction text from `rule_text`, then `instruction`, then `content`, then `rule`, and treats `status` values of `inactive` / `disabled` / `archived` as inactive alongside `enabled: false`. Live snapshots commonly carry `instruction`/`content` with `status: active` and no `rule_text` at all; a loader reading only `rule_text` dropped every such row silently. This widening is why "defaults unchanged" does not mean "defaults still miss those rows".
- **Row-shape rejections are now logged.** A row carrying no instruction text in any mapped field is reported under `[instruction_entities]` with its id. Previously this was the one drop path with no logging and no effect on `lookup_failed`, which made a field-name mismatch indistinguishable from an empty instance.
- **`standing_rule` is not scope-filtered.** Its `scope` has always been a free-form label the loader never filtered on; subjecting it to `{global, swarm}` would silently stop injecting narrowly-scoped rules on existing instances. Scope filtering applies to `agent_policy`, where `domain`-scoped entries are per-agent noise elsewhere.
- **Logging discipline.** All diagnostics use the `[instruction_entities]` prefix and carry ids, counts and env-var names only — never instruction text.
