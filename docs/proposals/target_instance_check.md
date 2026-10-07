---
title: "Target-instance check: stable instance identity, asserted targets, and write admission"
status: "proposal"
source_plan: "n/a (authored directly as a proposal, not migrated from a plan)"
migrated_date: "n/a (authored 2026-10-07)"
priority: "p1"
estimated_effort: "Medium: identity and admission records, one admission point per transport and phase, client-side acknowledgement check, surface parity, docs"
---

# Target-instance check

Design only. No implementation in this change. Design issue: #2589.

Revision 2 addresses the first review round (pm, arch, qa, security, ux). The main
changes: the asserted target must come from a source independent of the connection
being checked; only `required` mode prevents a wrong write; an unknown or missing
identity fails closed; servers that lack the check are detected by the client through a
mandatory acknowledgement; the CLI gets an assertion source; mode changes need an admin
credential; and the six open questions are resolved.

## Problem

Every Neotoma server advertises the same `serverInfo.name` (`"neotoma"`). A client
connected to several instances sees only opaque connector ids, so the agent decides
"which Neotoma" on its own and sometimes writes to the wrong one. Nothing in a request
lets the client state which instance it meant, so the only check is client-side, and it
is a guess.

Two failure classes follow, and they need different defences:

1. **Misroute.** The configuration names instance A; the transport actually reaches
   instance B. Every call returns `success: true`. This is #2462: a session configured
   for a hosted instance served a local database for a whole day.
2. **Misselection.** The client is connected to A and B correctly; the agent picks the
   wrong connector for a given write. This is the failure #2381 anticipates: two
   instances that both present as `neotoma`.

Motivating case, stated generically: a team runs several Neotoma instances, one of
which holds confidential finance data. Writes of that data must never land on any other
instance, and writes meant for other instances must never land on it.

## Guarantees and non-goals

State these before the mechanism, because operators choose modes from them.

**What the server prevents.** An instance in `required` mode refuses every write that
does not carry an id assertion matching that instance. An instance in any mode refuses
every request whose assertion names a different instance. Neither refusal persists
anything.

**The motivating case holds only under these preconditions.** Confidential writes never
land on a wrong instance only when (1) every instance in the team that could receive
such a write runs this check in `required` mode, and (2) the writer's assertion comes
from a source independent of the connection it is using (see "Where the asserted value
must come from"). `optional` and `warn` do not prevent anything: `warn` gives
detection, not prevention.

**What the server cannot catch.** An agent that does not recognise data as
confidential, and therefore asserts the instance its routing rule names for ordinary
data (or the instance it is already using), is admitted. An agent that copies the
served instance's own id into its assertion, against its instructions, is admitted. The
check makes the agent's routing decision verifiable; it cannot make the decision.

**Non-goals.**

- Not access control. The instance id is public by design. This guards against
  accidents among honest Neotoma servers.
- No guarantee against a hostile or impersonating endpoint, which can return any public
  id in its metadata. If that guarantee is ever wanted, it needs server authentication
  (a signed server card or TLS identity), which is outside this design.
- No disclosure protection. A rejected write has still sent its payload to the wrong
  server. The check stops persistence. Rejected request bodies must stay out of request
  logs, error reporters, and audit event contents.
- No automatic routing. Choosing the connector for the agent stays out of scope, as
  #2381 ruled.

## Prior art this design builds on

- **#2381** specifies an optional, operator-configured display label
  (`NEOTOMA_INSTANCE_TITLE`, surfaced as `serverInfo.title`) and rules that a label is
  never authorization and never a write-destination selector. This design keeps that
  ruling: the title is for humans; the check keys on a separate stable id.
- **#2462** asks for an additive `instance` object on `GET /session` and
  `get_session_identity`, and its engineering spec lists fields for it (served origin,
  deployment kind, policy id, local data directory). This design **extends** that
  object with `instance_id`, `title`, `target_assertion`, and `read_assertion`; it does
  not replace the #2462 fields. One shape ships on that key.
- **Instance policy** (`src/services/instance_policy.ts`) establishes the admission
  pattern reused here: instance-wide scope, whole-request reject with `0 persisted`, a
  denied versus unavailable split, and a structural test pinning every write path.
- **Rules design** (#2565) establishes scoped delivery, mandatory rules, and harness
  hook packages. Category-to-instance routing is a #2565 rule that produces the
  assertion.

## Design

### (a) Instance identity and title

**Instance id.** A dedicated single-row identity record, outside the entity graph:
`instance_id` (`nti_` followed by 26 characters of Crockford base32 from 128 random
bits), `created_at`, and the serving location last recorded (public origin, or the
database path for a local instance). Being outside the entity graph, it is unreachable
from `store`, `correct`, `merge`, `delete`, `restore`, and peer sync.

The id is **bound to the database, not to the process configuration.** This is the
property that catches #2462. In that incident the configuration was correct and the
data store was wrong; an id derived from configuration, hostname, or environment would
have matched. An id stored in the database changes whenever the database behind the
transport changes. Consequences:

- The id is not settable by environment variable or flag.
- The id survives restarts, upgrades, host moves, and restores of the same database.
- Peer sync never copies the identity record (asserted from slice 1).

**When an id is minted.** Only in two cases: first initialisation of an empty database,
and the one-time, versioned upgrade migration that introduces the identity record on a
pre-feature database. The migration is recorded in the migration ledger. **Server
startup never mints an id over existing data.** If the ledger says the identity record
was created and the record is missing, or the database is non-empty and has neither the
record nor a pre-feature schema version, the instance refuses writes with
`ERR_TARGET_INSTANCE_UNAVAILABLE` until an operator runs `neotoma instance restore-identity`
(re-adopt a known id) or `neotoma instance reidentify` (mint a new one). A pre-feature
backup restored onto a new server goes through the migration and gets a new id; clients
bound to the old id then fail closed by mismatch, which is the safe outcome.

**Title.** As specified in #2381: `NEOTOMA_INSTANCE_TITLE`, trimmed, NFC-normalized,
blank means unset, at most 120 characters, no control characters, disclosed to any
connecting client including unauthenticated discovery. Not unique, not authenticated,
never sufficient to admit a write on a `required` instance.

**Short id.** Wherever an abbreviated id is shown (turn-summary header, connector key),
it is `nti_` followed by the first 6 characters after the prefix, for example
`nti_7m2k9q`. That gives 30 bits of distinguishing characters, not the 4 that an
8-character prefix would leave.

**Where the identity appears.** One resolver, the same `{ instance_id, title }` on every
surface:

| Surface | Carrier |
|---|---|
| MCP `initialize` | `serverInfo.title` (title); `InitializeResult._meta["io.neotoma/instance"]` (id, title); capability flag (see "Acknowledgement and capability" below). `serverInfo.name` stays `"neotoma"`. |
| Every MCP tool result | `_meta["io.neotoma/instance"]` with `instance_id`, `title`, `assertion_checked`; the existing `io.modelcontextprotocol/serverInfo` meta key gains `title`. Plus a one-line identity statement in the result content (see below). |
| Every REST response | `Neotoma-Instance-Id`, `Neotoma-Instance-Title`, `Neotoma-Assertion-Checked` response headers. |
| `GET /session`, `get_session_identity`, CLI `auth session` | The #2462 `instance` object, extended as stated above. |
| `describe_instance_policy` and the instance-policy instructions renderer | `target_assertion` and `read_assertion`, so agents learn an instance's admission rules in one place. |
| Server card (`/.well-known/mcp/server-card.json`) | `serverInfo.title` and an `instance` block. |

**Model visibility.** In several clients, Claude among them, the model sees result
content and not protocol `_meta`, and response headers reach only the client. So `_meta`
and headers are the carrier for clients, proxies, and hooks, and each tool result also
carries a short content line for the model, for example
`Neotoma instance: Personal graph (nti_7m2k9q), assertion checked`. The implementing
slice confirms what reaches the model in Claude Code, Claude Desktop, and Cursor, and
records the evidence.

**Correlation.** A stable, unauthenticated id on every response survives host moves and
can correlate a self-hosted instance across addresses. This design accepts that: the id
must be readable before authentication for misroute diagnosis and proxy preflight. The
acceptance is stated in the operator setup docs next to the title disclosure.

### (b) Declaring the intended instance

#### Where the asserted value must come from

An assertion only catches misselection if its value comes from **intent**, independent
of the connection being checked. Valid sources:

1. A **routing rule** (a #2565 rule mapping a data category to an instance id, with the
   title alongside for display).
2. A **connection binding the user configured**: a plugin or connector config, a proxy
   flag, a CLI flag or environment variable.
3. **The user**, naming the target in the conversation.

**The served instance's own identity is never a valid source.** Headers, result
`_meta`, the content identity line, the instructions, `get_session_identity`, and the
server card identify the instance for display and for verification. An agent must not
copy the id it reads from a connection into an assertion sent over that same connection;
doing so turns the check into an echo that always passes. When no rule, binding, or user
statement names a target for a write, the agent asks the user.

#### Assertion grammar

- Id assertion: matches `^nti_[0-9a-hjkmnp-tv-z]{26}$`.
- Title assertion: `title:<text>`, where text is trimmed, NFC-normalized, compared
  case-sensitively, at most 120 characters, no control characters.
- Empty, whitespace-only, or otherwise malformed values are **not** treated as absent.
  They are rejected with `ERR_TARGET_INSTANCE_MALFORMED` (HTTP 400), and the malformed
  value is not echoed.
- Repeated headers, repeated query parameters (parsed as arrays), and multiple sources
  are all assertions; every one must match. Never first-wins.

#### Sources

| Source | Set by | Mechanism | Phase checked |
|---|---|---|---|
| Connection header | Client config, proxy, SDK | `Neotoma-Expected-Instance` on every request | Connection (pre-auth) |
| Connection URL | Remote connector config where headers are not configurable | `?expected_instance=<id>` on the MCP URL | Connection (pre-auth) |
| Proxy flag | Plugin or `mcp.json` launcher | `neotoma mcp proxy --expect-instance <id>`; sends the header; implies `--session-preflight` and `--fail-closed`; refuses to start on an empty value; refuses to serve any tool call when preflight returns no `instance` object, no capability flag, or a different id, naming both ids | Startup and connection |
| CLI | CLI user or agent | `--expect-instance <id>` or `NEOTOMA_EXPECTED_INSTANCE`; sends the header on the API transport; checked against the local identity record on `--offline` | Connection, or local |
| Per-call, client | MCP client or SDK | `params._meta["io.neotoma/expected_instance"]` on `tools/call` | Request (post-auth) |
| Per-call, agent | The model | Reserved top-level argument `target_instance` (string only), MCP only | Request (post-auth) |

The agent-settable argument exists because a model can set tool arguments but not
request `_meta`. It is defined once in the OpenAPI contract and injected into every MCP
tool's input schema by the tool-definition builder. The exact top-level key is removed
before the tool's own validation, so it passes `.strict()` schemas, and it is never
stored as a field or raw fragment. REST carries the assertion only as the header, so it
never collides with the closed-schema guard; the CLI carries it as a flag or environment
variable.

**Composition.** Every assertion present must match the served instance. A connection
bound to A carrying a per-call assertion of B is rejected even when served by A.

#### Acknowledgement and capability

A server that predates this feature, or a stray server from an old checkout, ignores
the header and URL parameter and silently strips `target_instance` (MCP argument
schemas strip unknown keys). Those stray servers are exactly the #2462 class, so the
check must not depend on the server reached being a checking server.

- **Capability.** `initialize` advertises
  `capabilities.experimental["io.neotoma/target_instance_check"] = { "version": 1 }`.
- **Acknowledgement.** Every MCP result carries
  `_meta["io.neotoma/instance"].assertion_checked: true` when one or more assertions were
  evaluated and matched; every REST response carries `Neotoma-Assertion-Checked: true`
  in the same case. The content identity line says "assertion checked".
- **Client-side echo rule.** Every asserting client (proxy, SDK, CLI, and harness hooks
  that can read results) compares the served `instance_id` on every response with what
  it asserted. A response with a missing id, a missing acknowledgement, or a different id
  counts as a mismatch. For a read, the client discards the result. For a write, the
  write may already have persisted on a non-checking server, so the client raises
  `ERR_TARGET_INSTANCE_UNVERIFIED`, surfaces the returned entity ids as possibly
  misplaced, and stops further writes on that connection.
- **Preflight.** The proxy and CLI check the capability and id before sending any tool
  call, so a binding to a non-checking server fails before the first write, not after.
- **Agent rule.** A write result whose content lacks "assertion checked" when the agent
  asserted a target is unverified; the agent tells the user rather than continuing.

### (c) Server admission

**Two phases.** `/mcp` authenticates inside its route handler before JSON-RPC dispatch,
so per-call assertions can only be evaluated after auth.

1. **Connection phase, pre-auth.** Header and URL assertions are checked in the `/mcp`
   route and in a REST middleware placed ahead of authentication and ahead of
   `unknownFieldsGuard`, so a misrouted request to a server with a different schema gets
   the mismatch error, not `ERR_UNKNOWN_FIELD` or an auth failure that sends the agent
   hunting for tokens. The id and title are already public through discovery, so the
   error discloses nothing new. Pre-auth rejections write no audit events (a rate-limited
   log line only), so unauthenticated callers cannot fill the audit log.
2. **Request phase, post-auth.** `_meta` and `target_instance` are checked in the MCP
   `tools/call` dispatcher, before the tool handler and before any database write.

The CLI's offline path runs the same check against the local identity record. A
structural test, in the style of `instance_policy_write_path_coverage.test.ts`, pins
every entry point to its phase. Because the check is on the request envelope, it covers
raw and file storage, which instance policy does not.

**Read and write classification.** MCP `annotations.readOnlyHint` is the single source,
required on every tool; a tool without it fails CI. REST routes are classified by method
and OpenAPI operation. No parallel table.

**Modes.** Two independent, tighten-only axes:

| Setting | Values | Default | Effect when no assertion is present |
|---|---|---|---|
| `target_assertion` | `optional`, `warn`, `required` | `optional`; `warn` for newly created hosted identity records | `optional`: admitted. `warn`: admitted, with a warning in the result body (the `store_warnings` precedent) and an audit event. `required`: write rejected with `ERR_TARGET_INSTANCE_REQUIRED`. |
| `read_assertion` | `optional`, `required` | `optional` | `required`: reads rejected with `ERR_TARGET_INSTANCE_REQUIRED`, except identity and discovery calls (`initialize`, `get_session_identity`, `GET /session`, server card, `describe_instance_policy`), which stay exempt so an agent can learn what to verify. |

Under `required`, only an id assertion satisfies a write; a title assertion does not.
Under `warn`, a title-only assertion is admitted but still warns, so duplicate titles stay
visible.

`warn` is observability. It is never a protection setting, and the operator docs say so
in the same sentence that introduces it.

**Where the modes live.** In a separate admission-settings record, also outside the
entity graph, **not** on the identity record. If the admission-settings record is
unreadable or missing while the identity record is present, both axes resolve to
`required`. `NEOTOMA_TARGET_ASSERTION` and `NEOTOMA_READ_ASSERTION` may tighten the stored
value, never loosen it. Rules (#2565) may tighten, never loosen or disable.

**Who can change a mode.** Only an admin credential, through an operator channel outside
MCP: `neotoma instance set --target-assertion <mode>` and its REST equivalent. Not
through any MCP tool, not with an agent-scoped token, and not through `store`, `correct`,
or any other entity path, so an agent that receives `ERR_TARGET_INSTANCE_REQUIRED`
cannot lower the mode and retry. Tightening takes effect immediately. Loosening requires
an explicit confirm flag and takes effect only after a cooling delay (default 24 hours,
cancellable), is audited, and is shown as pending in `describe_instance_policy` and
`/session`. This depends on admin-gating of instance policy writes, which the
implementing slice must establish first; the admin predicate is defined there.

**Errors.** One family: the standard envelope in `docs/subsystems/errors.md`
(`error_code`, `message`, `hint`, `details`), returned in JSON-RPC `data` on MCP and as
the REST body. The instance-policy `code` shape is not followed, deliberately, because
connection-phase rejections occur before dispatch and must use the transport envelope.
All codes are registered in `errors.md` and declared in `openapi.yaml`, with the
response headers, before implementation.

| Code | HTTP | Retryable | When |
|---|---|---|---|
| `ERR_TARGET_INSTANCE_MISMATCH` | 421 | No | An assertion names a different instance |
| `ERR_TARGET_INSTANCE_REQUIRED` | 428 | No | `required` mode and no id assertion |
| `ERR_TARGET_INSTANCE_MALFORMED` | 400 | No | Empty or malformed assertion |
| `ERR_TARGET_INSTANCE_UNAVAILABLE` | 503 | Yes | Identity or admission settings unreadable, or identity missing on a non-empty database |
| `ERR_TARGET_INSTANCE_UNVERIFIED` | client-raised | No | Client-side echo rule failed (no acknowledgement, missing or different id) |

Mismatch example. The server knows its own title and the asserted id, never the
asserted instance's title:

```json
{
  "error_code": "ERR_TARGET_INSTANCE_MISMATCH",
  "message": "This request was meant for instance nti_4x8r2w... but reached Personal graph; 0 persisted.",
  "hint": "Do not retry on this connection. Call get_session_identity on each connected Neotoma and use the one whose instance.instance_id equals the id you asserted. If none matches, ask the user which Neotoma is intended.",
  "details": {
    "served_instance": { "title": "Personal graph", "short_id": "nti_7m2k9q" },
    "asserted": [{ "source": "tool_argument", "value": "nti_4x8r2w..." }]
  }
}
```

Required example:

```json
{
  "error_code": "ERR_TARGET_INSTANCE_REQUIRED",
  "message": "Writes to Finance graph must name their intended instance; 0 persisted.",
  "hint": "Assert the instance id that your routing rule or the user names for this data, as target_instance. Do not copy this instance's own id from its session identity or instructions. If nothing names a target, ask the user.",
  "details": { "served_instance": { "title": "Finance graph" } }
}
```

Rules for both hints: they never offer the served id as the value to retry with; the
mismatch hint names `get_session_identity` as the lookup and asking the user as the
fallback; the required envelope does not carry the served id at all. No fragment of the
submitted payload is echoed, and a title assertion is echoed only after grammar
validation. Agents relaying a mismatch to the user name the asserted side by the title
their routing rule carries, since the server cannot supply it.

**Unknown identity fails closed.** If the identity record is unreadable, every write is
refused with `ERR_TARGET_INSTANCE_UNAVAILABLE`, whatever the assertions and whatever the
mode, because the mode cannot be trusted either. An unknown identity is never a match,
and never resolved by minting.

**No partial write.** Both phases precede the store transaction, so a rejected batch
persists nothing in any table (sources, observations, raw fragments, relationship
observations, timeline events).

**Peer sync.** `add_peer` records the remote's `instance_id`; every outbound sync asserts
it. Inbound sync to a `required` instance is an ordinary write: rejected unless it
asserts the receiving instance's id. There is no sync exemption, because an exemption is
a bypass. Consequence, documented: a `required` instance cannot receive sync from a peer
that predates this feature.

### (d) How it shows up for users in Claude

- **Connector naming.** Claude Code and similar clients name a server by its
  configuration key. `neotoma mcp config` and the config scan write keys
  `neotoma-<slug of title>` and pass `--expect-instance` with the id, so the name the user
  sees and the binding the server checks are produced together. Untitled instance:
  `neotoma-<short id without prefix>`, for example `neotoma-7m2k9q`. Two titles that slug
  to the same key: the second gets `-<short id without prefix>` appended. The scan refuses
  to overwrite an existing key bound to a different id, and says so. For remote connectors
  added by URL, the setup docs name the connector by title and put `?expected_instance=`
  in the URL. Client-assigned UUID prefixes are the client's naming and out of scope.
- **Instructions.** The first line identifies the instance without inviting an echo:
  "This connection is the Neotoma instance 'Personal graph' (nti_7m2k9q). Before a write,
  assert the instance that your routing rule or the user names for the data, as
  `target_instance`; never this connection's own id unless a rule or the user named this
  instance. If nothing names one, ask the user." Advisory, since instructions delivery is
  unreliable (#2187).
- **CLI agent instructions.** The same rules (assertion sources, never echo the served
  id, the header format below) are mirrored into `docs/developer/cli_agent_instructions.md`,
  with the CLI's `--expect-instance` and `NEOTOMA_EXPECTED_INSTANCE` as the assertion
  source.
- **Turn-summary header.** The display rule changes from `🧠 Neotoma — [<conversation>]`
  to `🧠 Neotoma · <title> — [<conversation>]`, with the short id when no title is set.
  The emoji and separator are decoration; the title carries the meaning. The rule lives in
  two places (`src/server.ts` and `docs/developer/mcp/instructions.md`) and both change.
  `neotoma_turn_summary` returns `instance` and prefixes its `status_line` with the title.
  It runs on one instance and cannot know what others answered, so when a turn touched
  several instances, the agent assembles one header line per instance from each
  instance's own summary.
- **Rejections in the transcript.** The agent relays a mismatch as "that write was
  refused by Personal graph; it was meant for Finance graph", taking "Finance graph" from
  its routing rule, and does not retry on the same connection.

## Tests that would prove it

Every test offered as proof of a fix must be shown red in its implementing PR. Where the
plumbing (flags, fields) does not exist on `main`, the red is produced by keeping the
plumbing and reverting only the admission or verification logic, so the test fails for
the reason under test and not because an option is unknown. This is an acceptance
criterion of every implementing PR.

**Server admission**

1. **Planted red, misroute.** Two in-process instances A and B with separate databases.
   A client bound to A (`--expect-instance <A.id>`) whose transport points at B,
   reproducing #2462. `store` fails with `ERR_TARGET_INSTANCE_MISMATCH`; B's row counts
   unchanged in every table; A untouched. With the check reverted, the test asserts the
   write landed in B, and fails.
2. **Planted red, identity source.** Same process configuration, database file swapped:
   the served `instance_id` changes. An id derived from config, hostname, or environment
   fails this.
3. **Planted red, misselection (motivating case).** A routing rule maps a data category
   to instance F. A write of that category, carrying `target_instance = F.id`, is sent
   through instance P's connection. P rejects with `ERR_TARGET_INSTANCE_MISMATCH` and
   persists zero rows in every table. Variant: the agent follows P's served instructions;
   the write is still rejected because the rule names F.
4. **Hints never offer the served id.** For mismatch and required envelopes on REST and
   MCP, the hint text does not contain the served id, and the required envelope carries
   no served id anywhere.
5. **No partial write.** A 50-entity batch with relationships and an attached raw file,
   mismatched assertion: zero new rows in sources, observations, raw fragments,
   relationship observations, timeline events.
6. **Matrix.** Source (tool argument, `_meta`, header, URL query, proxy flag, CLI flag,
   CLI environment variable, CLI `--offline`) by outcome (match, mismatch, absent,
   malformed) by `target_assertion` and `read_assertion` modes by operation (read,
   write). Asserts response values and row counts.
7. **Conflicting assertions.** Connection bound to A, per-call asserts B, served by A:
   rejected.
8. **Assertion grammar.** Repeated header and repeated query parameter (all must match);
   empty and whitespace values (malformed, not absent); non-string `target_instance`
   (rejected); over-length or control-character title (rejected, not echoed); NFC and
   whitespace variants match; a case difference does not match.
9. **Title assertions.** Admitted under `optional`; admitted with a warning under `warn`;
   insufficient for writes under `required`; two instances with the same title: title
   assertion admitted on both under `optional` (documented), id assertion on only one.
10. **Every tool classified and gated.** Every MCP tool carries `readOnlyHint`; every
    entry point (MCP, REST, CLI API, CLI offline) reaches its phase's check; for every
    tool, `target_instance` passes a `.strict()` schema and never appears as a stored
    field or raw fragment.
11. **Ordering.** A connection-phase mismatch on an unauthenticated request returns the
    mismatch error and writes no audit event. Scoped to header and URL sources only.
12. **Envelope parity.** REST and MCP envelopes are equal and registered; status codes and
    `retryable` as in the table; no payload fragment appears.

**Identity and modes**

13. **Planted red, unknown identity.** Make the identity read fail (resolver throws). Send
    (i) a write with a correct id assertion under `optional` and (ii) an unasserted write
    under `required`. Both return `ERR_TARGET_INSTANCE_UNAVAILABLE` and persist zero rows.
    With the fail-closed branch replaced by fail-open, the test goes red.
14. **No re-mint over data.** Delete the identity row on a non-empty database whose ledger
    records it: startup does not mint, writes return `ERR_TARGET_INSTANCE_UNAVAILABLE`,
    and the id is unchanged until `restore-identity` or `reidentify` runs. The upgrade
    migration on a pre-feature database mints exactly once.
15. **Admission settings unreadable.** With the identity readable and the settings record
    unreadable or missing, an unasserted write is rejected as under `required`.
16. **Mode authority.** A mode change through any MCP tool, an agent-scoped token, `store`,
    or `correct` is refused. An admin change succeeds and emits an audit event; each `warn`
    admission emits one. Loosening without the confirm flag is refused; with it, the old
    mode holds until the cooling delay passes and the pending change is visible.
    Environment variables tighten and never loosen; stored modes survive restart and host
    move.
17. **Peer sync.** The identity record never travels by sync. Inbound sync to a `required`
    instance without an assertion is rejected; with the receiving id it is admitted.
18. **Clones.** Planted red: a database cloned through the clone tooling gets a new id; a
    restore keeps it. A raw file copy keeps the id (documented residual) and, served from
    a new location, a `required` instance refuses writes until an operator confirms the
    move or reidentifies, while an `optional` instance only warns.

**Clients**

19. **Planted red, server without the check.** Instance B runs code without the check (or
    with it disabled). (i) The proxy with `--expect-instance <A.id>` refuses at preflight
    because the capability and `instance` object are absent, and no tool call is sent.
    (ii) An SDK or CLI client asserting A writes to B; the response lacks the
    acknowledgement, and the client raises `ERR_TARGET_INSTANCE_UNVERIFIED`, surfaces the
    returned entity ids, and sends no further write. With the client echo rule removed,
    the test goes red.
20. **Proxy startup.** Empty `--expect-instance` refuses to start. A preflight id that
    differs refuses to serve, and the error names both ids. `--expect-instance` without
    `--fail-closed` behaves as fail-closed.
21. **Surface parity.** `initialize`, every tool result `_meta` and content line, REST
    headers, server card, `GET /session`, `get_session_identity`, CLI `auth session`, and
    `describe_instance_policy` agree for one instance and differ for two.
22. **Connector naming.** Untitled instance gets the short-id key; colliding slugs get the
    suffix; the scan refuses to overwrite a key bound to a different id.
23. **Turn summary.** Header and `status_line` carry the title, or the short id
    (`nti_` plus 6) when untitled, in both display-rule locations.

**Agent behaviour (evals, committed in the implementing slices)**

24. **Routing eval.** Eval-harness scenario with two connected instances and a routing rule
    sending one data category to one of them: the store call carries `target_instance`
    equal to the rule's id, never the served id of the connection used, and no row lands
    on the other instance.
25. **Stop after mismatch.** An `agentic_eval` fixture modelled on
    `tool_failure_recovery.json`: the agent receives a mismatch envelope, makes no second
    write on the same connection (asserted with `request_count`), and its reply names both
    instances (the asserted one by its routing-rule title).
26. **Header.** Extend the `display_rule_neotoma_section` scenario so the header line names
    the instance that answered, by title, or by short id when untitled.

## Implementation slices

Slices 1 to 3 close the #2462 misroute class without depending on agent behaviour and land
first. Slices 4 to 6 depend on the assertion-source rules above. Every slice touches the
interface contract and takes the arch gate; none takes a bug fast path.

1. Identity record, mint and fail-closed rules, migration, `instance` object, title per
   #2381, `describe_instance_policy` fields. Errors and headers declared in `openapi.yaml`
   and `errors.md` first.
2. Result `_meta`, content identity line, REST headers, capability flag, acknowledgement,
   server card.
3. Connection-phase admission (header, URL), proxy `--expect-instance` with preflight and
   echo rule, CLI `--expect-instance` and `NEOTOMA_EXPECTED_INSTANCE`, structural coverage
   test.
4. Request-phase admission (`_meta`, `target_instance`), admission-settings record, modes,
   admin-gated mode changes with confirm and cooling delay, audit events. Depends on
   admin-gating of instance policy writes.
5. Config-scan key naming, operator and CLI agent docs.
6. Turn-summary header, instructions first line, agent evals.
7. Peer sync assertions.

## Decisions on the six open questions

1. **Cloned databases.** Arch: `reidentify` plus a warning; clone tooling mints a new id by
   default, restore keeps it with an explicit flag; an origin-derived id is rejected
   because it breaks host moves and means nothing for local instances. Security: a warning
   is ignored, so record the serving location, and on a change a `required` instance
   refuses writes until an operator confirms the move or reidentifies, while an
   `optional` instance warns. **Decision:** both, since they do not conflict. Tooling
   distinguishes clone (new id) from restore (keep id); the identity record stores the
   last serving location (public origin, or database path for local instances); a change
   blocks writes on `required` instances until confirmed and warns elsewhere. The id is
   never derived from the location. A raw file copy outside the tooling is a documented
   residual, covered by test 18.
2. **Reads under `required`.** Arch and security: yes, as a separate tighten-only axis,
   off by default, with identity and discovery calls exempt. Pm: decide before slice 4,
   because an unasserted read of a confidential instance puts its content into a context
   that can write anywhere. **Decision:** the `read_assertion` axis, default `optional`,
   decided now and built in slice 4.
3. **Loosening a strict instance.** Lenses disagree. Arch: no second actor in the first
   version, since single-operator instances have none and a two-person primitive here
   would duplicate #2565; require an explicit confirm, audit, and visibility. Security:
   allow loosening only through an owner channel outside MCP and agent tokens, with a
   second actor or a cooling delay. **Decision:** admin credential through an operator
   channel outside MCP and agent tokens, explicit confirm, a cancellable cooling delay
   (default 24 hours), audit, and visibility of the pending change. The cooling delay meets
   security's bar on single-operator instances without inventing a two-person primitive;
   #2565's two-actor retirement is adopted, opt-in per instance, when it lands.
   Tightening stays immediate and single-actor.
4. **Hosted default.** Arch, security, pm: `warn` for new hosted instances, as detection,
   not protection, and only once the warning reaches the agent. **Decision:** newly created
   hosted identity records default to `warn`, with the warning in the result body (slice
   4). Existing instances keep `optional` until an operator changes them. Docs state that
   `warn` protects nothing.
5. **Reserved argument.** Arch and security: acceptable as a top-level, MCP-only argument
   defined once in OpenAPI, string-only, exact-key stripping, and only together with the
   acknowledgement and capability rules, since servers without the check strip it.
   **Decision:** as stated; settled before slice 4 because it changes every tool schema and
   is the costliest part to undo.
6. **Envelope-level setting or #2565 rule.** Arch and security: envelope-level, evaluated
   before the rules resolver, because it governs the request rather than entity content
   and covers raw storage. Steelman for a rule: one policy surface and two-actor retirement
   for free. **Decision:** envelope-level. Rules may tighten it but never loosen or disable
   it. Category-to-instance routing is a #2565 rule that produces the assertion, and the
   modes are reported alongside instance policy.

## References

- #2589 design issue
- #2381 serverInfo.name is hardcoded on every instance
- #2462 a session configured for a hosted instance served a local database
- #2565 rules design (core rule and policy types, scoped delivery)
- #2187, #2368 handshake metadata not reaching clients
- `src/services/instance_policy.ts` admission pattern
- `src/server.ts` initialize handler, display rule, `getServerInfo`
- `src/actions.ts` `/mcp` route and middleware order
- `src/mcp_server_card.ts` server card
- `src/cli/mcp_proxy.ts` proxy options and session preflight
- `src/services/turn_summary.ts` turn summary
- `docs/subsystems/errors.md` error envelope family
- `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`
