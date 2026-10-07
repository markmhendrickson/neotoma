---
title: "Target-instance check: stable instance identity, asserted targets, and write admission"
status: "proposal"
source_plan: "n/a (authored directly as a proposal, not migrated from a plan)"
migrated_date: "n/a (authored 2026-10-07)"
priority: "p1"
estimated_effort: "Medium: identity and admission records, one admission point per transport and phase, client-side acknowledgement check, local instance registry, surface parity, docs"
---

# Target-instance check

Design only. No implementation in this change. Design issue: #2589.

**Revision 3** addresses the second review round. Main changes:

- Connection bindings now defend only against misrouted connections. Under `required`,
  a write must carry its own target, taken from a routing rule or the user's choice.
- A local, user-confirmed registry of the user's Neotomas lets a title the user names
  become an id, so "ask the user" can finish on a strict instance.
- The identity commands (`restore-identity`, `reidentify`, `confirm-move`) now have
  authority rules.
- The admission-settings migration keeps existing instances `optional`.
- Write admission is keyed on the server's own effect classification.

Revision 2 addressed the first round: assertions come from intent, unknown identity fails
closed, the client checks for a server acknowledgement, the CLI got an assertion source,
mode changes are admin-gated, and the six open questions were resolved.

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
   wrong connector for a given write. This is the failure #2381 anticipates.

Motivating case, stated generically: a team runs several Neotoma instances, one of
which holds confidential finance data. Writes of that data must never land on any other
instance, and writes meant for other instances must never land on it.

## Guarantees and non-goals

Operators choose modes from this section, so it comes before the mechanism.

### Two kinds of assertion, two defences

| Kind | Sources | Phase | Defends against | Satisfies `required`? |
|---|---|---|---|---|
| **Connection binding** | `Neotoma-Expected-Instance` header, `?expected_instance=` URL, proxy `--expect-instance`, CLI `--expect-instance` / `NEOTOMA_EXPECTED_INSTANCE`, peer sync's recorded remote id | Connection | Misroute only. A binding describes the connection itself, so it always matches whichever connector the agent picked. | **No.** It is checked for mismatch, never counted as intent. |
| **Per-write target** | `target_instance` tool argument; `params._meta["io.neotoma/expected_instance"]` set by a client from a routing decision or user choice; CLI `--target-instance` on a write command | Request | Misselection. | **Yes**, an id-form per-write target. |

A proxy never injects a per-write target from its own flag. It carries its binding only
as the connection header.

### What each configuration prevents

| Configuration on the receiving instance | Misroute (#2462) | Misselection, write carries a per-write target | Misselection, write carries no per-write target |
|---|---|---|---|
| `optional`, connection bound | Prevented | Prevented (mismatch) | **Admitted** |
| `warn`, connection bound | Prevented | Prevented (mismatch) | **Admitted**, with a warning (detection only) |
| `required`, connection bound | Prevented | Prevented (mismatch) | Rejected, `ERR_TARGET_INSTANCE_REQUIRED` |
| Any mode, no binding | Not prevented unless a per-write target is present | Prevented (mismatch) | As the mode row above |

"Prevented" assumes the receiving server runs this check, or the client runs the echo
rule in "Acknowledgement and capability" below.

**The motivating case holds only when all of these are true:**

1. Every instance that could receive a confidential write runs `required`.
2. Every write's per-write target comes from a routing rule, or from the user's choice
   resolved through the local registry. It never comes from the connection the write
   travels on.
3. Clients run the echo rule, or every reachable server runs the check.

Under these conditions, a confidential write sent through the wrong connector is
rejected. If it carries the finance id, the wrong instance answers with a mismatch. If
it carries no target, a `required` instance answers that a target is required. An
ordinary write sent through the finance connector is rejected the same way.

**Reads.** `read_assertion` defaults to `optional`. By default, an unasserted read can
pull confidential content into a context that then writes elsewhere. Operators of a
confidential instance should set `read_assertion: required`.

**What the server cannot catch:**

- An agent that does not recognise data as confidential, and so asserts the target its
  routing rule names for ordinary data, is admitted.
- An agent that copies the served id into its per-write target, against its
  instructions, is admitted.
- A user who confirms the wrong Neotoma when enrolling it in the registry gets writes
  admitted to that Neotoma.

The check makes routing decisions verifiable; it cannot make them.

**Non-goals.**

- **Not access control.** The instance id is public by design. This guards against
  accidents among honest Neotoma servers.
- **No guarantee against a hostile or impersonating endpoint.** Such an endpoint can
  return any public id. That guarantee would need server authentication (a signed server
  card or TLS identity), which is outside this design.
- **No disclosure protection.** A rejected write has already sent its payload to the
  wrong server; the check stops persistence only. Rejected request bodies must stay out
  of request logs, error reporters, and audit event contents (test 12 checks this).
- **No automatic routing.** Choosing the connector stays out of scope, as #2381 ruled.

## Prior art this design builds on

- **#2381** specifies an optional, operator-configured display label
  (`NEOTOMA_INSTANCE_TITLE`, surfaced as `serverInfo.title`). It rules that a label is
  never authorization and never a write-destination selector. The title stays for
  humans, and the check keys on a separate stable id.
- **#2462** asks for an additive `instance` object on `GET /session` and
  `get_session_identity`, with the fields its engineering spec lists. This design
  **extends** that object with `instance_id`, `title`, `target_assertion`,
  `read_assertion`, and pending identity or mode operations. It does not replace the
  #2462 fields.
- **Instance policy** (`src/services/instance_policy.ts`) supplies the admission
  pattern: whole-request reject with `0 persisted`, a denied versus unavailable split,
  and a structural write-path test.
- **Rules design** (#2565). Category-to-instance routing is a #2565 rule that produces
  the per-write target.

## Design

### (a) Instance identity and title

**Instance id.** A dedicated single-row identity record outside the entity graph holds:

- `instance_id`: `nti_` followed by 26 Crockford base32 characters from 128 random bits;
- `created_at`;
- the serving location last recorded: the public origin, or the database path for a
  local instance.

It is unreachable from `store`, `correct`, `merge`, `delete`, `restore`, and peer sync.
The server resolves it once, when the database handle opens, not per request. That keeps
pre-auth checks off the database and still catches a swapped file.

The id is **bound to the database, not to the process configuration.** This is what
catches #2462: there the configuration was right and the data store was wrong. An id
derived from configuration, hostname, or environment would have matched. Consequences:

- The id is not settable by environment variable, flag, or any free-form argument.
- It survives restarts, upgrades, host moves, and restores of the same database.
- Peer sync never copies the identity record.

**When an id is minted.** Only on first initialisation of an empty database, or by the
one-time, ledgered upgrade migration on a pre-feature database. **Startup never mints an
id over existing data.** A pre-feature backup restored onto a new server goes through
the migration and gets a new id. Clients bound to the old id then fail closed by
mismatch.

**Identity states and what serves them:**

| State | Writes | Asserted reads | Unasserted reads | Code |
|---|---|---|---|---|
| Readable, location unchanged | Normal admission | Normal | Per `read_assertion` | (none) |
| Unreadable, or present but malformed | Refused | Refused (an unknown identity never matches) | Per `read_assertion` from the settings record; results carry `instance_id: null` and no acknowledgement, so echoing clients discard them | `ERR_TARGET_INSTANCE_UNAVAILABLE`, retryable |
| Missing on a non-empty database whose ledger records it | Refused | Refused | As for unreadable | `ERR_TARGET_INSTANCE_IDENTITY_MISSING`, not retryable |
| Serving location changed, instance `required` | Refused until confirmed | Normal | Normal | `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED`, not retryable |
| Serving location changed, otherwise | Normal, warning in result body | Normal | Normal | (none) |

**Identity commands and their authority.** `neotoma instance restore-identity`,
`neotoma instance reidentify`, and `neotoma instance confirm-move` share these rules:

- They take the same authority as mode changes: an admin credential, through an operator
  channel outside MCP, never an agent-scoped token, never an entity path.
- Each is audited and shown in `/session` and `describe_instance_policy`.
- **`restore-identity`** runs only while the identity record is missing. It takes the id
  only from an identity export of *this* database, never as a free-form argument.
  `neotoma instance export-identity` writes that export, and backups include it. It
  carries the id plus a fingerprint of the database's earliest records. The command
  refuses an export whose fingerprint does not match the database it is restoring into.
- **`reidentify`** mints a fresh random id. It never accepts a supplied id.
- **`confirm-move`** records the new serving location. It refuses while the previous
  location still answers with the same id, or still holds a database with that id, and
  directs the operator to reidentify one of the two. Confirming a copy as a move can
  therefore never leave two live databases sharing one id.
- **Error hints name the operator as the actor and give no command arguments.** Example
  for identity missing: "This Neotoma's identity record is missing, so it cannot confirm
  which instance it is. Its operator must restore it from this database's own backup.
  Tell the user; do not retry." No hint suggests running any identity command with a
  client-supplied id.

**Title.** As specified in #2381: `NEOTOMA_INSTANCE_TITLE`. It is trimmed and
NFC-normalized, and blank means unset. It is at most 120 characters with no control
characters, and it is visible to any connecting client, including unauthenticated
discovery. A title is not unique, not authenticated, and never sufficient to admit a
write on a `required` instance.

**Short id.** `nti_` followed by the first 6 characters after the prefix, for example
`nti_7m2k9q`.

**Where the identity appears.** One resolver supplies the same `{ instance_id, title }`
to every surface:

| Surface | Carrier |
|---|---|
| MCP `initialize` | `serverInfo.title`; `InitializeResult._meta["io.neotoma/instance"]`; capability flag. `serverInfo.name` stays `"neotoma"`. |
| Every MCP tool result | `_meta["io.neotoma/instance"]` with `instance_id`, `title`, `assertion_checked`. A content identity line, appended as a separate text item after the existing content (following the runtime-update-notice pattern), never edited into `content[0]`. |
| Every REST response | `Neotoma-Instance-Id`, `Neotoma-Instance-Title`, `Neotoma-Assertion-Checked` headers. |
| `GET /session`, `get_session_identity`, CLI `auth session` | The extended #2462 `instance` object. |
| `describe_instance_policy` and its instructions renderer | `target_assertion`, `read_assertion`, pending loosening, pending identity operations. |
| Server card | `serverInfo.title` and an `instance` block. |

**Content identity line wording.** The line has three forms:

- `Neotoma instance: Personal graph (nti_7m2k9q); target checked`;
- `...; no target asserted`;
- `...; identity unknown, result unverified`.

The implementing slice records, as a committed evidence artifact, which carriers reach
the model in Claude Code, Claude Desktop, and Cursor. The line is plain text, and stored
content echoed in a result could carry a look-alike line. Clients that can read `_meta`
rely on `_meta`.

**Correlation.** A stable, unauthenticated id on every response can correlate a
self-hosted instance across addresses. The design accepts this, because the id must be
readable before authentication for misroute diagnosis and preflight. The operator setup
docs state the trade-off.

### (b) Declaring the intended instance

#### Where a per-write target must come from

A per-write target catches misselection only if its value comes from intent and is
independent of the connection the write travels on. There are two valid sources:

1. **A routing rule.** This is a #2565 rule mapping a data category to an instance id,
   with the title alongside for display.
2. **The user's choice, resolved through the local registry.** See below.

The served instance's own identity is never a valid source. That covers headers, result
`_meta`, the content line, instructions, `get_session_identity`, and the server card,
all of which are for display and verification. Connection bindings are not valid
sources either, since they describe the connection.

#### The local instance registry

Users name Neotomas by title, titles do not satisfy `required`, and copying the served
id is forbidden. A user's answer therefore needs a trusted mapping from title to id that
does not come from the connection being written to.

- **What it is.** A local, user-confirmed list of the user's Neotomas. Each entry holds
  a title or user-chosen alias, the `instance_id`, the short id, and the connector key.
  It is kept by the client, plugin, or CLI configuration on the user's machine, never on
  any Neotoma instance.
- **How entries are added.** Only through enrollment: `neotoma instance enroll`, run by
  `neotoma mcp config` when the user connects each Neotoma, or run on its own.
  Enrollment reads the served id and title once, through preflight. It shows them to the
  user, who confirms them or gives an alias. Aliases must be unique within the registry;
  the user disambiguates a colliding title at enrollment. Enrollment is a user action
  through the CLI. Harness hook packages deny agent tool calls that edit the registry
  file where the harness can refuse tool calls. Every change is logged locally.
- **Why it is not an echo.** At write time the agent reads the registry, not the
  connection. The user's words pick the entry, and the entry was confirmed by the user
  at enrollment, independently of whichever connector the agent is about to use. The
  registry is never updated from a connection at write time.
- **How the agent uses it.** The plugin's session-start hook, or
  `neotoma instance registry list` for the CLI, exposes the registry to the agent. When
  the user names a target ("Finance graph"), the agent looks up that alias and asserts
  the entry's id as `target_instance`. If the routing rule's title differs from the
  registry alias, the agent shows the user the title and short id to confirm. A
  confirmed choice may be saved as a routing rule, so the next write has a source.
- **No entry, or several.** If the name matches no entry, the agent does not write to a
  `required` instance and never falls back to a served id. It tells the user the
  Neotoma is not enrolled and gives the enrollment command to run. If several entries
  could match, which only happens with a near-miss name since aliases are unique, the
  agent lists them by alias and short id and asks the user to choose.

#### Assertion grammar

- Id: `^nti_[0-9a-hjkmnp-tv-z]{26}$`.
- Title (connection bindings and `optional` or `warn` modes only): `title:<text>`.
  The text is trimmed, NFC-normalized, compared case-sensitively, at most 120
  characters, with no control characters.
- Empty, whitespace-only, or malformed values are rejected with
  `ERR_TARGET_INSTANCE_MALFORMED` and never echoed.
- Repeated headers, repeated query parameters, and multiple sources must all match;
  there is no first-wins.
- `target_instance` is string-only and MCP-only. It is defined once in OpenAPI and
  injected by the tool-definition builder. The exact top-level key is removed before the
  tool's own validation, so it passes `.strict()` schemas and is never stored. REST
  carries a per-write target in a `Neotoma-Target-Instance` request header, distinct
  from the binding header. The CLI carries it as `--target-instance`.

**Composition.** Every assertion present must match the served instance. A connection
bound to A carrying a per-write target of B is rejected even when served by A.

#### Acknowledgement and capability

A server without the check ignores the headers and URL parameter and strips
`target_instance` (MCP argument schemas strip unknown keys). The protection therefore
cannot rely on the server that is reached.

- **Capability.** `initialize` advertises
  `capabilities.experimental["io.neotoma/target_instance_check"] = { "version": 1 }`.
- **Acknowledgement.** When assertions were evaluated and all matched,
  `_meta["io.neotoma/instance"].assertion_checked` is `true`, the
  `Neotoma-Assertion-Checked: true` header is set, and the content line says "target
  checked".
- **Client echo rule.** Every asserting client checks the served `instance_id` on every
  response, including responses after preflight. This covers the proxy, SDK, CLI, and
  hooks that can read results, so a backend that changes mid-session is caught. A
  missing id, missing acknowledgement, or different id is a mismatch:
  - **On a read**, the result is discarded.
  - **On a write**, the client raises `ERR_TARGET_INSTANCE_UNVERIFIED` and surfaces the
    returned entity ids as possibly misplaced. It then stops further writes on that
    connection until the user reviews them and resets the connection: `neotoma mcp
    proxy` restart, a client reconnect, or CLI `--reset-unverified`.
- **Preflight.** The proxy and CLI check the capability and id before any tool call.
  `--expect-instance` implies `--session-preflight` and `--fail-closed`, and an empty
  value refuses to start.
- **Agent rule.** If the agent asserted a target and the write result's content lacks
  "target checked", the write is unverified. The agent makes no further write and tells
  the user.

### (c) Server admission

**Two phases.** `/mcp` authenticates in its route handler before JSON-RPC dispatch.

1. **Connection phase, pre-auth.** Binding assertions are checked in the `/mcp` route
   and in a REST middleware ahead of authentication and `unknownFieldsGuard`. Pre-auth
   rejections write no audit events, only a rate-limited log line.
2. **Request phase, post-auth.** Per-write targets are checked in the MCP `tools/call`
   dispatcher, and REST per-write targets in route middleware after auth. Both run
   before the handler and before any write.

The CLI offline path checks against the local identity record. A structural test pins
every entry point to its phase. The envelope-level check also covers raw and file
storage.

**Effect classification.** Write admission keys on the **server's own effect
classification**, never on client-visible hints:

- Each tool and REST operation declares `effect: read | write` in the server-side tool
  registry and route table.
- `readOnlyHint` is generated from that declaration as output, never read as input.
- A missing or unknown classification is treated as a write **at runtime**, not only
  in CI.
- A structural test runs every read-classified tool and route and asserts that every
  table's row count is unchanged, so a misclassified tool fails.

**Modes.** There are two independent, tighten-only axes:

| Setting | Values | Default | Effect when no per-write target is present |
|---|---|---|---|
| `target_assertion` | `optional`, `warn`, `required` | `optional`; `warn` for newly created hosted instances; existing upgraded instances `optional` | `optional`: admitted. `warn`: admitted, with a warning in the result body and an audit event. `required`: write rejected with `ERR_TARGET_INSTANCE_REQUIRED`. A connection binding does not count. |
| `read_assertion` | `optional`, `required` | `optional` | `required`: ordinary reads rejected. Identity and discovery calls stay exempt: `initialize`, `get_session_identity`, `GET /session`, the server card, and `describe_instance_policy`. |

Under `required`, only an id-form per-write target satisfies a write. Under `warn`, a
title-only target is admitted but still warns. `warn` is observability and never a
protection setting.

**Where the modes live.** In a separate admission-settings record outside the entity
graph, not on the identity record.

- The slice-4 migration creates the record once, with `optional` for every existing
  instance, and records this in the migration ledger.
- New instances are created with `optional`, or `warn` if hosted. Only an operator
  setting up a confidential instance chooses `required`.
- The record resolves both axes to `required` only when the ledger says it was created
  and it is now missing or unreadable.
- Environment variables and #2565 rules may tighten a mode, never loosen it.

**Who can change a mode.** An admin credential, through an operator channel outside MCP
and agent tokens, never through any entity path.

- Tightening is immediate.
- Loosening needs an explicit confirm flag and a cancellable cooling delay (default 24
  hours). It is audited and shown as pending.
- This depends on admin-gating of instance policy writes, which slice 4 establishes and
  defines first.

**Errors.** One family, the standard envelope in `docs/subsystems/errors.md`
(`error_code`, `message`, `hint`, `details`). On REST it is the body. On MCP it goes in
JSON-RPC `error.data`, on the same JSON-RPC error path for both phases, with the
JSON-RPC `error.code` named per row when registered. All codes and headers are declared
in `openapi.yaml` and `errors.md` before implementation.

| Code | HTTP | Retryable | When |
|---|---|---|---|
| `ERR_TARGET_INSTANCE_MISMATCH` | 421 | No | An assertion names a different instance |
| `ERR_TARGET_INSTANCE_REQUIRED` | 428 | No | `required` mode and no id-form per-write target |
| `ERR_TARGET_INSTANCE_MALFORMED` | 400 | No | Empty or malformed assertion |
| `ERR_TARGET_INSTANCE_UNAVAILABLE` | 503 | Yes | Identity or settings record unreadable or malformed (transient) |
| `ERR_TARGET_INSTANCE_IDENTITY_MISSING` | 503 | No | Identity record missing over existing data (operator action) |
| `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED` | 409 | No | Serving location changed on a `required` instance (operator action) |
| `ERR_TARGET_INSTANCE_UNVERIFIED` | client-raised | No | Client echo rule failed |

Mismatch example. The server knows its own title and the asserted id, never the asserted
instance's title:

```json
{
  "error_code": "ERR_TARGET_INSTANCE_MISMATCH",
  "message": "This request was meant for instance nti_4x8r2w... but reached Personal graph; 0 persisted.",
  "hint": "Do not retry on this connection. Find the id you asserted in your local Neotoma registry and use that entry's connector. If no entry has it, ask the user which Neotoma is intended.",
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
  "hint": "Set target_instance to the id your routing rule names for this data, or the id of the Neotoma the user names, looked up in your local registry. Do not copy this connection's own id. If the user's Neotoma is not in the registry, tell them to enroll it.",
  "details": { "served_instance": { "title": "Finance graph" } }
}
```

Hint rules:

- Hints never offer the served id as a value to retry with.
- The required envelope's body carries no served id. Response headers still carry it,
  as on every response.
- The mismatch hint points to the local registry. Agents without a registry fall back
  to `get_session_identity` on each connection *only to find the connector for an id
  they already hold from a rule or the registry*, and to asking the user.
- No payload fragment is ever echoed.
- An agent relaying a mismatch names the asserted side by its registry alias or
  routing-rule title.

**No partial write.** Both phases precede the store transaction, so nothing persists in
any table.

**Peer sync.** The operator supplies or confirms the expected remote id at `add_peer`,
from the local registry or out of band, never copied from the connection being added.
It is stored outside the entity graph under the same admin gate. Outbound sync asserts
it as a connection binding, which is correct for sync. Inbound sync to a `required`
instance is an ordinary write and needs the receiving id as a per-write target; there is
no exemption. A `required` instance cannot receive sync from a pre-feature peer, and the
docs say so.

### (d) How it shows up for users in Claude

- **Connector naming.** `neotoma mcp config` writes new keys as
  `neotoma-<slug of title>`.
  - An untitled instance gets `neotoma-<short id without prefix>`.
  - A colliding slug gets `-<short id without prefix>` appended.
  - The scan never overwrites a key bound to a different id.
  - **It never renames an existing key** unless the user opts in. In Claude Code the
    key prefixes every tool name, so a rename breaks permission allowlists, hooks, and
    skills; the scan warns about the tool-name change when the user opts in.
  - Enrollment in the local registry happens in the same step.
  - Remote connectors added by URL are named by title, with `?expected_instance=` in the
    URL, and enrolled with `neotoma instance enroll`.
- **Instructions.** The first line reads: "This connection is the Neotoma instance
  'Personal graph' (nti_7m2k9q). Before a write, set `target_instance` to the id your
  routing rule names for the data, or the id of the Neotoma the user names, looked up in
  your local registry. Never copy this connection's own id. If neither names a target,
  ask the user." This is advisory (#2187).
- **CLI agent instructions.** The same rules are mirrored into
  `docs/developer/cli_agent_instructions.md`: per-write target sources, the registry,
  never echoing the served id, `--target-instance` per write versus `--expect-instance`
  or `NEOTOMA_EXPECTED_INSTANCE` as a binding, and the header format.
- **Turn-summary header.** `🧠 Neotoma · <title> — [<conversation>]`, with the short id
  when the instance is untitled. The decoration carries no meaning. Both display-rule
  locations change (`src/server.ts`, `docs/developer/mcp/instructions.md`).
  `neotoma_turn_summary` returns `instance` and prefixes `status_line` with the title.
  For a turn across several instances, the agent assembles one line per instance from
  each instance's own summary.
- **Rejections in the transcript.** "That write was refused by Personal graph; it was
  meant for Finance graph." The agent takes "Finance graph" from the registry or the
  routing rule, and does not retry on the same connection.

## Tests that would prove it

Every proof test is shown red in its implementing PR. Where the plumbing is new, the PR
keeps the plumbing and reverts only the admission or verification logic, so the test
fails for the reason under test. This is an acceptance criterion of every implementing
PR.

**Server admission**

1. **Planted red, misroute.** Two in-process instances A and B. A client bound to A,
   with its transport pointed at B, sends a write. Expect `ERR_TARGET_INSTANCE_MISMATCH`,
   B unchanged in every table, A untouched. With the check reverted, the test asserts
   the write landed in B and fails.
2. **Planted red, identity source.** Same configuration, swapped database file: the
   served id changes.
3. **Planted red, misselection (motivating case).** A routing rule maps a category to F.
   A write of that category with `target_instance = F.id` is sent through P's
   connection. P rejects it with a mismatch, and zero rows land on P. Variant: the agent
   follows P's served instructions, and the write is still rejected.
4. **Planted red, binding does not satisfy `required`.** Two connections bound by the
   config scan: F in `required`, P in `required`.
   - (i) An ordinary write through F's connection with no per-write target returns
     `ERR_TARGET_INSTANCE_REQUIRED`, zero rows on F.
   - (ii) A confidential write through P's connection with no per-write target returns
     `ERR_TARGET_INSTANCE_REQUIRED`, zero rows on P.
   - (iii) The same writes with the correct per-write target are admitted only on the
     intended instance.
   - (iv) A proxy configured with `--expect-instance` never emits the per-write `_meta`
     key.

   With binding-satisfies-required reintroduced, (i) and (ii) go red.
5. **Hints.** Mismatch and required hint texts never contain the served id. The required
   envelope *body* carries no served id; response headers still do.
6. **No partial write, and no payload in sinks.** Send a 50-entity batch with
   relationships and a raw file, with a mismatched target. Zero new rows in sources,
   observations, raw fragments, relationship observations, and timeline events.
7. **Matrix.** Covers:
   - sources: tool argument, `_meta`, `Neotoma-Target-Instance`, binding header, URL,
     proxy flag, CLI `--expect-instance`, CLI `--target-instance`, CLI environment
     variable, CLI `--offline`;
   - outcomes: match, mismatch, absent, malformed;
   - every mode on both axes, for reads and writes.

   The discovery calls succeed unasserted under `read_assertion: required`, and an
   ordinary read is rejected.
8. **Conflicting assertions.** A binding of A with a per-write target of B, served by A,
   is rejected.
9. **Grammar.** Repeated header and query values, empty, whitespace, non-string, over
   length, control characters, NFC and whitespace variants, and case differences.
10. **Title targets.** Admitted under `optional`; warned under `warn`; insufficient under
    `required`; the same-title collision case.
11. **Effect classification.**
    - Every tool and route declares an effect, and `readOnlyHint` matches it.
    - An undeclared tool is treated as a write at runtime.
    - Every read-classified tool and route leaves all row counts unchanged.
    - Every entry point reaches its phase.
    - `target_instance` passes `.strict()` schemas and is never stored.
12. **Ordering and sinks.** A connection-phase mismatch on an unauthenticated request
    returns the mismatch error and writes no audit event. A sentinel string planted in
    a rejected payload appears in no request log, error report, or audit event.
13. **Envelope parity.** REST and MCP envelopes, status codes, `retryable`, and JSON-RPC
    codes match the table.

**Identity, commands, and modes**

14. **Planted red, unknown identity.** Make the identity resolver throw, then send:
    - (i) a write with a correct target under `optional`;
    - (ii) an unasserted write under `required`;
    - (iii) an asserted read.

    All are refused. An unasserted read follows `read_assertion` and carries
    `instance_id: null` with no acknowledgement. A present but malformed record behaves
    the same way. Replacing fail-closed with fail-open goes red.
15. **No re-mint, and the settings migration.**
    - Delete the identity row on a ledgered non-empty database: startup does not mint,
      and writes return `ERR_TARGET_INSTANCE_IDENTITY_MISSING`.
    - The identity migration mints exactly once.
    - The settings migration creates `optional` on an upgraded instance, and unasserted
      writes keep working.
    - A ledgered settings record that is then deleted or made unreadable resolves both
      axes to `required`: an unasserted write and an unasserted ordinary read are both
      rejected.
16. **Mode and identity-command authority.**
    - Mode changes and every identity command are refused through any MCP tool, an
      agent-scoped token, `store`, or `correct`.
    - With an admin credential they succeed and are audited.
    - `restore-identity` is refused while an identity record exists, is refused with a
      free-form id, and is refused with an export from another database (fingerprint
      mismatch). It succeeds with this database's own export.
    - `reidentify` accepts no id.
    - `confirm-move` is refused while the old location still answers with the same id.
    - Loosening without confirm is refused. With confirm, it waits for the cooling
      delay. Cancelling the pending change restores the old state.
    - The `IDENTITY_MISSING` hint names no command and no id.
    - Environment variables only tighten.
    - Newly created hosted instances default to `warn`.
17. **Peer sync.**
    - The identity record never syncs.
    - `add_peer` takes the expected id from operator input, never from the peer's served
      identity, and an agent cannot change it through `correct`.
    - Inbound sync to `required` without the receiving id as a per-write target is
      rejected.
18. **Clones and moves.**
    - Clone tooling gives a new id; restore keeps the id.
    - A raw copy keeps the id. Served elsewhere on a `required` instance, it returns
      `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED`; an `optional` instance warns.
    - `confirm-move` refuses while the original still answers.

**Clients and registry**

19. **Planted red, server without the check.**
    - (i) A proxy bound to A refuses at preflight.
    - (ii) A client writes asserting A, and the response has no acknowledgement:
      `ERR_TARGET_INSTANCE_UNVERIFIED`, entity ids surfaced, no further write until
      reset.
    - (iii) A response carrying the acknowledgement but a different id is a mismatch.
    - (iv) A read without acknowledgement is discarded.
    - (v) The backend changes mid-session after preflight, and the proxy echo rule
      catches it.

    Removing the echo rule goes red.
20. **Proxy startup.** An empty `--expect-instance` refuses to start. A preflight id
    that differs refuses to serve, naming both ids. The binding is fail-closed.
21. **Surface parity** across `initialize`, result `_meta` and content line, REST
    headers, the server card, `/session`, `get_session_identity`, CLI `auth session`,
    and `describe_instance_policy`.
22. **Registry.**
    - Enrollment requires user confirmation, enforces unique aliases, and logs changes.
    - The registry is never updated during a write.
    - Hook packages deny agent edits to the registry file where the harness supports it.
    - A title with no entry produces no write to a `required` instance and no served-id
      fallback.
23. **Connector naming.**
    - An untitled instance gets the short-id key, and a collision gets a suffix.
    - The scan does not overwrite a key bound to another id.
    - It does not rename an existing key without opt-in, and warns when the user opts
      in.
24. **Turn summary.** The title, or `nti_` plus 6 characters, appears in both
    display-rule locations and in `status_line`.

**Agent behaviour (evals, committed in the implementing slices)**

25. **Routing.** Two connected instances and a routing rule. The store call's
    `target_instance` equals the rule's id, never the served id of the connection used,
    and no row lands on the other instance.
26. **User names the target.** A `required` instance with no routing rule, and the user
    names the target by title.
    - The agent resolves the title through the registry, completes the write with the
      correct id, and the same write sent through the other connection is still
      rejected.
    - Variant with no registry entry: the agent writes nothing and tells the user to
      enroll.
27. **Stop after mismatch.** The agent receives a mismatch envelope. It makes no second
    write on that connection (`request_count`), and its reply names both instances.
28. **Stop on a missing acknowledgement.** The agent asserted a target, and the result
    content lacks "target checked". The agent makes no further write and flags the
    write to the user as unverified.
29. **Header.** The `display_rule_neotoma_section` scenario shows the title, or the
    short id when the instance is untitled.

## Implementation slices

Slices 1 to 3 close the misroute class without depending on agent behaviour, and land
first. Every slice takes the arch gate.

1. Identity record, mint and fail-closed rules, the identity states table, the identity
   commands with admin authority, export and fingerprint, the `instance` object, the
   title. Errors and headers are declared in `openapi.yaml` and `errors.md` first.
2. Result `_meta`, the content line, REST headers, the capability flag, the
   acknowledgement, the server card.
3. Connection-phase admission, proxy and CLI bindings with preflight and the echo rule,
   effect classification, the structural tests.
4. Request-phase admission, the settings record and migration, the modes, admin-gated
   changes, and audit. Depends on admin-gating of instance policy writes.
5. The local registry and enrollment, config-scan naming, the operator and CLI agent
   docs.
6. The turn-summary header, the instructions line, the agent evals.
7. Peer sync.

## Decisions on the six open questions

1. **Cloned databases.**
   - Arch: clone tooling mints a new id, restore keeps it, and an id derived from the
     serving location is rejected.
   - Security: record the serving location; on a change, `required` blocks writes until
     confirmed.
   - **Decision: both.** Tooling distinguishes clone from restore. The identity record
     stores the last serving location, and a change blocks writes on `required`
     instances until `confirm-move` and warns elsewhere. `confirm-move` refuses while
     the original still answers, so a copy cannot be confirmed into a duplicate id.
2. **Reads under `required`.**
   - Arch and security: a separate opt-in axis, with discovery calls exempt.
   - Pm: decide this before slice 4.
   - **Decision:** `read_assertion`, default `optional`. The guarantees section
     recommends `required` for confidential instances.
3. **Loosening.** The lenses disagreed.
   - Arch: no second actor in the first version.
   - Security: a second actor or a cooling delay.
   - **Decision:** an admin channel outside MCP and agent tokens, an explicit confirm, a
     cancellable 24-hour cooling delay, audit, and visibility. The delay works on
     single-operator instances. #2565 two-actor retirement is opt-in when it lands. The
     same authority now covers the identity commands.
4. **Hosted default.**
   - **Decision:** `warn` for newly created hosted instances, as detection only.
     Existing instances stay `optional` through the settings migration.
5. **Reserved argument.**
   - **Decision:** top-level, MCP-only, string-only, conditional on the acknowledgement
     and capability. REST uses `Neotoma-Target-Instance`; the CLI uses
     `--target-instance`.
6. **Envelope-level setting or #2565 rule.**
   - **Decision:** envelope-level, evaluated before the rules resolver. Rules may
     tighten it, never loosen it. Routing is a #2565 rule that produces the per-write
     target.

## References

- #2589 design issue
- #2381 serverInfo.name is hardcoded on every instance
- #2462 a session configured for a hosted instance served a local database
- #2565 rules design
- #2187, #2368 handshake metadata not reaching clients
- `src/services/instance_policy.ts` admission pattern
- `src/server.ts` initialize handler, display rule, runtime update notice, `getServerInfo`
- `src/actions.ts` `/mcp` route and middleware order
- `src/tool_definitions.ts` tool annotations
- `src/mcp_server_card.ts` server card
- `src/cli/mcp_proxy.ts` proxy options and session preflight
- `src/services/turn_summary.ts` turn summary
- `docs/subsystems/errors.md` error envelope family
- `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`
