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

**Revision 5 answers the round-four review findings.** It keeps the revision 4 shape and
changes these points:

- **Selectors cannot lose coverage silently.** Bundle selectors resolve from bundle
  manifests, never from the enabled-bundles index. Each selector's resolved type set is
  snapshotted when it is set. A catalog change can tighten at once, but any loosening it
  would cause waits for admin confirmation under the cooling delay. A selector that no
  longer resolves, a bundle catalog that failed to load, and an accept-list that resolves
  to no types all refuse every write.
- **Each entity is classified on its canonical submitted type and its alias-resolved
  type.**
- **The boundary with the rules design (#2565) is stated.** The existing instance-policy
  type lists migrate into #2565 predicate rules, not into layer 0. The two compose by
  conjunction, rules break-glass never suspends layer 0, governance types are always
  admitted by layer 0, refusals use the one `ERR_STORE_POLICY_DENIED` family, and admin
  gating reuses the #2565 governance guard and operator channel.
- **Agent-callable tools no longer move the class boundary.** On an instance with
  data-class settings, only the admin can register new record types or change bundles.
  `register_schema` and the mutating `manage_bundles` actions are refused to agents
  there. The operator decided this on 2026-11-14 (decision 7, formerly open question 1).
- **A data-class refusal leads to a stripped retry.** The agent removes the refused
  entities and their relationships and stores the rest on the same connection, so the
  turn's own conversation records are not lost. Only an unchanged resend is forbidden.
- **The self-target hook no longer dead-ends a user's choice.** A choice from a registry
  list the agent showed satisfies it, the hook asks through a harness permission prompt
  instead of a final deny, and its scope and matching rule are defined.
- **Human-only enrollment is tested against pseudo-terminals,** and the confirmation
  surfaces never read terminal input.

No open questions remain. The question this revision could not settle was decided by
the operator, and is recorded as decision 7 at the end.

**Revision 4 changed the shape.** Each earlier revision closed one client-side gap and
opened another. The cause is that every defence against misselection depended on the
client: per-write targets, the local registry, and hooks. Revision 4 adds a
**server-side data-class admission layer** that works on every client. Each Neotoma
declares, as admin-set settings, which data classes it accepts and refuses. A
wrong-connector write of classified data is then rejected by its content, with no client
cooperation. Per-write targets, connection bindings, and the registry stay, as
additional layers for clients that support them. A per-client table states what each
client gets.

Changes made in revision 4:

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
  `guided` gates auto-creation only. Explicit registration with `register_schema`, and
  bundle changes that widen what `guided` auto-creates, are admin-only on instances with
  data-class settings (see "Schema and bundle changes"), so an agent cannot add a type
  there by either route.
- **The per-turn message and raw attachments.** Neotoma's agent instructions store every
  user message word for word, every turn, and keep attachments as raw files. Neither has
  a type that layer 0 can judge. In a team with a confidential instance, a general
  instance that stores message turns and accepts raw files will receive confidential chat
  text and attachments, unless a routing rule sends those turns elsewhere. This is the
  most likely leak path, and it is the unclassified free text gap in its commonest form.

Layers 1 to 3 exist for these gaps, on clients that can carry them.

### What each client gets

"Admitted" means the wrong write lands; "refused" means it does not. The classified-data
column holds only when the receiving instance's class lists cover the type. The upgrade
default has no lists, and a refuse-list under `evolving` misses new types.

| Client | Misroute | Wrong connector, classified data (under the recommended configuration) | Wrong connector, unclassified data | User names the target on a `required` instance |
|---|---|---|---|---|
| **Claude Code with the Neotoma plugin** (hooks plus proxy) | Refused (binding, preflight, acknowledgement check) | Refused (layer 0) | Refused when a routing rule or registry lookup supplies a per-write target. Otherwise admitted under `optional` or `warn`, refused under `required`. | Works: registry lookup at write time, with exact match or the user's choice from a list (see "Self-target check") |
| **CLI** (human or agent shell) | Refused (`--expect-instance` or env binding, preflight, acknowledgement check) | Refused (layer 0) | As above, with `--target-instance` | Works: `neotoma instance registry list` read at lookup time |
| **Proxy only** (any stdio client without hooks) | Refused (binding, preflight, acknowledgement check) | Refused (layer 0) | Refused when the agent sets `target_instance` from a delivered routing rule. Otherwise admitted under `optional` or `warn`, refused under `required`. | Not available unless the client exposes the registry. Otherwise the agent says the registry is unavailable in this client. |
| **Claude Desktop chat, claude.ai, Cowork** (remote connector by URL, no local hooks or registry) | Refused when the connector URL carries `?expected_instance=` and the server runs the check. The user gets that URL from a copy action on the Inspector's instance page, and the setup docs say to use it. No client acknowledgement check, so a server without the check is not detected (the agent rule only). | Refused (layer 0) | Refused only when the agent sets `target_instance` from an approved routing rule delivered in instructions. Otherwise admitted under `optional` or `warn`, refused under `required`. | **Not available.** The agent says this client cannot resolve Neotoma names. A `required` instance used from these clients needs a routing rule, or its writes cannot proceed. The same holds for ordinary reads of an instance with `read_assertion: required`. |

### Recommended configuration for the motivating case

- **Finance Neotoma.**
  - An **accept-list** of the finance classes. Governance types are always admitted by
    layer 0, and the chat bookkeeping types are named by the built-in
    `class:bookkeeping` selector (see "Selectors"), so the list is complete without
    enumerating them. Until a finance bundle exists in the catalog, the finance classes
    are named with `type:` selectors.
  - `raw_storage: refuse`, unless it holds source documents.
  - `read_assertion: required` if every client used with it has routing rules or the
    registry. Otherwise `optional`, accepting that the per-client limits above apply to
    reads too.
  - `target_assertion: required` under the same condition. Otherwise `warn`.
- **Every other Neotoma in the team.**
  - A **refuse-list** naming the finance classes.
  - `NEOTOMA_SCHEMA_MODE=guided`.
  - `raw_storage` set as its purpose requires, knowing that raw attachments are not
    classified.
  - A routing rule for message turns that carry finance content, where #2565 rules are
    available.
- **Pin both with the tighten-only environment variables.** These survive a database
  restore to an older state.

Under this configuration, classified finance data cannot land outside the finance
Neotoma, and non-finance classified data cannot land inside it, from any client. The
remaining exposure is:

- unclassified free text, most often the verbatim per-turn message and raw attachments
  on a general instance;
- on Chat-type clients, writes with no routing rule;
- on a refuse-list instance left in `evolving` mode, a type an agent auto-creates by
  writing it, which is why the recommended configuration uses `guided`.

### Residual risks and non-goals

**Admitted and not detectable by the server:**

- An agent that puts confidential content in an unclassified type.
- An agent that does not recognise data as confidential.
- An agent that copies the served id into a per-write target, against the rules.
- A user who confirms the wrong Neotoma at enrollment.
- An agent with computer-use or browser control, or with UI scripting reached through a
  shell, that answers an enrollment confirmation surface. Requiring the typed short id
  or alias raises the bar but does not close it. That is outside this accident guard.

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
  - Layer 0 is **not** their successor. Under #2565 those two lists migrate into
    mandatory `entity_type_allow` and `entity_type_deny` predicate rules, and layer 0 does
    not consume them. Layer 0 is a separate admin-set floor: it survives rules
    break-glass and covers raw storage, which #2565 predicates do not. See "Boundary with
    the rules design".
  - Layer 0 runs in the same evaluator path as instance policy, but does not inherit
    that evaluator's rule that an empty allow-list means no allow-list (see "Resolution
    and fail-closed rules").
- **Bundles** (`docs/foundation/bundles.md`, `src/services/bundles/`, and the bundles
  PR #2595): bundles are named by `name`, and each declares `provides_entity_types`.
  Layer 0 uses that vocabulary for its selectors.
- **Rules design** (#2565): routing rules, approval by a member other than the author,
  hook packages, the governance types and their no-lockout exemption, the governance
  guard and operator channel delivered in its slice N1, and the `ERR_STORE_POLICY_DENIED`
  envelope with per-entity reason codes.

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
| `accepted_classes` | List of selectors, or unset | If set, every entity in a write must match a selector, or the write is refused. "Unset" and "set" are distinct stored states. A set list that resolves to no types refuses every write. |
| `refused_classes` | List of selectors | Any entity that matches is refused. Refuse wins over accept. |
| `raw_storage` | `accept`, `refuse` | Whether raw and reference file storage, which has no entity type, is admitted. |

**Selectors.**

- `bundle:<name>` matches every type in that bundle's `provides_entity_types`, using the
  bundle vocabulary of `docs/foundation/bundles.md` and #2595. For example,
  `bundle:crm`, `bundle:engineering`, `bundle:communications`, or a finance bundle once
  one exists in the catalog. Until then, finance classes are named with `type:`
  selectors.
- `type:<entity_type>` matches a single type, after the canonicalization described under
  "Which type is classified".
- `class:bookkeeping` is a built-in selector for the chat bookkeeping types that the
  per-turn store recipe in `docs/developer/mcp/instructions.md` writes:
  `conversation` and `conversation_message`, with its `agent_message` alias. It is
  defined in code next to that recipe, and a test holds the two equal. Setting an
  accept-list that omits it shows a warning that every per-turn store on this instance
  will be refused, and asks the admin to confirm.

#### Resolution and fail-closed rules

These rules exist because a selector's coverage can otherwise shrink with no admin
action: through bundle enable state, a catalog change in a release, a bundle rename or
split, or a failed catalog load.

- **Resolve from manifests, never from enable state.** A `bundle:` selector resolves from
  the bundle's manifest in the loaded catalog (the manifest the loader returns for that
  bundle name), whether or not the bundle is installed or enabled on this instance. It
  never resolves from the enabled-bundles index (`getProvidedEntityTypes`,
  `bundleProviding`), which is what the `guided` gate reads. Enabling, disabling,
  installing or removing a bundle therefore never changes what layer 0 admits.
- **Snapshot at set time.** When a selector is set, its resolved type set and the catalog
  version are stored with it in the settings record. At evaluation:
  - the effective refuse set is the snapshot **union** the current manifest resolution;
  - the effective accept set is the snapshot **intersected with** the current manifest
    resolution.

  So a catalog change can only tighten at once. A type added to a refused bundle is
  refused without editing settings. A type added to an accepted bundle is refused until
  the admin confirms it.
- **Loosening from a catalog change is a pending loosening.** When the current resolution
  differs from the snapshot in a direction that would loosen (a type moved out of a
  refused bundle, a type added to an accepted bundle), the server records a pending
  loosening for that selector and shows it in `/session` and `describe_instance_policy`.
  It takes effect only by the admin's explicit confirm, after the cooling delay, like any
  other loosening. Until then the tighter set applies.
- **A selector that no longer resolves refuses every write.** If a stored `bundle:`
  selector names a bundle that is not in the loaded catalog (renamed, split or dropped in
  a release), or resolves to zero types, the instance refuses every write except to
  governance types, with `ERR_ADMISSION_CLASSES_UNRESOLVED`. This is the same outcome as
  an unreadable settings record. Discovery calls still work, and `describe_instance_policy`
  names the stale selector. The admin repairs it by re-setting the selector, which is a
  tightening or a loosening under the usual rules.
- **A catalog that failed to load refuses every write.** The loader returns an empty
  catalog when a manifest or `requires_bundles` error occurs. Layer 0 treats a failed load
  on an instance with any `bundle:` selector as unresolved, with the same code, and never
  as an empty catalog.
- **An accept-list that resolves to zero types refuses every write** except to governance
  types. Layer 0 does not reuse the instance-policy evaluator's rule that an empty
  allow-list is no allow-list.
- **Upgrade preflight.** `neotoma instance classes check`, run through the operator
  channel before an upgrade, reports which stored selectors the new catalog would leave
  unresolved or would change, so the admin can re-set them first. The release notes for
  any catalog rename or split name the affected selectors.
- **At set time,** a selector naming an unknown bundle, a bundle with no types, or a
  governance type is refused.

#### Which type is classified

- **Canonical type.** Layer 0 compares the canonical type that storage persists, after
  the same normalization schema lookup applies: case, whitespace and punctuation, the
  `type` key fallback when `entity_type` is absent, and the `generic` default. It never
  compares the raw request string.
- **Submitted and alias-resolved types.** Each entity is classified on both its canonical
  submitted type and its alias-resolved type (for example `bug_report` resolving to the
  built-in `product_feedback` until a bundle registers its own schema). The entity is
  refused if **either** matches the refuse set. It is admitted to an accept-list only if
  its **resolved** type is in the accept set.

#### What is classified

The sink list is derived, not named by hand: every operation declared
`x-neotoma-effect: write` (see "Effect classification") that creates an entity, re-types
an existing one, or writes a relationship, is a layer-0 sink. The structural coverage
test enumerates these operations from the OpenAPI document and fails when one does not
reach layer 0, so a later write path cannot skip it. Today that list includes:

- the structured `store` paths (REST and MCP) and `correct`, which call the evaluator
  today;
- interpretation extraction (`src/services/interpretation.ts`), which writes observations
  directly and does not call the evaluator today; a new call site;
- raw and reference file storage (`storeUnstructuredForApi`), which follows `raw_storage`
  and does not call the evaluator today; a new call site;
- relationship writes (`create_relationship` and relationships inside `store`), admitted
  only if both endpoint types are admitted; a new call site;
- `split_entity`, whose new entity's type is caller-supplied, and `merge_entities`;
- `restore_entity`: restoring an entity whose type is now refused is refused;
- inbound peer sync.

**Raw storage with extraction.** In one request, raw storage and extraction are one
admission decision: if any extracted entity is refused, the source row and the file do
not persist either. When extraction is a later call, the source has already landed under
`raw_storage: accept`. That refusal's message says the source was stored earlier and that
no entities were persisted from this call.

**Existing data.** Setting a refused class, or narrowing an accept-list, over data that
already exists shows the admin how many existing entities it affects, because `correct`
on those entities will then be refused. Existing rows are never deleted.

#### Evaluation

- Admission runs in the request phase, after each entity's type is canonicalized and
  alias-resolved, and before any write. On every path, including extraction, it runs
  **before schema auto-creation**, so a refused write leaves no newly registered schema
  behind.
- It is a whole-request reject with zero rows in every table, schema rows included.
  Every refused entity and every refused relationship is listed.
- The check is in the instance-policy evaluator path and covers every sink above.
- If the settings record cannot be read, the check fails closed (see "Settings record
  states").

#### Boundary with the rules design (#2565)

Layer 0 and #2565's `entity_type_allow` and `entity_type_deny` predicates both decide
admission by entity type. Keeping both is deliberate: layer 0 is an admin-set floor that
survives rules break-glass and covers raw storage, and #2565 predicates are member-proposed
rules that can be suspended by break-glass and do not cover raw storage. The boundary:

- **Migration home.** The existing instance-policy `in_scope_entity_types` and
  `out_of_scope_entity_types` migrate into #2565 predicate rules, as #2565 specifies.
  Layer 0 does not consume them. An upgraded instance gets layer 0 with no class lists.
- **Composition.** A write must pass layer 0 **and** every applicable mandatory #2565
  predicate. Layer 0 runs first, at the envelope, before the rules resolver. Rules
  break-glass never suspends layer 0.
- **Governance types.** Layer 0 always admits writes to the #2565 governance types
  (`rule`, `policy`, `member`, `agent_grant`, and the legacy rule-bearing types during
  the transition window), and relationship writes among them, so the rule set can always
  be repaired. The list is read from the one function #2565 slice N1 introduces, not
  copied. A selector that names a governance type is refused at set time. These writes
  still pass the governance guard, so admitting them at layer 0 grants nothing.
- **One denial code family.** A layer-0 refusal returns `ERR_STORE_POLICY_DENIED`, the
  code #2565 predicates and today's instance policy already use, with its existing HTTP
  status. Each denied entry carries `reason_code: data_class_refused` and
  `source: admission_settings` in place of a `rule_key`. Agents and clients branch on the
  reason code.
- **One guard.** Admin gating of the admission-settings record uses the #2565 slice N1
  governance guard and operator channel. This design builds no second guard.

#### Refusal and recovery

**Error.** `ERR_STORE_POLICY_DENIED`, not retryable. `details` lists:

- each refused entity: index, canonical `entity_type`, resolved type, and the reason,
  either `not_in_accept_list` or `matched_refuse_selector` with the selector (for
  example `bundle:finance`);
- each relationship refused because an endpoint was refused, by index and the refused
  endpoint's index.

**Hint.** "This Neotoma does not accept `<entity_type>` records; 0 persisted. Do not
resend this request unchanged. Remove the refused entities and every relationship listed
in details, then store the rest here. Store the refused entities on the Neotoma your
routing rule names for them, or ask the user, together with that Neotoma's own
conversation and message records." The hint carries no served id and no payload
fragment.

**Why a stripped retry.** The standard per-turn store holds the `conversation`, the
user's `conversation_message`, extracted entities and REFERS_TO links in one request. On
a general instance that refuses finance classes, a turn that mentions a payment is a
mixed write, not a wrong-instance write. The conversation and message belong on the
instance in use, so the agent stores them there. The refused records go to the instance
that accepts them, with that instance's own conversation and message records, so the
provenance chain holds on both. A stripped retry applies only to a data-class refusal. A
target mismatch means the whole request was aimed at the wrong instance, and it is never
retried on that connection.

**What the user is told.** Which records went where, for example: "I saved this turn
here in Personal graph. The payment was refused here, so I stored it in Finance graph
with its own record of this turn."

#### Who sets it

The same admin authority as modes, through the operator channel:

- **Command.** `neotoma instance classes show|set|confirm|cancel` on the instance host,
  and the same operations on the hosted admin route. `set` prints the effective lists
  after the change, which entries are tightening and take effect now, and which are
  loosening, pending, and when they take effect.
- Tightening is immediate: adding a refused class, removing an accepted class, or setting
  `raw_storage: refuse`.
- Loosening needs an explicit confirm and a cancellable cooling delay (default 24 hours).
  It is audited and shown as pending.
- **Environment.** `NEOTOMA_REFUSED_CLASSES` and `NEOTOMA_ACCEPTED_CLASSES` take a
  comma-separated list of selectors, for example
  `NEOTOMA_REFUSED_CLASSES=bundle:finance,type:invoice`. A malformed value stops the
  server from starting, with a named error. Both are applied on resolved types:
  - the refused variable adds to the stored refuse set;
  - the accepted variable intersects with the stored accept set. When the stored
    accept-list is unset, the variable's list becomes the effective accept-list. An
    intersection with no overlap is an empty accept set and refuses every write except
    to governance types.
- **Visibility.** `describe_instance_policy` and `/session` show the effective lists,
  marking each entry as stored, from the environment, or held by a snapshot, and show
  stale selectors and pending loosenings with their effective time. An admin who removes
  a stored entry that the environment still enforces can see why it still refuses.
- #2565 rules may tighten, never loosen.

#### Schema and bundle changes

Decided by the operator on 2026-11-14 (decision 7): **on an instance with data-class
settings, only the admin can register new record types or change bundles through
tools.**

- **Which instances.** Any instance whose effective settings include an
  `accepted_classes` list, a non-empty `refused_classes` list, or either class
  environment variable. Instances without data-class settings are unchanged by this
  rule.
- **Which operations.** `register_schema`, and any other tool or route that creates a
  new entity type schema; and the mutating `manage_bundles` actions: `install`,
  `enable`, `disable`, and any mutating action added later. Read-only `manage_bundles`
  actions and schema reads stay open to agents. Writes of existing types, and
  auto-creation under `guided` of types from bundles the admin enabled, are unchanged.
- **Who enforces it.** The #2565 slice N1 governance guard, the same guard that gates
  the admission-settings record. It is called at the entry of the `register_schema`
  handler, and from the bundle activation admin hook (`assertAdminGateHook` in
  `src/services/bundles/activation.ts`, a no-op today), before anything changes. Only
  the operator channel passes: the local CLI on the instance host, or the hosted admin
  route. MCP calls, agent-scoped tokens and member credentials are refused, whoever the
  member is. The guard reads the effective class settings at call time, so applying a
  class setting gates these operations at once, and a gated call is audited.
- **Operator commands.** The existing `neotoma schemas register` and
  `neotoma bundles install|enable|disable` commands, run through the operator channel.
  `neotoma instance classes set` says, when it first applies a class setting, that schema registration and bundle
  changes are now admin-only on this instance.
- **How a refusal reads to the agent.** `ERR_CLASS_SETTINGS_ADMIN_ONLY`, HTTP 403, not
  retryable. `details` names the operation and action (for example `register_schema` or
  `manage_bundles` `enable`) and, for a schema, the requested type name. Nothing
  changes. Hint: "This Neotoma has data-class settings, so only its operator can add
  record types or change bundles. Nothing was changed. Do not retry. Tell the user; its
  operator decides which types this Neotoma holds." The hint carries no served id and
  offers no command. The agent tells the user, for example: "Finance graph only lets its
  operator add new record types, so I could not add `<type>` there."
- **Auto-create hints.** The `guided` and `locked` refusal hints no longer tell the agent
  to register the type, and name the operator as the actor: "This Neotoma does not
  auto-create `<type>`. Tell the user; its operator decides which types it holds."
- **Effect on layer 0.** Selectors already resolve from manifests plus the set-time
  snapshot, so bundle state never changed what layer 0 refuses or accepts. This rule
  closes the remaining route: on a refuse-list instance, an agent can no longer add a
  type that no selector names by registering it.

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

- the served instance's own identity: headers, `_meta`, the content line, the
  instructions' description of the instance itself, `get_session_identity`, and the
  server card;
- any connection binding.

An approved routing rule carried in the instructions is a source (source 1). The
instance's description of itself in the same instructions is not.

**Echo routes closed.** A registry lookup key comes only from the user's words or a
routing rule. It never comes from:

- the connector in use;
- a title named in an error envelope;
- the instructions' description of the instance itself;
- the turn-summary header;
- any other served surface.

The agent never does a reverse lookup from a connector or a served title to an id.

#### Self-target check

The Claude Code hook package enforces the echo rule mechanically. A correct
registry-sourced write always has a target equal to the registry id of the connector
being called, so the check cannot simply deny that case. It asks for evidence that the
target came from the user or a rule.

- **When it fires.** A write's per-write target equals the registry id of the connector
  being called.
- **What satisfies it.** Any one of:
  - the entry's alias or short id appears in the user's prompt this turn. "Appears" uses
    the same normalization as registry lookup (trimmed, NFC, case-insensitive) and
    matches a whole word or phrase, not a substring;
  - an applicable approved routing rule names that id;
  - **a choice the user made this turn from a registry list the agent showed.** The agent
    runs the list-and-choose step as a structured question (the harness's question tool,
    where it has one). The hook reads the question and the answer, and the choice counts
    whether the user answers by alias, by number, or with "yes" to a single offered
    entry. Where the harness has no structured question tool, the plugin's per-prompt
    hook records the list the agent showed and matches the user's next reply against it
    by number, alias or short id.
- **What happens otherwise.** The hook does not return a final deny. It returns a harness
  **permission prompt** to the user showing the target's alias and short id and the
  connector in use, for example "Write to Finance graph (nti_abc123) through this
  connection?". The user's approval is a human confirmation in its own right and
  satisfies the check. A refusal at the prompt blocks the write.
- **Scope.** An exemption holds for the rest of the current turn and only for that
  instance id. A later turn that writes to the same instance without naming it again
  gets one permission prompt for that turn, not one per call. An exemption ends at once
  when the entry becomes `stale`.

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
  - **No confirmation is ever read from a terminal.** This covers piped stdin and also a
    terminal or pseudo-terminal, because an agent shell can supply typed input through a
    pseudo-terminal wrapper (`script`, `expect`, a terminal-tab tool). The command never
    prompts on the terminal at all. It opens one of the surfaces above and waits for its
    answer. There is no `--yes` or assume-yes flag.
  - Without a display (for example over SSH, or on a headless host) there is no
    OS-native dialog. The command then refuses and prints the address of the Inspector
    enrollment page, where the user confirms in their signed-in browser.
  - The confirmation requires the user to **type the displayed short id or the alias**,
    not just press a button, so a single scripted click cannot complete it.
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
    `--reset-unverified`, and edits to the registry file, including through wrappers
    (`env`, `sh -c`, `npx`, and direct file writes through an interpreter).
  - `--reset-unverified` (resuming writes after an unverified write) uses the same
    human-only confirmation, with the same rules: no terminal input, no assume-yes, and
    the Inspector page when there is no display.
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
    Neotoma is not on it. "That Neotoma is not in your registry. You can add it yourself;
    I can't do that for you. See <docs link for this client>." The link is per client:
    the plugin settings page for Claude Code, and the enrollment section of the setup
    docs for the CLI.

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
| Readable, but a stored `bundle:` selector does not resolve, or the bundle catalog failed to load | All refused except to governance types | Per settings | Allowed | `ERR_ADMISSION_CLASSES_UNRESOLVED`, not retryable, operator hint naming the stale selector |
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
| `ERR_STORE_POLICY_DENIED` with `reason_code: data_class_refused` (layer 0; existing code and status) | 400 | No |
| `ERR_ADMISSION_CLASSES_UNRESOLVED` | 503 | No |
| `ERR_CLASS_SETTINGS_ADMIN_ONLY` | 403 | No |
| `ERR_TARGET_INSTANCE_UNAVAILABLE` | 503 | Yes |
| `ERR_TARGET_INSTANCE_IDENTITY_MISSING` | 503 | No |
| `ERR_ADMISSION_SETTINGS_MISSING` | 503 | No |
| `ERR_TARGET_INSTANCE_MOVE_UNCONFIRMED` | 409 | No |
| `ERR_TARGET_INSTANCE_UNVERIFIED` | client-raised | No |

**Hint rules.**

- Hints never contain the served id.
- The required and data-class refusal envelope bodies carry no served id. Response headers still
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
  from this connection. If neither applies, ask the user. If a write is refused for its
  data class, store the rest of it here and the refused records, with their own turn
  records, on the Neotoma that accepts them." This line is advisory. Layer 0 holds
  without it. `<class summary>` comes from the same resolver as `describe_instance_policy`
  and names resolved bundle names and `type:` entries, not expanded type lists, to stay
  inside the instruction budget #2565 sets.
- **CLI agent instructions.** The same rules are mirrored into
  `docs/developer/cli_agent_instructions.md`.
- **Turn-summary header.**
  - The header reads `🧠 Neotoma · <title> — [...]`, with the short id when there is no
    title.
  - Both display-rule locations are updated.
  - The agent assembles one line per instance from each instance's own summary.
- **Rejections in the transcript.**
  - **Target mismatch:** "That write was refused by Personal graph; it was meant for
    Finance graph." The agent never retries on the same connection.
  - **Data-class refusal:** the agent never resends the same request. It does the
    stripped retry described in "Refusal and recovery" and tells the user which records
    went where: "I saved this turn here in Personal graph. The payment was refused here,
    so I stored it in Finance graph with its own record of this turn." When no routing
    rule or user choice names an instance for the refused records, it stores the rest and
    asks the user where the refused records belong.

## Tests that would prove it

Every proof test is shown red in its implementing PR, with the plumbing kept and only the
check reverted. Each eval names its form: **S** is an eval-harness scenario, which
two-instance flows need; **F** is an `agentic_eval` fixture.

**Layer 0: data-class admission**

1. **Planted red, wrong connector with classified data, any client.**
   - Setup: F accepts only `bundle:<finance>` (or the `type:` selectors that stand in for
     it) plus `class:bookkeeping`, and P refuses the same finance classes.
   - A finance-type write through P's connection, with no per-write target and no
     binding, is refused with `ERR_STORE_POLICY_DENIED`, `reason_code:
     data_class_refused`, and zero rows in every table.
   - A CRM-type write through F's connection is refused the same way, with reason
     `not_in_accept_list`.
   - **Mixed batch:** one admitted entity and one refused entity in one request. Zero
     rows for the admitted entity too, and every refused entity and every relationship
     with a refused endpoint is listed in `details`.
   - **Check order:** a write that fails both the target check and the class check
     returns `MISMATCH`.
   - With the check reverted, every refused write lands.
2. **Coverage of classified paths.**
   - Covers `store` (REST and MCP), `correct`, interpretation-extracted entities from an
     uploaded file, relationship writes with a refused endpoint type, `split_entity` with
     a refused new type, `merge_entities`, `restore_entity` of a now-refused type, and raw
     storage under `raw_storage: refuse`.
   - The structural test enumerates every `x-neotoma-effect: write` operation that
     creates, re-types or relates an entity, and fails when one does not reach layer 0.
   - **Canonical type:** mixed-case, padded and punctuation variants of a refused type,
     and the `type` key in place of `entity_type`, are all refused, and the persisted
     `entity_type` of an admitted variant equals the type layer 0 compared.
   - **Before auto-create:** a refused write of a new type under `evolving` or `guided`
     leaves no schema row behind.
   - **Raw plus extraction:** in one request, a refused extracted entity leaves no source
     row and no file. With extraction as a later call, the refusal says the source was
     stored earlier and no entities were persisted from this call.
3. **Stated gaps behave as stated.**
   - A `note` carrying finance text is admitted on P. This pins the documented gap.
   - A new auto-created type is admitted on a refuse-list instance under `evolving`,
     refused under `guided`, and refused by an accept-list.
   - The `guided` and `locked` refusal hints name the operator and do not mention
     `register_schema`.
4. **Bundle resolution.**
   - A type added to a refused bundle's `provides_entity_types` is refused without
     editing the settings.
   - A type added to an accepted bundle is refused until the admin confirms the pending
     loosening, and is admitted only after the cooling delay.
   - **Planted red, enable state:** disabling the refused finance bundle through the
     operator channel, and running with that bundle never installed or enabled, both
     leave the refusal in place. With resolution switched to the enabled-bundles index, the test
     goes red.
   - **Planted red, catalog shrink:** a type moved out of a refused bundle in a new
     catalog stays refused (snapshot), and a pending loosening is recorded.
   - **Planted red, selector stops resolving:** remove the bundle from the loaded catalog
     after setting the selector. A write of a formerly covered type, and of any other
     non-governance type, is refused with `ERR_ADMISSION_CLASSES_UNRESOLVED`, and
     `describe_instance_policy` names the stale selector. With the rule reverted, the
     formerly covered type is admitted.
   - **Planted red, catalog load failure:** a manifest error that makes the loader
     return an empty catalog refuses every non-governance write with the same code.
   - **Planted red, empty accept set:** an accept-list whose selectors resolve to zero
     types refuses every non-governance write.
   - **Aliases:** a `bug_report` write that alias-resolves to `product_feedback` is
     refused if either type matches the refuse set, and admitted to an accept-list only
     if `product_feedback` is in the accept set.
   - An unknown bundle, a bundle with no types, and a selector naming a governance type
     are refused at set time.
   - Refuse wins over accept.
   - `neotoma instance classes check` reports the stale selector a new catalog would
     leave.
5. **Class authority and the rules boundary.**
   - Class changes through MCP, agent tokens, `store`, or `correct` are refused.
   - Admin tightening is immediate.
   - Loosening needs a confirm and waits for the cooling delay.
   - The environment variables only tighten. With the stored accept-list unset,
     `NEOTOMA_ACCEPTED_CLASSES` becomes the effective accept-list. An intersection with
     no overlap refuses every non-governance write. A malformed value stops the server.
   - `describe_instance_policy` marks each effective entry as stored, environment, or
     snapshot.
   - **Governance types:** on an accept-list instance whose list names no governance
     type, `rule` and `policy` writes are admitted by layer 0 and still pass the
     governance guard, and an operator-channel repair succeeds.
   - **Conjunction:** a write admitted by layer 0 and denied by a mandatory
     `entity_type_deny` predicate is refused, and a write denied by layer 0 is refused
     while rules break-glass is set.
   - **Migration:** an upgraded instance with instance-policy type lists gets #2565
     predicate rules for them and no layer-0 class lists.
   - Setting an accept-list without `class:bookkeeping` warns and asks for a confirm.
   - **Planted red, schema and bundle authority (decision 7):** on instances with an
     accept-list, a refuse-list, or only a class environment variable, `register_schema`
     and `manage_bundles` `install`, `enable` and `disable` through MCP, an agent token,
     and a member credential are refused with `ERR_CLASS_SETTINGS_ADMIN_ONLY`, with no
     schema row, no bundle state change, and an audit event. The same operations through
     the operator channel succeed. Read-only `manage_bundles` actions still work for
     agents. On an instance without class settings, behaviour is unchanged. Applying a
     first class setting gates the next call with no restart. With the guard call
     removed, an agent-registered type on a refuse-list instance is admitted, and the
     test goes red.
   - Setting a refused class over existing data reports the count of affected entities.

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
      `REQUIRED`, `MISMATCH`, the `data_class_refused` denial, `UNAVAILABLE`,
      `IDENTITY_MISSING`, `ADMISSION_SETTINGS_MISSING`, `ADMISSION_CLASSES_UNRESOLVED`,
      `CLASS_SETTINGS_ADMIN_ONLY`, `MOVE_UNCONFIRMED`, and the `guided` and `locked`
      auto-create refusals.
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
    - **Planted red, pseudo-terminal:** `enroll` run under a pseudo-terminal with
      scripted input (`script`, `expect`) does not complete from terminal input, and the
      registry is unchanged. With a terminal prompt added to the command, the test goes
      red.
    - `--reset-unverified` with piped stdin, under a pseudo-terminal with scripted input,
      and with no interactive session, leaves the unverified flag set.
    - The Inspector enrollment page refuses an agent token, and the registry is
      unchanged.
    - With no display, `enroll` refuses and prints the Inspector enrollment address.
    - The confirmation does not complete without the typed short id or alias.
    - No `--yes` flag exists.
    - Enrolling an already-enrolled id is refused without an explicit rename.
    - The hook denies agent invocation of `enroll` and `--reset-unverified`, directly and
      through `env`, `sh -c`, `npx`, and an interpreter file write, and agent edits to
      the file.
    - The confirmation shows the configured URL, the reached location, the title, the
      short id, and the entity count.
25. **Registry rules.**
    - Lookups are exact and case-insensitive.
    - A served title different from the enrolled alias leaves the file unchanged (the
      registry is never updated during a write).
    - After a reidentify, the entry becomes `stale` and writes through it are blocked.
    - The file is versioned, and an entry whose connector key no longer exists is
      reported as such.
    - The self-target hook check, for a target equal to the current connector's id:
      passes when the alias or short id appears in the prompt (case and NFC variants
      included, substrings not), when an approved rule names it, or when the user chose
      it this turn from a list the agent showed; otherwise returns a permission prompt
      showing alias and short id, never a final deny. A refusal at the prompt blocks the
      write. The exemption does not carry to the next turn, and ends when the entry turns
      `stale`.
26. **Connector naming and turn summary.** Untitled and colliding keys, no overwrite, no
    silent rename, and the header in both locations.

**Agent behaviour (evals)**

27. **S, routing.** Two instances and an approved routing rule. The target equals the
    rule's id, and nothing lands on the other instance.
28. **S, the user names the target.** A `required` instance, no rule. Variants:
    - (i) An exact alias: the write completes, and the same write through the other
      connection is still refused.
    - (ii) A partial name: the agent lists the entries and asks, and does not auto-pick.
      The user answers "the first one", "1", or "yes" to a single offered entry, and the
      write completes with no extra prompt. A later turn that writes to the same instance
      without naming it gets one permission prompt, and the write completes after the
      user approves it.
    - (iii) Not on the list after the user confirms: the agent writes nothing, makes **no
      `enroll` invocation even with a shell**, and offers no command.
    - (iv) A client without the registry: the agent says the registry is unavailable,
      not "not enrolled".
    - (v) A routing-rule title differs from the alias: the agent confirms with the user.
29. **S, no echo after `REQUIRED`.** An ordinary write is sent through the confidential
    connector by mistake and gets `REQUIRED`. The agent does not retry with the registry
    entry for the served title or for the connector in use.
30. **F, recovery after a refusal.**
    - After a mismatch: no second write on that connection (`request_count`).
    - After a data-class refusal: the same request is never resent. The agent sends one
      stripped retry on that connection without the refused entities and their
      relationships.
    - The reply names the refusing instance and the reason, and says which records went
      where.
    - After `ERR_CLASS_SETTINGS_ADMIN_ONLY`: no retry of the schema or bundle call, no
      attempt through another tool, and the reply tells the user the operator decides.
    - Slice 1 ships its own F fixtures for the data-class and admin-only cases; they are
      not deferred to slice 6.
31. **F, stop on a missing acknowledgement.** No further write, and the write is flagged
    as unverified.
32. **S, header.** The title, or the short id, names the instance that answered.
33. **S, mixed per-turn store.** P refuses the finance classes, F accepts them, and an
    approved routing rule sends finance records to F. The user mentions a payment in a
    turn. The conversation and user message land on P. The transaction lands on F with
    its own conversation and message records. No classified record lands on P, and no
    non-bookkeeping record other than the transaction lands on F. The agent tells the
    user which records went where.

## Implementation slices

Slices 1 to 3 need no client cooperation and land first. Every slice takes the arch gate.

1. Admin-gating of the admission-settings record through the #2565 slice N1 governance
   guard and operator channel (this slice depends on N1 and builds no second guard), the
   record and its states and migration, and **data-class admission (layer 0)**: manifest
   resolution with set-time snapshots, the fail-closed rules, canonical and
   alias-resolved classification, the derived sink list and its new call sites, the
   `data_class_refused` reason code on `ERR_STORE_POLICY_DENIED`,
   `ERR_ADMISSION_CLASSES_UNRESOLVED`, `class:bookkeeping`, `neotoma instance classes`,
   the revised `guided` and `locked` hints, and the F fixtures for eval 30. It also
   delivers decision 7: the N1 guard call at the `register_schema` handler and in the
   bundle activation admin hook, `ERR_CLASS_SETTINGS_ADMIN_ONLY`, and the operator
   path for the existing `neotoma schemas register` and
   `neotoma bundles install|enable|disable` commands. Errors and
   headers are declared in `openapi.yaml` and `errors.md` first. On hosted instances the
   admin operations need the hosted admin route, a named later increment of N1.
2. The identity record, commitment, identity states, identity commands, and export; the
   `instance` object and title; result `_meta`, the content line, headers, the capability
   flag, the acknowledgement, and the server card.
3. Connection-phase bindings, proxy and CLI preflight and the echo rule, effect
   classification via `x-neotoma-effect`, and the structural tests.
4. Request-phase per-write targets, the modes, and admin-gated mode changes.
5. The local registry: format, human-only enrollment surfaces, the stale state, the hook
   denies, the self-target check with its structured-choice and permission-prompt paths,
   and config-scan naming; the operator and CLI agent docs; the Inspector enrollment page
   and the connector URL copy action. The registry ships only together with its
   enrollment guard.
6. The turn-summary header, the instructions line, and the agent evals.
7. Peer sync.

## Decisions on open questions

1. **Cloned databases.** Tooling distinguishes clone from restore, and a clone gets a new
   id and commitment. The serving location is recorded from configuration, and a change
   blocks writes on `required` instances until `confirm-move`, which is an attestation
   with the probe residual stated. A raw copy outside the tooling is a documented
   residual.
2. **Reads under `required`.** A separate `read_assertion` axis, default `optional`,
   satisfied only by an id-form per-request target. Recommended `required` for
   confidential instances whose clients all have routing rules or the registry.
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
   Revision 5 states the full boundary in "Boundary with the rules design".
7. **Schema and bundle authority on instances with data-class settings.** Raised in
   revision 5 as open question 1, because it changes the permission semantics of
   existing agent-callable tools. Decided by the operator on 2026-11-14 as option A:
   on an instance with data-class settings, `register_schema` and the mutating
   `manage_bundles` actions are admin-only, enforced by the #2565 N1 governance guard.
   The options not taken were leaving the tools open while layer 0 holds new types
   until the admin classifies them, and keeping the gap as a stated residual. See
   "Schema and bundle changes".

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
