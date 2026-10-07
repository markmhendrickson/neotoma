---
title: "Target-instance check: stable instance identity, asserted targets, and write admission"
status: "proposal"
source_plan: "none (design written directly as a proposal)"
migrated_date: "2026-10-07"
priority: "p1"
estimated_effort: "Medium: one identity record, one admission choke point per transport, surface parity, docs"
---

# Target-instance check

Design only. No implementation in this change.

## Problem

Every Neotoma server advertises the same `serverInfo.name` (`"neotoma"`). A client
connected to several instances sees only opaque connector ids, so the agent decides
"which Neotoma" on its own and sometimes writes to the wrong one. Nothing in a request
lets the client state which instance it meant, so the only check that exists is
client-side, and it is a guess.

Two failure classes follow, and they need different defences:

1. **Misroute.** The configuration names instance A; the transport actually reaches
   instance B. Every call returns `success: true`. This is #2462: a session configured
   for a hosted instance served a local database for a whole day.
2. **Misselection.** The client is connected to A and B correctly; the agent picks the
   wrong connector for a given write. This is the failure #2381 anticipates: two
   instances that both present as `neotoma`.

Motivating case, stated generically: a team runs several Neotoma instances, one of
which holds confidential finance data. Writes of that data must never land on any
other instance, and writes meant for other instances must never land on it. Today the
only barrier is the agent's judgement.

## Prior art this design builds on

- **#2381** specifies an optional, operator-configured display label
  (`NEOTOMA_INSTANCE_TITLE`, surfaced as `serverInfo.title`). It deliberately rules
  that the label is not authorization and must never be a write-destination selector.
  This design keeps that ruling: the title is for humans; the check keys on a separate
  stable id.
- **#2462** asks for an additive `instance` object on `GET /session` and
  `get_session_identity`. This design defines what that object carries.
- **Instance policy** (`src/services/instance_policy.ts`) establishes the admission
  pattern reused here: instance-wide scope, whole-request reject with `0 persisted`,
  one envelope shared by REST and MCP, distinct codes for "denied" and "unknown", and a
  structural test that pins every write path to the check.
- **Rules design** (#2565) establishes scoped delivery, mandatory rules, and harness
  hook packages. Routing rules ("this category of data belongs on that instance") are
  rules in that model; this design gives them something the server can check.

## Design

### (a) Instance identity and title

**Instance id.** A new single-row identity record created when the database is first
initialised: `instance_id` (prefix `nti_` plus 26 characters of Crockford base32 from
128 random bits), `created_at`, and the admission mode (below).

The id is **bound to the database, not to the process configuration.** This is the
property that catches #2462. In that incident the configuration was correct and the
data store was wrong; an id derived from configuration, hostname, or environment would
have matched and admitted every write. An id stored in the database changes whenever
the database behind the transport changes. Consequences:

- The id is not settable by environment variable or flag. Two instances configured
  with the same id is a state the system should not be able to reach by configuration.
- The id survives restarts, upgrades, host moves, and restores of the same database.
- Peer sync never copies the identity record.
- A copied database (for example a fixture cloned from a live instance) carries the
  same id. A `neotoma instance reidentify` command mints a new one; see open question 1.

**Title.** As specified in #2381: `NEOTOMA_INSTANCE_TITLE`, trimmed, blank means unset,
disclosed to any connecting client including unauthenticated discovery. Not unique, not
authenticated, never sufficient on its own to admit a write on a strict instance.

**Where both appear.** The same `{ instance_id, title }` pair, from one resolver, on
every surface:

| Surface | Carrier |
|---|---|
| MCP `initialize` | `serverInfo.title` (title); `InitializeResult._meta["io.neotoma/instance"]` (id and title). `serverInfo.name` stays `"neotoma"`. |
| Every MCP tool result | `_meta["io.neotoma/instance"]` on the `CallToolResult`, alongside the existing `io.modelcontextprotocol/serverInfo` meta key, which gains `title`. |
| Every REST response | `Neotoma-Instance-Id` and `Neotoma-Instance-Title` response headers. |
| `GET /session`, `get_session_identity`, CLI `auth session` | The `instance` object from #2462, carrying `instance_id`, `title`, and `target_assertion` mode. |
| Server card (`/.well-known/mcp/server-card.json`) | `serverInfo.title` and an `instance` block. |
| Turn summary | See (d). |

Putting the id on every tool result, not only at connect time, matters because
handshake metadata is exactly what clients drop (#2187, #2368). A result header is seen
on the call that matters.

### (b) Declaring the intended instance

Every assertion is a string: either an instance id (`nti_...`) or a title assertion
(`title:<text>`, compared after trimming, case-sensitive). Assertions can come from
four places, which compose:

| Source | Set by | Mechanism | Defends against |
|---|---|---|---|
| Connection binding, header | Client config, proxy | `Neotoma-Expected-Instance` request header on every request of the connection | Misroute |
| Connection binding, URL | Remote connector config where headers are not configurable | `?expected_instance=<id>` on the MCP URL | Misroute |
| Proxy flag | Plugin or `mcp.json` launcher | `neotoma mcp proxy --expect-instance <id>`; the proxy sends the header on every downstream request and also checks the id returned by session preflight before serving any tool call | Misroute, caught at startup |
| Per-request, client | MCP client or SDK | `params._meta["io.neotoma/expected_instance"]` on `tools/call` | Misselection |
| Per-request, agent | The model itself | Optional reserved argument `target_instance` accepted by every tool, stripped before schema validation of the tool's own arguments | Misselection |

The agent-settable argument is necessary because a model can set tool arguments but
not request `_meta`. Without it, misselection can only be caught by client code, which
is the status quo.

**Where the agent gets the value.** From the result headers in (a), from the
connection's instructions (which name the instance), and from routing rules. In the
#2565 model a routing rule is an ordinary rule whose text maps a data category to an
instance id ("confidential finance records go to instance `nti_...`, titled Finance
graph"). The rule is delivered to the harness; the agent asserts the id on the write;
any other instance rejects it. Harness hook packages (#2565 slice N6) may inject
`target_instance` from a routing rule on PreToolUse where the harness lets a hook
rewrite tool input. Automatic routing (choosing the connector for the agent) stays out
of scope, as #2381 ruled.

**Composition.** Every assertion present on a request must match the served instance.
A connection bound to A carrying a per-request assertion of B is rejected even when
served by A, because the two disagree about intent and admitting it would make the
weaker assertion silently win.

### (c) Server admission

**Check placement.** One choke point per transport, before any handler runs and
before any database write: the MCP `tools/call` dispatcher and an Express middleware on
every REST route. The CLI's offline path (which opens the local database directly)
runs the same check against the database's own identity record. A structural test, in
the style of `instance_policy_write_path_coverage.test.ts`, pins every entry point to
the check. Because the check is on the request envelope rather than on typed entities,
it covers raw and file storage too, the path instance policy does not reach.

**Order relative to authentication.** The target check runs first. The id and title are
already public through discovery, so a mismatch error discloses nothing new, and a
misrouted request then gets the diagnostic error ("wrong instance") instead of an auth
failure that sends the agent hunting for tokens, which is the loop #2381 describes.

**Mismatch, any mode.** Any asserted value that does not match is rejected, for reads
and writes alike. Answering a read from the wrong instance is the #2462 failure in
read form. Envelope, shared by REST and MCP:

```json
{
  "code": "ERR_TARGET_INSTANCE_MISMATCH",
  "message": "This request asserted instance '<asserted>' but reached '<served title>' (<served id>); 0 persisted.",
  "retryable": false,
  "served_instance": { "instance_id": "nti_...", "title": "..." },
  "asserted": [{ "source": "tool_argument", "value": "..." }],
  "hint": "Do not retry on this connection. Use the connection whose instance id is the one you asserted, or ask the user which instance is intended."
}
```

HTTP status 421 (Misdirected Request), whose defined meaning is exactly this. MCP
returns it as the `data` of an `McpError`. No part of the submitted payload is echoed,
following the instance-policy hint rules.

**Absence.** A per-instance setting, `target_assertion`, governs requests that assert
nothing:

| Mode | Unasserted read | Unasserted write | Title assertion accepted |
|---|---|---|---|
| `optional` (default) | Admitted | Admitted | Yes |
| `warn` | Admitted | Admitted, with `_meta["io.neotoma/warnings"]` naming the missing assertion, and an audit event | Yes |
| `required` | Admitted | Rejected: `ERR_TARGET_INSTANCE_REQUIRED`, HTTP 428 (Precondition Required) | No, only an id satisfies a write |

`required` is the strict mode for confidential instances. It does two jobs in the
motivating case. On the confidential instance it guarantees nothing lands there unless
the writer named it. On the team's other instances, `required` (or at least `warn`)
forces every write to carry an intent, so an assertion of the confidential instance's
id arriving anywhere else is caught by mismatch.

Default `optional` keeps every existing client working unchanged; the only visible
difference for an instance that sets nothing is the added result headers.

**Where the mode lives.** On the identity record in the database, so it travels with
the data. Set by an authenticated owner through `neotoma instance set
--target-assertion <mode>` and the equivalent REST route. An environment variable
`NEOTOMA_TARGET_ASSERTION` may tighten the stored mode but never loosen it. Every change
is recorded as an auditable event.

**No partial write.** The check precedes the store transaction, so a rejected batch
persists nothing in any table (sources, observations, raw fragments, relationship
observations, timeline events). Whole-request reject, matching `StorePolicyDeniedError`.

**Unknown identity.** If the identity record cannot be read, writes carrying any
assertion, and all writes in `required` mode, are refused with a distinct retryable
`ERR_TARGET_INSTANCE_UNAVAILABLE`, mirroring the denied versus unavailable split in
instance policy. An unknown identity is never treated as a match.

**Peer sync.** `add_peer` records the remote's `instance_id`; every outbound sync
asserts it. Follow-up slice, not required for the first cut.

### (d) How it shows up in Claude

- **Connector naming.** Claude Code and similar clients name a server by its
  configuration key. `neotoma mcp config` and the config scan should write keys of the
  form `neotoma-<slug of title>` and pass `--expect-instance` with the id, so the key the
  user sees and the binding the server checks are produced together. For remote
  connectors added by URL, the setup docs show the connector named by the instance
  title and the URL carrying `?expected_instance=`. Client-assigned UUID prefixes are
  the client's naming and stay out of this repo's scope; supplying a real
  `serverInfo.title` is what lets a client do better.
- **Connection instructions.** The first line of the served instructions names the
  instance: "This connection is the Neotoma instance '<title>' (<id>). Assert
  `target_instance` on writes." Advisory only, since instructions delivery is
  unreliable (#2187); the result headers are the reliable carrier.
- **Turn-summary header.** The display rule changes from `🧠 Neotoma — [<conversation>]`
  to `🧠 Neotoma · <title> — [<conversation>]`, with the first 8 characters of the id
  when no title is set. `neotoma_turn_summary` returns `instance` and prefixes its
  `status_line` with the title. When a turn touched more than one instance, one header
  line per instance, so the user sees which Neotoma answered which part.
- **Rejections in the transcript.** The mismatch hint is written to be relayed: it names
  both instances by title, so the agent can tell the user "that write was refused by
  Personal graph because it was meant for Finance graph" rather than retrying.

## Tests that would prove it

Each test that is offered as proof of a fix must be shown red on unfixed `main` (or
with the check reverted) in the implementing PR.

1. **Planted red, misroute.** Two in-process instances A and B with separate databases.
   A client bound to A (`--expect-instance <A.id>`) whose transport is pointed at B,
   reproducing #2462. A `store` call must fail with `ERR_TARGET_INSTANCE_MISMATCH`, B's
   row counts unchanged in every table, A untouched. On unfixed `main` the write
   succeeds into B, so the test fails: that is the planted red.
2. **Planted red, identity source.** Same process configuration, database file swapped:
   the served `instance_id` must change. An implementation that derives the id from
   config, hostname, or env passes most tests and fails this one.
3. **No partial write.** A 50-entity batch with relationships and an attached raw file,
   mismatched assertion: zero new rows in sources, observations, raw fragments,
   relationship observations, timeline events.
4. **Matrix.** Assertion source (tool argument, `_meta`, header, URL query, proxy flag)
   by outcome (match, mismatch, absent) by mode (`optional`, `warn`, `required`) by
   operation (read, write). Asserts response values and row counts, not only status.
5. **Conflicting assertions.** Connection bound to A, per-request asserts B, served by A:
   rejected.
6. **Title assertions.** Match admitted under `optional`; insufficient under `required`;
   two instances with the same title, title assertion admitted on both under
   `optional` (documented limitation), id assertion admitted on only one.
7. **Every tool classified and gated.** Enumerate tool definitions and REST routes; each
   must be declared read or write and reach the choke point. A new tool without a
   classification fails CI. Includes the CLI offline path.
8. **Surface parity.** `initialize`, every tool result `_meta`, REST headers, server card,
   `GET /session`, `get_session_identity`, and CLI `auth session` return the same id and
   title for one instance and different ids for two.
9. **Envelope parity.** REST and MCP mismatch and required envelopes are equal; HTTP 421
   and 428; `retryable: false` for mismatch and required, `true` for unavailable; no
   payload fragment appears in the envelope.
10. **Order.** Mismatched and unauthenticated request returns the mismatch error.
11. **Mode storage.** `NEOTOMA_TARGET_ASSERTION=optional` on an instance stored as
    `required` stays `required`; stored mode survives restart and host move of the same
    database.
12. **Turn summary.** Header and `status_line` carry the title; without a title, the
    short id.

## Implementation slices

1. Identity record, resolver, `instance` object on session surfaces, title per #2381.
2. Result headers and `_meta` on every tool result and REST response; server card.
3. Admission choke points, mismatch envelope, structural coverage test.
4. `target_assertion` modes, owner CLI and REST, tighten-only env override, audit event.
5. Proxy `--expect-instance` with preflight check; config-scan key naming; docs.
6. Turn-summary header and instructions first line.
7. Peer sync assertion (follow-up).

## Open questions

1. **Cloned databases.** A copied database shares its id, so a fixture cloned from a
   live instance would pass the check. Options: require `reidentify` in any
   copy/restore tooling; or combine the stored id with the configured public origin so a
   copy served elsewhere differs (which breaks legitimate host moves). Recommendation:
   `reidentify` plus a startup warning when the configured origin differs from the
   origin last recorded on the identity record.
2. **Reads under `required`.** This design admits unasserted reads. Should a strict
   instance also require assertions on reads, so a confidential instance is never read
   by an agent that did not mean to read it?
3. **Loosening a strict instance.** Should moving from `required` to a weaker mode need a
   second actor, like retiring a mandatory rule in #2565?
4. **Default for hosted instances.** Should hosted deployments default to `warn` rather
   than `optional`?
5. **Reserved argument name.** `target_instance` on every tool's input schema changes
   every schema in the contract. The alternative is a single wrapper tool, which agents
   are less likely to use. Recommendation: the reserved argument, documented once in the
   OpenAPI contract and injected by the tool-definition builder.
6. **Interaction with #2565 predicates.** Is "writes must assert this instance" better
   expressed as a mandatory rule with a new predicate operation, or kept as an
   envelope-level setting? This design keeps it envelope-level because it governs the
   request, not entity content, and because it must hold before the rules resolver
   runs.

## References

- #2589 design issue
- #2381 serverInfo.name is hardcoded on every instance
- #2462 a session configured for a hosted instance served a local database
- #2565 rules design (core rule and policy types, scoped delivery)
- #2187, #2368 handshake metadata not reaching clients
- `src/services/instance_policy.ts` admission pattern and envelopes
- `src/server.ts` initialize handler and `getServerInfo`
- `src/mcp_server_card.ts` server card
- `src/cli/mcp_proxy.ts` proxy options and session preflight
- `src/services/turn_summary.ts` turn summary
