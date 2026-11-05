---
title: "Target-instance check: data-class admission, stable instance identity, asserted targets"
status: "proposal"
source_plan: "n/a (authored directly as a proposal, not migrated from a plan)"
migrated_date: "n/a (authored 2026-10-07)"
priority: "p1"
estimated_effort: "Medium to large: admin-set admission settings with data classes, identity record, two-phase admission, client acknowledgement check, human-only local registry, surface parity, docs"
---

# Target-instance check

Design only. No implementation in this change. Design issue: #2589.

**Revision 4 changes the shape.** Each earlier revision closed one client-side gap and
opened another. The cause is that every defence against misselection depended on the
client: per-write targets, the local registry, and hooks. Revision 4 adds a
**server-side data-class admission layer** that works on every client. Each Neotoma
declares, as admin-set settings, which data classes it accepts and refuses. A
wrong-connector write of classified data is then rejected by its content, with no client
cooperation. Per-write targets, connection bindings, and the registry stay, as
additional layers for clients that support them. A per-client table states what each
client gets.

Other changes in revision 4:

- **Registry enrollment is human-only.** It goes through an interactive confirmation an
  agent cannot answer. There is no stdin or assume-yes path, and agents are never handed
  a command to run.
- **The registry has defined rules:** title matching, refresh after reidentify, a
  location, and a format.
- **Echo routes back to the served id are closed.**
- **Effect is declared once per operation,** and the effect test detects in-place
  updates.
- **The fingerprint's clone limitation is stated and narrowed.**
- **Consistency fixes:** the per-write `_meta` key is renamed, peer sync gets a
  per-write target, the unreadable-settings outcome is unified, and the assertion that
  satisfies `read_assertion: required` is defined.

Earlier revisions established the rest:

- an instance id bound to the database;
- unknown identity fails closed;
- the client acknowledgement check;
- connection bindings defend against misroute only;
- admin-only identity commands;
- the six open questions resolved.

## Problem

Every Neotoma server advertises the same `serverInfo.name` (`"neotoma"`). A client
connected to several instances sees only opaque connector ids, so the agent decides
"which Neotoma" itself and sometimes writes to the wrong one.

Two failure classes:

1. **Misroute.** The configuration names instance A, but the transport reaches instance
   B. Every call returns `success: true`. This is #2462.
2. **Misselection.** The client is connected to A and B correctly, but the agent picks
   the wrong connector for a write. #2381 anticipates this.

Motivating case, stated generically: a team runs several Neotoma instances, one holding
confidential finance data. That data must never land on another instance, and writes
meant for other instances must never land on it.

## The layered model

| Layer | Where it runs | Defends against | Needs client support |
|---|---|---|---|
| **0. Data-class admission** (floor) | Server, every write | Wrong-connector writes of *classified* data, in both directions; also misroute when the wrong instance refuses the class | None |
| **1. Connection binding** | Server (connection phase), proxy and CLI preflight | Misroute | Configurable header, URL, proxy, or CLI |
| **2. Per-write target** | Server (request phase) | Misselection of any data, including unclassified | An intent source: a routing rule, or the registry |
| **3. Client acknowledgement check** | Proxy, SDK, CLI, hooks | Servers without the check | Proxy, SDK, CLI, or hooks |

### What layer 0 catches and what it does not

**It catches** any write whose entities are of a class the receiving instance refuses,
or not of a class it accepts. Take a finance Neotoma that accepts only finance classes,
and general Neotomas that refuse them:

- a finance record sent through a general connector is refused by content;
- a CRM or engineering record sent through the finance connector is refused by content.

This needs no client cooperation, no registry, and no hooks.

**It does not catch:**

- **Unclassified free text.** Confidential figures written into a type that both
  instances accept (`note`, `document`, `conversation_message`, an uploaded file the
  instance accepts) are admitted wherever they are sent.
- **Misclassified data.** Finance figures written into a non-finance type, such as a CRM
  `opportunity`, are judged by their type, not their content.
- **New types that no list names.** In the default `evolving` schema mode, an agent can
  auto-create a new type. A refuse-list does not cover it. An accept-list does, which is
  one reason confidential instances should use accept-lists. Instances with refuse-lists
  should run `NEOTOMA_SCHEMA_MODE=guided`, where only bundle-provided types auto-create.

Layers 1 to 3 exist for these gaps, on clients that can carry them.

### What each client gets

"Admitted" means the wrong write lands; "refused" means it does not.

| Client | Misroute | Wrong connector, classified data | Wrong connector, unclassified data | User names the target on a `required` instance |
|---|---|---|---|---|
| **Claude Code with the Neotoma plugin** (hooks plus proxy) | Refused (binding, preflight, acknowledgement check) | Refused (layer 0) | Refused when a routing rule or registry lookup supplies a per-write target. Otherwise admitted under `optional` or `warn`, refused under `required`. | Works: registry lookup at write time, with exact match or the user's choice |
| **CLI** (human or agent shell) | Refused (`--expect-instance` or env binding, preflight, acknowledgement check) | Refused (layer 0) | As above, with `--target-instance` | Works: `neotoma instance registry list` read at lookup time |
| **Proxy only** (any stdio client without hooks) | Refused (binding, preflight, acknowledgement check) | Refused (layer 0) | Refused only when the agent sets `target_instance` from a delivered routing rule | Not available unless the client exposes the registry. Otherwise the agent says the registry is unavailable in this client. |
| **Claude Desktop chat, claude.ai, Cowork** (remote connector by URL, no local hooks or registry) | Refused when the connector URL carries `?expected_instance=` and the server runs the check. No client acknowledgement check, so a server without the check is not detected (the agent rule only). | Refused (layer 0) | Refused only when the agent sets `target_instance` from a routing rule delivered in instructions. Otherwise admitted under `optional` or `warn`, refused under `required`. | **Not available.** The agent says this client cannot resolve Neotoma names. A `required` instance used from these clients needs a routing rule, or its writes cannot proceed. |

### Recommended configuration for the motivating case

- **Finance Neotoma.**
  - An **accept-list** of the finance classes, plus the bookkeeping types it needs
    (`conversation`, `conversation_message`, and so on).
  - `raw_storage: refuse`, unless it holds source documents.
  - `read_assertion: required`.
  - `target_assertion: required` if every client used with it has routing rules or the
    registry. Otherwise `warn`, accepting the per-client limits above.
- **Every other Neotoma in the team.**
  - A **refuse-list** naming the finance classes.
  - `NEOTOMA_SCHEMA_MODE=guided`.
  - `raw_storage` set as its purpose requires.
- **Pin both with the tighten-only environment variables.** These survive a database
  restore to an older state.

Under this configuration, classified finance data cannot land outside the finance
Neotoma, and non-finance classified data cannot land inside it, from any client. The
remaining exposure is unclassified free text, and on Chat-type clients, writes with no
routing rule.

### Residual risks and non-goals

**Admitted and not detectable by the server:**

- An agent that puts confidential content in an unclassified type.
- An agent that does not recognise data as confidential.
- An agent that copies the served id into a per-write target, against the rules.
- A user who confirms the wrong Neotoma at enrollment.
- An agent with computer-use or browser control that answers an enrollment
  confirmation surface. That is outside this accident guard.

**Non-goals:**

- **Not access control.** The instance id is public by design. This is an accident guard
  among honest servers.
- **No defence against a hostile or impersonating endpoint.** That would need server
  authentication, which is outside this design.
- **No protection of the payload itself.** A rejected write has already sent its body to
  the wrong server; the check stops persistence only. Rejected bodies stay out of request
  logs, error reporters, and audit event contents (test 12).
- **No automatic routing**, per #2381.

## Prior art

- **#2381**: `NEOTOMA_INSTANCE_TITLE` surfaced as `serverInfo.title`. A label is never
  authorization.
- **#2462**: the `instance` object on `/session` and `get_session_identity`. This design
  extends it and does not replace it.
- **Instance policy** (`src/services/instance_policy.ts`):
  - `out_of_scope_entity_types`, `in_scope_entity_types`, and an `enforced` posture are
    the precedent for layer 0;
  - so are whole-request reject, the denied versus unavailable split, and a structural
    write-path test.
  - Layer 0 is their admin-set, bundle-aware, always-enforced successor. It reuses the
    instance-policy evaluator path, with its lists sourced from the admin-set settings
    record.
- **Bundles** (`docs/foundation/bundles.md`, `src/services/bundles/`, and the bundles
  PR #2595): bundles are named by `name`, and each declares `provides_entity_types`.
  Layer 0 uses that vocabulary for its selectors.
- **Rules design** (#2565): routing rules, approval by a member other than the author,
  and hook packages.

## Design

### (a) Instance identity and title

Unchanged in substance from revision 3, with a narrowed fingerprint.

- **Instance id.** A dedicated identity record outside the entity graph holds:
  - `instance_id`: `nti_` plus 26 Crockford base32 characters from 128 random bits;
  - `created_at`;
  - the last serving location, taken from server configuration only, never from request
    `Host` or forwarded headers.

  It is resolved once, when the database handle opens. It is unreachable from every
  entity path and from peer sync.
- **Bound to the database, not the configuration.** This is what catches #2462. The id
  is never settable by environment variable, flag, or argument.
- **When an id is minted.** Only on an empty database, or by the one-time ledgered
  upgrade migration. Never over existing data. At mint time the migration ledger records
  an **id commitment**: a hash of the id and a random mint nonce.

**Identity states:**

| State | Writes | Asserted reads | Unasserted ordinary reads | Code |
|---|---|---|---|---|
| Readable, location unchanged | Normal admission | Normal | Per `read_assertion` | (none) |
| Unreadable or malformed | Refused | Refused | Per `read_assertion`; results carry `instance_id: null` and no acknowledgement | `ERR_TARGET_INSTANCE_UNAVAILABLE`, retryable |
| Missing on a non-empty database whose ledger records it | Refused | Refused | As for unreadable | `ERR_TARGET_INSTANCE_IDENTITY_MISSING`, not retryable |
| Serving location changed, `required` instance | Refused until confirmed | Normal | Normal | `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED`, not retryable |
| Serving location changed, otherwise | Normal, with a warning in the result body | Normal | Normal | (none) |

**Identity commands.** `restore-identity`, `reidentify`, and `confirm-move` share these
rules:

- They require an admin credential, through an operator channel outside MCP. Never an
  agent-scoped token, and never an entity path.
- Each one is audited and shown in `/session` and `describe_instance_policy`.

Command by command:

- **`restore-identity`** runs only while the identity record is missing. It takes the id
  only from this database's own identity export, produced by
  `neotoma instance export-identity` and included in backups. The export carries the id,
  the mint nonce, and a fingerprint of the earliest records. The command refuses unless
  the export's id and nonce hash to **the id commitment in this database's ledger** and
  the fingerprint matches.
  - **Clone limitation, stated.** Clone tooling mints a new id and writes a new
    commitment, so an original's export fails against a tooling-made clone. A raw file
    copy made outside the tooling carries the original's ledger. An export then matches
    both copies, and the raw copy already shares the original's id. Raw copies stay a
    documented residual, handled by the serving-location check.
- **`reidentify`** mints a fresh id and commitment. It accepts no id.
- **`confirm-move`** is an **operator attestation** that the previous location is
  retired.
  - It refuses while the previous location still answers with the same id. The probe goes
    through the existing outbound URL guard.
  - It also refuses while the previous database path still holds a database with that id.
  - The probe checks a single moment. An original that is offline then and comes back
    later defeats it; that residual is stated in the operator docs.
- **Hints name the operator as the actor** and give no command and no id, for
  `IDENTITY_MISSING`, `MOVE_UNCONFIRMED`, and `UNAVAILABLE` alike. Example: "This
  Neotoma's location changed and its operator has not confirmed the move. Tell the user;
  do not retry."

**Title and short id.** The title follows #2381: trimmed, NFC-normalized, at most 120
characters, no control characters, public. The short id is `nti_` plus the first 6
characters after the prefix.

**Surfaces.** One resolver supplies every surface:

- `initialize`: `serverInfo.title`, `_meta["io.neotoma/instance"]`, and the capability
  flag.
- Every tool result: `_meta["io.neotoma/instance"]` with `instance_id`, `title`, and
  `assertion_checked`, plus a content identity line appended as a separate text item.
  The line reads "target checked", "no target asserted", or "identity unknown, result
  unverified".
- REST response headers: `Neotoma-Instance-Id`, `Neotoma-Instance-Title`, and
  `Neotoma-Assertion-Checked`.
- `/session`, `get_session_identity`, and CLI `auth session`: the extended `instance`
  object, including pending identity operations and pending loosening.
- `describe_instance_policy`: the modes, the data-class settings, and pending operations.
- The server card.

The implementing slice commits an evidence artifact showing which carriers reach the
model in Claude Code, Claude Desktop, and Cursor. The content line is plain text and can
be imitated by stored content, so clients that can read `_meta` rely on it.

### (b) Data-class admission (layer 0)

**Settings.** Data-class settings live in the admin-set admission-settings record, with
the modes. They are never in an entity, and no agent can write them.

| Setting | Values | Meaning |
|---|---|---|
| `accepted_classes` | List of selectors, or unset | If set, every entity in a write must match a selector, or the write is refused. |
| `refused_classes` | List of selectors | Any entity that matches is refused. Refuse wins over accept. |
| `raw_storage` | `accept`, `refuse` | Whether raw and reference file storage, which has no entity type, is admitted. |

**Selectors.**

- `bundle:<name>` matches every type in that bundle's `provides_entity_types`, using the
  bundle vocabulary of `docs/foundation/bundles.md` and #2595. For example,
  `bundle:crm`, `bundle:engineering`, `bundle:communications`, or a finance bundle once
  one exists in the catalog.
- `type:<entity_type>` matches a single type.

A bundle selector resolves through the bundle loader's own `provides_entity_types` at
evaluation time. A type added to a bundle is therefore covered without editing settings.
A selector naming an unknown bundle is a configuration error, refused at set time.

**What is classified.** Each entity in `store`, `correct`, and interpretation-extracted
entities, including those extracted from uploaded files. A relationship write is
admitted only if both endpoint types are admitted. Raw and reference file storage
follows `raw_storage`.

**Evaluation.**

- Admission runs in the request phase, after each entity's type is resolved and before
  any write.
- It is a whole-request reject with zero rows in every table, and every refused entity
  is listed.
- The check is in the instance-policy evaluator path, so it covers the same three entity
  write paths and the structural coverage test extends to it.
- If the settings record cannot be read, the check fails closed (see "Settings record
  states").

**Error.** `ERR_DATA_CLASS_REFUSED`, HTTP 403, not retryable. Details list each entity's
index, `entity_type`, and the matched or unmatched selector. Hint: "This Neotoma does not
accept `<class>` data; 0 persisted. Do not retry here. Store it on the Neotoma your
routing rule names for this data, or ask the user." The hint carries no served id and no
payload fragment.

**Who sets it.** The same admin authority as modes:

- Tightening is immediate: adding a refused class, removing an accepted class, or setting
  `raw_storage: refuse`.
- Loosening needs an explicit confirm and a cancellable cooling delay (default 24 hours).
  It is audited and shown as pending.
- `NEOTOMA_REFUSED_CLASSES` adds to the stored refuse-list, and
  `NEOTOMA_ACCEPTED_CLASSES` intersects with the stored accept-list. Both only tighten.
- #2565 rules may tighten, never loosen.
- This depends on admin-gating of instance-policy writes, which slice 1 establishes.

### (c) Declaring the intended instance (layers 1 and 2)

**Two kinds of assertion.**

| Kind | Sources | Phase | Defends against | Satisfies `required` |
|---|---|---|---|---|
| **Connection binding** | `Neotoma-Expected-Instance` header, `?expected_instance=` URL, proxy `--expect-instance`, CLI `--expect-instance` or `NEOTOMA_EXPECTED_INSTANCE` | Connection | Misroute only | No. It is checked for mismatch only. |
| **Per-write target** | `target_instance` tool argument; `params._meta["io.neotoma/target_instance"]` set by a client from a routing decision or registry lookup; REST `Neotoma-Target-Instance`; CLI `--target-instance` | Request | Misselection | Yes, in id form |

The per-write `_meta` key is `io.neotoma/target_instance`. "Target" always means
per-write, and "expected" always means binding. No proxy, SDK, or hook package fills the
per-write key from its own connection configuration. Doing so would be a binding in
disguise (test 4).

**Valid sources for a per-write target:**

1. **A routing rule.** A #2565 rule mapping a data category to an instance id and title.
   It is usable as a source only if it is an approved rule (approved by a member other
   than its author, per #2565). Where the registry is available, its id must also match
   a registry entry.
2. **The user's choice, resolved through the local registry.**
3. **For peer sync, the operator-confirmed remote id** recorded at `add_peer`. It is
   operator input, not read from the connection.

**Never sources.** These identify the instance for display and verification only:

- the served instance's own identity: headers, `_meta`, the content line, instructions,
  `get_session_identity`, and the server card;
- any connection binding.

**Echo routes closed.** A registry lookup key comes only from the user's words or a
routing rule. It never comes from:

- the connector in use;
- a title named in an error envelope;
- the instructions;
- the turn-summary header;
- any other served surface.

The agent never does a reverse lookup from a connector or a served title to an id. The
Claude Code hook package enforces this mechanically with a **self-target check**. When a
write's per-write target equals the registry id of the connector being called, the hook
denies the call and asks the user, unless that entry's alias appears in the user's
prompt this turn or in an applicable approved routing rule.

#### The local instance registry

- **Location and format.** One shared per-user file,
  `$XDG_CONFIG_HOME/neotoma/instances.json`, defaulting to
  `~/.config/neotoma/instances.json`. Every carrier reads it: the CLI, the Claude Code
  plugin, and hook packages. Its versioned format is
  `{ "version": 1, "entries": [ { "alias", "instance_id", "short_id", "connector_key",
  "serving_location", "confirmed_at", "state" } ] }`. There is **one entry per
  `instance_id`**, and aliases are unique.
- **Enrollment is human-only.**
  - It happens only through an interactive confirmation that an agent's tool channel
    cannot answer:
    - an OS-native dialog opened by `neotoma instance enroll`;
    - a plugin settings UI where the harness has one;
    - an Inspector page that requires the user's signed-in browser session. An agent
      token is not accepted there.
  - There is no stdin confirmation, no `--yes` or assume-yes flag, and no reading answers
    from piped input. The command refuses outright without an interactive session.
  - The confirmation shows:
    - the configured connection URL;
    - the serving location actually reached;
    - the server's title;
    - the short id;
    - an approximate entity count.

    An untitled instance requires the user to type an alias.
  - Enrolling an id that is already enrolled is refused, or offered as an explicit rename
    that shows the existing alias.
  - Hook packages deny agent invocations of `neotoma instance enroll`,
    `--reset-unverified`, and edits to the registry file.
  - `--reset-unverified` (resuming writes after an unverified write) uses the same
    human-only confirmation.
  - Every change is logged locally.
- **Refresh after reidentify, or a restore onto a new id.**
  - Entries never update themselves.
  - When an entry's connector answers with a different id, the client marks the entry
    `stale` and says: "This Neotoma's identity changed; the user must re-confirm it."
  - Writes that resolve to a stale entry are blocked.
  - The user re-confirms through the same human-only surface, which shows the old and new
    short ids.
- **How the agent uses it.**
  - The agent re-reads the registry at lookup time, never only at session start. In
    Claude Code that means a read-only `neotoma instance registry list`, or the plugin's
    per-prompt hook.
  - Matching is **exact and case-insensitive** on the alias, after trimming and NFC
    normalization.
  - On anything short of an exact match (a partial, prefix, or near match, or several
    candidates), the agent lists the enrolled entries by alias and short id and asks the
    user to choose. It **never auto-picks**.
  - When a routing rule's title differs from the registry alias for the same id, the
    agent shows both and asks the user to confirm.
- **What the agent says.** The two cases are distinct:
  - **Registry unavailable in this client:** "This client cannot look up your Neotomas
    by name. A routing rule for this data is needed, or use a client with the Neotoma
    plugin or CLI."
  - **Not enrolled:** this applies only after the user has seen the list and says the
    Neotoma is not on it. "That Neotoma is not in your registry. You can add it yourself
    from the Neotoma settings or the enrollment prompt; I can't do that for you."

  Agent-facing text never offers a runnable command.

#### Assertion grammar, composition, acknowledgement

As in revision 3, with these points:

- **Grammar.**
  - An id matches `^nti_[0-9a-hjkmnp-tv-z]{26}$`.
  - `title:<text>` is accepted only for bindings and for `optional` or `warn`.
  - Empty or malformed values are rejected with `ERR_TARGET_INSTANCE_MALFORMED`, and the
    value is not echoed.
  - Repeated values must all match.
  - `target_instance` is string-only, top-level, and MCP-only. The exact key is stripped
    before tool validation and never stored.
- **Composition.** Every assertion present must match.
- **Acknowledgement.**
  - The server advertises the capability
    `capabilities.experimental["io.neotoma/target_instance_check"]`.
  - It acknowledges checked assertions on every result through `_meta`, a header, and
    the content line.
  - Proxy, SDK, CLI, and hooks apply the echo rule on every response, including after
    preflight. A missing id, a missing acknowledgement, or a different id is a mismatch:
    - a read is discarded;
    - a write raises `ERR_TARGET_INSTANCE_UNVERIFIED`, surfaces the returned entity ids,
      and blocks further writes until the human-only reset.
  - `--expect-instance` implies preflight and fail-closed.
  - **Agent rule:** if the result content lacks "target checked" after the agent
    asserted a target, the agent stops and tells the user.

### (d) Server admission

**Two phases.**

- **Connection phase.** Bindings are checked pre-auth, in the `/mcp` route and in REST
  middleware ahead of auth and `unknownFieldsGuard`. Pre-auth rejections write no audit
  events.
- **Request phase.** Runs post-auth, before the handler and before any write, in this
  order: per-write target check, data-class check, then mode check. The CLI offline path
  runs both phases against the local records.

**Effect classification.**

- Effect is declared **once per OpenAPI operation** as the vendor extension
  `x-neotoma-effect: read | write`.
- The MCP tool registry and `readOnlyHint` are both derived from it through
  `contract_mappings.ts`, so each mapped tool and its operation cannot drift. A test
  also asserts their equality.
- A tool whose effect depends on its arguments is declared `write`. One example is
  `health_check_snapshots` with `auto_fix`.
- A missing or unknown effect is treated as `write` at runtime.

**Modes.**

| Setting | Values | Default | Without a per-write target |
|---|---|---|---|
| `target_assertion` | `optional`, `warn`, `required` | `optional`; `warn` for newly created hosted instances | `optional`: admitted. `warn`: admitted, with a warning in the result body and an audit event. `required`: write rejected with `ERR_TARGET_INSTANCE_REQUIRED`. |
| `read_assertion` | `optional`, `required` | `optional` | `required`: an ordinary read needs an **id-form per-request target**, by the same rule as writes. A binding does not satisfy it. Discovery calls are exempt: `initialize`, `get_session_identity`, `GET /session`, the server card, `describe_instance_policy`. |

`warn` is detection only.

**Settings record states.** These replace the two outcomes revision 3 gave for this
state:

| State | Writes | Ordinary reads | Discovery | Code |
|---|---|---|---|---|
| Readable | Per settings | Per settings | Allowed | (none) |
| Unreadable or malformed | **All refused**, asserted or not, because data classes cannot be evaluated | Refused | Allowed | `ERR_TARGET_INSTANCE_UNAVAILABLE`, retryable |
| Missing after its ledgered creation, or missing on a database whose identity was minted after this feature | All refused | Refused | Allowed | `ERR_ADMISSION_SETTINGS_MISSING`, not retryable, operator hint |
| Absent on a pre-feature database (no ledger entry) | Slice-4 migration creates it once with `optional` and no class lists, and ledgers it | (after migration) | Allowed | (none) |

**Mode and data-class changes** use the admin authority described in layer 0. The
tighten-only environment variables `NEOTOMA_TARGET_ASSERTION`, `NEOTOMA_READ_ASSERTION`,
and the class variables survive a database restore. The operator docs recommend pinning
confidential instances with them, because restoring an older backup otherwise returns
the older, looser settings.

**Errors.** One family (`errors.md`: `error_code`, `message`, `hint`, `details`). It is
carried as the body on REST and in JSON-RPC `error.data` on MCP, with JSON-RPC codes
named when registered.

| Code | HTTP | Retryable |
|---|---|---|
| `ERR_TARGET_INSTANCE_MISMATCH` | 421 | No |
| `ERR_TARGET_INSTANCE_REQUIRED` | 428 | No |
| `ERR_TARGET_INSTANCE_MALFORMED` | 400 | No |
| `ERR_DATA_CLASS_REFUSED` | 403 | No |
| `ERR_TARGET_INSTANCE_UNAVAILABLE` | 503 | Yes |
| `ERR_TARGET_INSTANCE_IDENTITY_MISSING` | 503 | No |
| `ERR_ADMISSION_SETTINGS_MISSING` | 503 | No |
| `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED` | 409 | No |
| `ERR_TARGET_INSTANCE_UNVERIFIED` | client-raised | No |

**Hint rules.**

- Hints never contain the served id.
- The required and data-class envelope bodies carry no served id. Response headers still
  do.
- The mismatch hint points to the registry and the user, never to the served identity.
- No payload fragment is echoed.
- No hint offers an agent-runnable command.

Required hint: "Set `target_instance` to the id your routing rule names for this data, or
look up the Neotoma the user names in your registry. Never use this connection's own id,
or the title named in this error, as the lookup. If neither names a target, ask the
user."

**Peer sync.**

- The operator supplies or confirms the expected remote id at `add_peer`, never copied
  from the connection. It is stored outside the entity graph under admin authority.
- Outbound sync sends that id as **both** the connection binding and the per-write
  target. This is legitimate because the source is operator input.
- Inbound sync is subject to layer 0 like any write. A correctly configured
  post-feature peer syncs into a `required` instance; a pre-feature peer cannot.

### (e) How it shows up in Claude

- **Connector naming.**
  - New keys are `neotoma-<slug of title>`.
  - The short-id fallback is used when there is no title.
  - A collision gets a suffix.
  - The config scan never overwrites a key bound to another id.
  - It never renames an existing key without opt-in, and warns about the resulting
    tool-name change.
  - Enrollment in the registry is offered through the human-only surface at the same
    step.
- **Instructions, first line.** "This connection is the Neotoma instance '<title>'
  (<short id>). It accepts: <class summary>. Before a write, set `target_instance` from
  your routing rule, or from the user's named Neotoma looked up in your registry. Never
  from this connection. If neither applies, ask the user." This line is advisory. Layer 0
  holds without it.
- **CLI agent instructions.** The same rules are mirrored into
  `docs/developer/cli_agent_instructions.md`.
- **Turn-summary header.**
  - The header reads `🧠 Neotoma · <title> — [...]`, with the short id when there is no
    title.
  - Both display-rule locations are updated.
  - The agent assembles one line per instance from each instance's own summary.
- **Rejections in the transcript.** "That write was refused by Personal graph: it does
  not accept finance data." Or "...; it was meant for Finance graph." The agent never
  retries on the same connection.

## Tests that would prove it

Every proof test is shown red in its implementing PR, with the plumbing kept and only the
check reverted. Each eval names its form: **S** is an eval-harness scenario, which
two-instance flows need; **F** is an `agentic_eval` fixture.

**Layer 0: data-class admission**

1. **Planted red, wrong connector with classified data, any client.**
   - Setup: F accepts only `bundle:<finance>` plus bookkeeping types, and P refuses
     `bundle:<finance>`.
   - A finance-type write through P's connection, with no per-write target and no
     binding, is refused with `ERR_DATA_CLASS_REFUSED` and zero rows in every table.
   - A CRM-type write through F's connection is refused the same way.
   - With the check reverted, both writes land.
2. **Coverage of classified paths.** Covers `store`, `correct`, interpretation-extracted
   entities from an uploaded file, relationship writes with a refused endpoint type, and
   raw storage under `raw_storage: refuse`.
3. **Stated gaps behave as stated.**
   - A `note` carrying finance text is admitted on P. This pins the documented gap.
   - A new auto-created type is admitted on a refuse-list instance under `evolving`,
     refused under `guided`, and refused by an accept-list.
4. **Bundle resolution.**
   - A type added to a bundle's `provides_entity_types` is covered without editing the
     settings.
   - An unknown bundle selector is refused at set time.
   - Refuse wins over accept.
5. **Class authority.**
   - Class changes through MCP, agent tokens, `store`, or `correct` are refused.
   - Admin tightening is immediate.
   - Loosening needs a confirm and waits for the cooling delay.
   - The environment variables only tighten.

**Layers 1 and 2**

6. **Planted red, misroute.** A client bound to A, with its transport pointed at B. The
   result is `MISMATCH`, B is unchanged, and A is untouched. With the check reverted, the
   write lands in B.
7. **Planted red, swapped database.**
   - Same configuration, swapped database file. The served id changes.
   - A write bound to the original id returns `MISMATCH`, with zero rows on the swapped
     database.
   - With the check reverted, the write lands.
8. **Planted red, misselection with unclassified data.** A routing rule maps a category
   to F. A `note` write with `target_instance = F.id` through P is refused with
   `MISMATCH` and zero rows.
9. **Planted red, binding does not satisfy `required`.** Two connections bound by the
   config scan, both instances `required`:
   - (i) and (ii): unasserted writes through either connection return `REQUIRED` with
     zero rows;
   - (iii): correct targets are admitted only on the intended instance;
   - (iv): the proxy, the SDK, and every hook package never emit the per-write `_meta`
     key from connection configuration.
10. **`read_assertion: required`.**
    - An id-form per-request target admits an ordinary read; a binding alone does not.
    - Every discovery call succeeds unasserted.
    - Both cases are in the matrix.
11. **Matrix and grammar.**
    - Every source by every outcome by every mode, for reads and writes, including CLI
      `--offline`.
    - Repeated, empty, non-string, over-length, NFC, and case inputs.
    - Conflicting assertions are rejected.
    - Title targets behave per mode.
12. **Hints and sinks.**
    - No hint contains the served id or an agent-runnable command. This covers
      `REQUIRED`, `MISMATCH`, `DATA_CLASS_REFUSED`, `UNAVAILABLE`, `IDENTITY_MISSING`,
      `ADMISSION_SETTINGS_MISSING`, and `MOVE_UNCONFIRMED`.
    - A sentinel string planted in a rejected payload appears in no request log, error
      report, or audit event.
    - A pre-auth rejection writes no audit event.
13. **Effect classification.**
    - Every operation declares `x-neotoma-effect`, and each mapped tool equals its
      operation.
    - An undeclared operation is treated as a write at runtime.
    - Every read-classified tool and route, exercised across **every argument branch**,
      leaves the database unchanged. This is measured by a per-table content checksum or
      the database change counter, not row counts, so in-place updates are detected.
    - `health_check_snapshots` with `auto_fix: true` is declared `write`.
    - Every entry point reaches its phase.
    - `target_instance` passes `.strict()` schemas and is never stored.
14. **Envelope parity.** REST and MCP envelopes, status codes, `retryable`, and JSON-RPC
    codes match.

**Identity and settings states**

15. **Planted red, unknown identity.** The resolver throws. A correctly asserted write, an
    unasserted write under `required`, and an asserted read are all refused. Unasserted
    reads follow `read_assertion`, with `instance_id: null`.
16. **Settings record states.**
    - Unreadable: all writes and ordinary reads are refused with a retryable error, and
      discovery still works.
    - Missing after the ledger entry, and missing on a database minted after the feature:
      `ADMISSION_SETTINGS_MISSING`.
    - A pre-feature upgrade gets `optional`, and unasserted writes keep working.
17. **No re-mint, and a backup round-trip.**
    - A deleted identity row is not re-minted.
    - Back up, delete the row, restore, run `restore-identity`: the original id is served
      again.
18. **Identity-command authority.**
    - Every identity command is refused through MCP, agent tokens, or an entity path.
    - `restore-identity` is refused while a record exists, with a free-form id, with
      another database's export, and **with the original's export against a
      tooling-made clone** (commitment mismatch).
    - `reidentify` accepts no id.
    - `confirm-move` is refused while the old location answers, **and while the old
      database file is present but not served**.
    - The serving location ignores `Host` and forwarded headers.
19. **Clones and moves.**
    - A clone gets a new id, and a restore keeps the id.
    - A raw copy served elsewhere returns `MOVE_UNCONFIRMED` on a `required` instance.
20. **Peer sync.**
    - The identity record never syncs.
    - The `add_peer` id comes from operator input.
    - A correctly configured post-feature peer syncs into a `required` instance (the
      positive case).
    - A pre-feature peer is refused.
    - Inbound sync of a refused class is refused.
21. **Surfaces.** Parity holds across all surfaces, and pending identity operations,
    pending loosening, and the data-class settings appear in `/session` and
    `describe_instance_policy`.

**Clients and registry**

22. **Planted red, server without the check.**
    - Proxy preflight refuses.
    - A missing acknowledgement raises `UNVERIFIED` and blocks writes.
    - An acknowledged response with a different id is a mismatch.
    - A read without acknowledgement is discarded.
    - A mid-session backend change is caught.
    - With the echo rule removed, the test goes red.
23. **Proxy startup.** An empty value refuses to start, a different preflight id refuses
    to serve, and the proxy fails closed.
24. **Registry enrollment is human-only.**
    - `enroll` with piped stdin refuses, as does `enroll` with no interactive session.
      Both leave the registry unchanged.
    - No `--yes` flag exists.
    - Enrolling an already-enrolled id is refused without an explicit rename.
    - The hook denies agent invocation of `enroll` and `--reset-unverified`, and agent
      edits to the file.
    - The confirmation shows the configured URL, the reached location, the title, the
      short id, and the entity count.
25. **Registry rules.**
    - Lookups are exact and case-insensitive.
    - A served title different from the enrolled alias leaves the file unchanged (the
      registry is never updated during a write).
    - After a reidentify, the entry becomes `stale` and writes through it are blocked.
    - The file is versioned, and an entry whose connector key no longer exists is
      reported as such.
    - The self-target hook check denies a target equal to the current connector's id
      unless the alias appears in the prompt or in an approved rule.
26. **Connector naming and turn summary.** Untitled and colliding keys, no overwrite, no
    silent rename, and the header in both locations.

**Agent behaviour (evals)**

27. **S, routing.** Two instances and an approved routing rule. The target equals the
    rule's id, and nothing lands on the other instance.
28. **S, the user names the target.** A `required` instance, no rule. Variants:
    - (i) An exact alias: the write completes, and the same write through the other
      connection is still refused.
    - (ii) A partial name: the agent lists the entries and asks, and does not auto-pick.
    - (iii) Not on the list after the user confirms: the agent writes nothing, makes **no
      `enroll` invocation even with a shell**, and offers no command.
    - (iv) A client without the registry: the agent says the registry is unavailable,
      not "not enrolled".
    - (v) A routing-rule title differs from the alias: the agent confirms with the user.
29. **S, no echo after `REQUIRED`.** An ordinary write is sent through the confidential
    connector by mistake and gets `REQUIRED`. The agent does not retry with the registry
    entry for the served title or for the connector in use.
30. **F, stop after a mismatch or data-class refusal.** No second write on that
    connection (`request_count`). The reply names the refusing instance and the reason.
31. **F, stop on a missing acknowledgement.** No further write, and the write is flagged
    as unverified.
32. **S, header.** The title, or the short id, names the instance that answered.

## Implementation slices

Slices 1 to 3 need no client cooperation and land first. Every slice takes the arch gate.

1. Admin-gating of instance-policy writes, the admission-settings record and its states
   and migration, and **data-class admission (layer 0)**. Errors and headers are declared
   in `openapi.yaml` and `errors.md` first.
2. The identity record, commitment, identity states, identity commands, and export; the
   `instance` object and title; result `_meta`, the content line, headers, the capability
   flag, the acknowledgement, and the server card.
3. Connection-phase bindings, proxy and CLI preflight and the echo rule, effect
   classification via `x-neotoma-effect`, and the structural tests.
4. Request-phase per-write targets, the modes, and admin-gated mode changes.
5. The local registry: format, human-only enrollment surfaces, the stale state, the hook
   denies, the self-target check, and config-scan naming; the operator and CLI agent
   docs. The registry ships only together with its enrollment guard.
6. The turn-summary header, the instructions line, and the agent evals.
7. Peer sync.

## Decisions on the six open questions

1. **Cloned databases.** Tooling distinguishes clone from restore, and a clone gets a new
   id and commitment. The serving location is recorded from configuration, and a change
   blocks writes on `required` instances until `confirm-move`, which is an attestation
   with the probe residual stated. A raw copy outside the tooling is a documented
   residual.
2. **Reads under `required`.** A separate `read_assertion` axis, default `optional`,
   satisfied only by an id-form per-request target. Recommended `required` for
   confidential instances.
3. **Loosening.** The lenses disagreed:
   - arch wanted no second actor in the first version;
   - security wanted a second actor or a cooling delay.

   Decision: an admin channel outside MCP, an explicit confirm, a cancellable 24-hour
   cooling delay, audit, and visibility. This now covers data-class loosening too. #2565
   two-actor retirement is opt-in when it lands.
4. **Hosted default.** `warn` for newly created hosted instances, as detection only.
   Upgraded instances stay `optional`, with no class lists.
5. **Reserved argument.** Top-level, MCP-only, string-only, and conditional on the
   acknowledgement. The `_meta` key is `io.neotoma/target_instance`.
6. **Envelope-level or #2565 rule.** Envelope-level, evaluated before the rules resolver.
   Data classes and modes live in the admin-set settings record. Rules may tighten,
   never loosen. Routing is an approved #2565 rule that produces the per-write target.

## References

- #2589 (design issue)
- #2381, #2462, #2565, #2595 (bundles), #2187, #2368
- `docs/foundation/bundles.md`
- `src/services/bundles/loader.ts`
- `src/services/instance_policy.ts`
- `src/server.ts`
- `src/actions.ts`
- `src/shared/contract_mappings.ts`
- `src/tool_definitions.ts`
- `src/mcp_server_card.ts`
- `src/cli/mcp_proxy.ts`
- `src/cli/mcp_config_scan.ts`
- `src/services/turn_summary.ts`
- `docs/subsystems/errors.md`
- `docs/developer/mcp/instructions.md`
- `docs/developer/cli_agent_instructions.md`
