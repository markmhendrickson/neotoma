# Neotoma CLI Onboarding Specification

## Status

Draft. Not yet built. This specification consolidates self-serve onboarding into a
single CLI-driven wizard and defines how the shared-instance and hosted-sandbox
entries reuse that same implementation.

## Scope

This document covers:

- The CLI wizard flow from first command to the day-two activation check
- Harness detection, harness CLI installation offers, and configuration writes
- Two-stage workflow detection (local scan, then consented probes)
- Consent for anonymous usage reporting and issue submission
- Instance selection across location and tenancy, including shared-instance join
- Handoff into the first agent session and optional web connector configuration
- Measurement of the activation moment

This document does NOT cover:

- Reducer, ingestion, or schema behavior invoked after activation
- The `neotoma.io` marketing surface copy
- Hosted sandbox provisioning and lifecycle internals

## Goals

1. Reduce self-serve onboarding to one implementation with one owner.
2. Move every configuration decision out of the agent harness and into a process
   that triggers no harness permission prompts.
3. Reach the activation moment, defined below, with the smallest number of
   irreversible commitments before it.
4. Give the invitee path an owner. It currently has none.
5. Make each step measurable, or state plainly that it is not.

## Key problems solved

1. **Configuration friction inside harnesses.** Asking an in-harness agent to install
   an MCP server produces per-command permission prompts and, for GUI harnesses, a
   restart that ejects the user mid-flow.
2. **The heaviest recorded drop-off.** The npm path's install-and-connect stage is the
   largest single drop-off recorded in the funnel model, and its first-run stage is
   unsignposted: an experienced operator could not distinguish an awkward step from a
   broken one, so two P0 defects went unreported for weeks.
3. **A blank first session.** Users complete setup correctly and still have nothing to
   ask. Observed against a graph of 16,249 contacts. Data volume does not produce a
   first question.
4. **Fragmented onboarding surfaces.** Three overlapping pre-install drafts plus a
   hand-maintained client onboarding page encode different assumptions about what the
   user operates on.
5. **Undisclosed outbound traffic.** Issue submission defaults to on and points at the
   operator instance (`src/services/issues/types.ts`), never surfaced to the user. The
   npm path is therefore not a zero-exfiltration baseline today.
6. **Unowned invitee path.** Invitees receive a URL, install no software, and make a
   disclosure decision rather than a product decision. No packaged flow serves them.

## Key solutions implemented

1. A single CLI wizard owns detection, consent, instance selection, configuration, and
   handoff, with three entry preambles rather than three flows.
2. `npx` entry for the sandbox and join cases, so nothing is installed before the user
   has seen value.
3. Two-stage detection: a deterministic local scan, then optional probes that borrow
   the user's own harness and credentials.
4. Consent screens that fix the existing undisclosed issue-submission default.
5. A join command that renders the instance disclosure contract in the terminal.
6. A handoff that launches the first session with detection results attached.

## Path model

The three paths are one implementation with three preambles. They MUST NOT be
collapsed into one script, because the point at which conviction is earned differs:

| Path | Entry | Conviction | Installs |
| --- | --- | --- | --- |
| Sandbox (self-serve) | `npx neotoma try` | Must be manufactured before commitment | Nothing |
| Local (self-serve) | `npm i -g neotoma` then `neotoma init` | Already earned off-surface | Server plus config |
| Join (invitee) | `npx neotoma join <host>` | Endorsement buys attention, not agreement | Config only |

Constraints:

- The wizard MUST NOT run elicitation content at an invitee. They have already agreed
  to look. What remains to earn is informed agreement about scope and visibility.
- The sandbox entry SHOULD be presented first for users with no prior commitment,
  because it places the activation moment before any install decision.
- All three paths converge after instance selection and share every later step.

## Flow specification

### Step 0. Entry and mode selection

The wizard runs interactively when stdout is a TTY and `--yes` is absent. With no TTY,
or with `--yes`, the CLI MUST retain current non-interactive behavior so agent-driven
installs described in `install.md` continue to work.

The wizard MUST NOT be launched from an npm `postinstall` hook. Install hooks are
non-interactive and frequently sandboxed. Entry is always an explicit foreground
command.

### Step 1. Harness detection

Detection probes three independent properties per harness and MUST NOT conflate them:

1. Launcher CLI present (for example `code`, `cursor`), often opt-in on PATH.
2. Agent CLI present (for example `claude`, `codex`, `cursor-agent`), always a
   separate installation.
3. Configuration file writable, which is the only property the wizard requires.

Detection also reads each harness's transcript store to count sessions and recent
activity, and enumerates already-configured MCP servers to determine which probes are
possible later.

Output is an inventory listing version, session count, configured MCP servers, and
whether a restart is required on configuration change.

### Step 2. Optional harness CLI installation

When a user's primary harness is a desktop application with no agent CLI present, the
wizard MAY offer to install one. Rules:

- The offer MUST state what the installation buys: first-session launch without
  copy-paste, and optional workflow ranking.
- Installation MUST be explicit and skippable. Declining MUST leave a working flow.
- After installation the wizard MUST check authentication state before relying on the
  CLI, because a fresh install is unauthenticated.
- A freshly installed agent CLI starts with its own configuration scope and does not
  inherit the desktop application's MCP servers. The wizard MUST re-enumerate MCP
  servers after installation rather than assuming the desktop application's connectors
  are reachable.

### Step 3. Stage A local scan

Deterministic, local, and free. No model call and no network request. Stage A extracts
five signal classes from harness transcript stores:

1. Harness-written session summaries and titles already stored on disk.
2. Tool-call signatures, meaning which tools co-occur within a session.
3. Rhythm and locus: sessions per directory, cadence, recency.
4. Lexical entity density: repeated proper nouns, addresses, domains, ticket
   identifiers. This applies the existing file ranking heuristic to transcripts.
5. Ambient context: working directory, git branches, skills invoked.

Stage A output is a set of activity clusters, each carrying its evidence. Stage A MUST
render before any Stage B work begins, and the wizard MUST NOT block the first result
screen on a model call.

### Step 4. Stage B consented probes

Optional enrichment through the user's own harness and credentials. Two kinds:

1. Interpretation: a headless agent run ranks and names Stage A clusters.
2. Live probes: bounded, read-only queries through MCP servers the user already has
   configured, for example a mail search limited to a recent window returning counts
   and subjects.

Constraints:

- Each probe MUST be individually consented and default to off.
- Probes MUST use the narrowest read-only tool allowlist. The wizard MUST NOT disable
  the harness permission system.
- Probe output MUST be treated as untrusted data, validated against a schema, and MUST
  NOT trigger writes or configuration changes. Mail and document content is a prompt
  injection vector.
- Probe availability is the intersection of: agent CLI present, MCP server configured
  in that CLI's scope, and CLI authenticated. When the intersection is empty, the
  wizard proceeds with Stage A results.
- Each probe MUST declare its expected duration and that it consumes the user's own
  model quota. Every probe MUST have a timeout and a skip.

### Step 5. Workflow selection

The wizard presents three to five ranked workflow options, each showing the evidence
that produced it. The selection seeds the first session and is stored so the detection
result survives the install boundary.

### Step 6. Instance selection

Two independent axes, defaulting to local and individual:

| Location | Tenancy | Installs | Reach |
| --- | --- | --- | --- |
| Local | Individual | Server plus config | This machine only |
| Hosted | Individual | Config only | Web and mobile after connector setup |
| Hosted | Shared | Config only | Web and mobile after connector setup |
| Local | Shared | Server plus config | Local network only |

The wizard MUST state reach as part of this choice. Local instances are not reachable
from web or mobile clients, and this is a property of the instance, not of the
configuration method.

### Step 7. Shared instance join

`neotoma join <host>` performs configuration only. The instance already exists.

Before authorizing any connection, the wizard MUST render the instance disclosure
contract, fetched from the instance's policy record:

1. What the instance is for.
2. What it holds, expressed as capability and shape only.
3. What it refuses.
4. Who can read what the user writes.

Additional constraints:

- Joining MUST require an explicit accept. Passive acceptance MUST NOT be inferred,
  because declining a colleague's invitation is socially costly.
- Pre-authentication views MUST NOT display record contents. Invitation links are
  forwarded, and the viewer is unauthenticated at view time.
- The join step MUST show which identity is about to be authorized before the OAuth
  handoff. Instance allowlists SHOULD accept multiple addresses per person, because a
  user's mail address and sign-in address frequently differ.
- Instance policy that would reject the user's intended entity types MUST be surfaced
  here, not discovered on first write.

### Step 8. Consent

Two questions, asked once, both changeable later:

1. Anonymous usage reporting. Counts and shapes, never contents. Preview before send.
   Fail-closed allowlist. Defaults to off.
2. Issue submission. Modes are ask, proactive, and off.

The wizard MUST correct the current undisclosed default rather than merely asking
about it. Outbound issue submission MUST NOT remain on by default and unsurfaced.

Outbound usage reporting remains gated on the operator decision tracked in
neotoma#213. Until that decision ships, this step configures a setting and sends
nothing.

### Step 9. Configuration

Order of operations:

1. Write configuration using harness-native commands where they exist, falling back to
   direct file writes where they do not.
2. Verify each write. A success exit code is not verification. Configuration writes
   MUST be confirmed by reading back the result, because users report being unable to
   tell whether installation worked.
3. Restart only where required. Hot-reloading harnesses MUST NOT be restarted.
4. Perform at most one restart, consented, at the end of configuration.

The wizard MUST NOT restart the harness that hosts the process invoking it. This is
only safe because the wizard runs outside the harness.

### Step 10. Web connector configuration

Offered only for remote instances. Local instances MUST be reported as unreachable
from web clients, with the change that would make them reachable stated plainly.

For remote instances the wizard displays the instance URL, the connector name, the
authentication value if one is required, a link to the client's connector settings,
and a note that account-level connectors reach web, desktop, and mobile.

This output MUST also be written to a file, because scrollback is lost. A command MUST
exist to reprint it.

### Step 11. Handoff

The wizard ends by starting the first session rather than instructing the user to.

- Where an agent CLI is present, the wizard offers to launch it with the seed prompt as
  the initial prompt. All three supported agent CLIs accept a positional initial
  prompt, and the CLI already spawns child processes.
- Where no agent CLI is present, the wizard prints the seed prompt for pasting.

The seed prompt follows the field-tested structure: identity, orient, detect, propose,
seed, show me something, hand off. It MUST pause at propose for confirmation, which
satisfies the existing preview contract. It MUST carry the Stage A and Stage B
detection results so the session does not repeat discovery.

The wizard also emits two to four follow-up prompts tied to the selected workflow and
the entities actually seeded. Generic prompts MUST NOT be used. Prompts MUST be written
to a file and reprintable.

### Step 12. Day-two check

The final screen provides a copyable day-two prompt with two parts: does the agent
recall what session one produced, and does it respect the stated boundary. The prompt
MUST ask the agent to state where it learned what it recalls.

## Harness adapter matrix

Each harness has an adapter declaring the following. All values MUST be probed at
runtime, because harness command surfaces drift across versions.

| Property | Purpose |
| --- | --- |
| Launcher CLI binary | Detection only |
| Agent CLI binary | Headless probes and launch |
| Headless invocation form | Stage B and handoff |
| Initial-prompt launch form | Handoff |
| Tool allowlist flag | Stage B scoping |
| Configuration method | Native command or file write |
| Configuration path | File write fallback |
| MCP enumeration method | Probe availability |
| Hot reload behavior | Whether restart is needed |
| Restart method | Per platform |
| Transcript store path | Stage A |

Adapters MUST degrade to Stage A plus file-write configuration when a harness's
headless contract changes. Version probing and graceful degradation are ongoing
maintenance obligations, not one-time work.

## Activation and measurement

The activation moment is second-session visible recall. It has four properties:

1. Cross-session. Recall inside one long session proves context size, not persistence.
2. On the user's own data. Recalling material a colleague already stored proves the
   graph has data, not that this user's work was remembered.
3. Visibly attributed. Silent recall is indistinguishable from a lucky guess.
4. Binary and instrumentable. Either a session-two turn retrieved an entity written in
   session one and said so, or it did not.

Consequences the wizard MUST respect:

- An invitee experiencing recall of pre-existing team data in session one is NOT
  activated.
- A user whose agent is configured to be terse may never witness activation. Verbosity
  configuration and activation design MUST be resolved together.
- Sandbox usage is a conviction moment, not activation. Sandbox metrics MUST NOT be
  reported as activation.

Top-of-funnel measurement:

- Package registry download counts provide an install denominator with no code and no
  outbound path. They are noisy and MUST be labeled as such.
- First-run events SHOULD be recorded locally and transmitted only after consent.
  Nothing MUST leave the machine before the consent step resolves.
- Any pre-consent transmission, if the operator decision permits one, MUST be disclosed
  on screen before it occurs. Silent pre-consent transmission is forbidden.

## Context cost

Model context consumed during onboarding is a product cost. Multiple independent
reports identify context cost as a barrier, including one measurement at 19 percent of
a user's total budget. Stage B probes and seed prompts consume that budget directly.

The wizard MUST bound probe output size and MUST NOT attach raw transcript excerpts to
the seed prompt where a summary suffices.

## Version gates and known defects

| Dependency | Effect on this flow |
| --- | --- |
| neotoma#2187 | Standing rules reach clients only through `serverInfo._neotoma`, which clients drop. Join-time display is therefore the delivery mechanism. |
| neotoma#1974, #2011, #1975 | Merged but unreleased. Instances serving earlier versions expose no instructions field, so the wizard MUST fall back to reading the standing rule entity. |
| neotoma#2161 | `publish_rendered_page` stores empty bodies on some instances. Page writes MUST be verified by byte count. |
| neotoma#213 | Outbound usage reporting is gated on an operator decision. Until it ships, the consent step configures without transmitting. |
| neotoma#2086 | Issue submission defaults to on and is never surfaced. Step 8 MUST fix this. |

The harness instruction file copy written as a workaround for #2187 MUST carry an
explicit approval gate and MUST be retired when #2187 ships. Join-time display and
consent are permanent and MUST NOT be retired with it.

## Out of scope

- A no-agent fallback surface for self-serve users. Possession of an agent harness is
  an accepted gate for the self-serve paths.
- A general shared-instance directory service. A short curated list with opt-in
  listings is sufficient initially.
- Autoplaying or branching simulations of this flow beyond the published walkthrough.

## QA needs

1. Clean-machine installation on macOS, Linux, and Windows. Packaging failures on
   clean machines are recorded and block every later step.
2. Each harness adapter verified against a real installation for detection,
   configuration write, read-back verification, and hot reload behavior.
3. Declined-probe path verified to produce a usable workflow menu from Stage A alone.
4. Join flow verified against an instance serving an older version with no
   instructions field.
5. Restart path verified to leave the harness running with Neotoma reachable.
6. Day-two recall verified end to end on a real second session.
7. Non-technical invitee walkthrough repeated, since the recorded live run surfaced the
   address mismatch that nearly blocked it.

## Automated tests

1. Unit: Stage A signal extraction against fixture transcript directories for each
   harness format, asserting deterministic cluster output and stable ordering.
2. Unit: adapter capability probing with stubbed binaries present, absent, and
   returning unexpected version output.
3. Unit: Stage B schema validation rejecting malformed and injection-shaped probe
   output without performing writes.
4. Integration: configuration write plus read-back verification per adapter against a
   temporary home directory.
5. Integration: join flow against a local instance, asserting that disclosure renders
   and that no connection is authorized without explicit accept.
6. Integration: consent defaults, asserting that no outbound request occurs when both
   consents are declined.
7. CLI coverage guard updated for every new top-level command, per existing repository
   requirements.

## Documentation update needs

1. `install.md` gains the interactive wizard path alongside the existing agent-driven
   sequence, with the TTY and `--yes` split stated explicitly.
2. `docs/specs/ONBOARDING_SPEC.md` updated to reference this specification for the
   self-serve and invitee paths.
3. `docs/developer/cli_reference.md` documents `try`, `join`, and the new
   runtime overrides.
4. `docs/developer/agent_onboarding_confirmation.md` records that detection may arrive
   pre-computed from the wizard.
5. Contract mappings and CLI command coverage updated per repository change guardrails.

## Open decisions

1. Operator sign-off on shipping any outbound reporting path (neotoma#213). This
   determines whether install-to-activation conversion is measurable at all.
2. Whether a disclosed pre-consent first-run ping is acceptable, or whether registry
   download counts are the only top-of-funnel signal.
3. Which harness receives second-tier adapter investment, decided on user counts rather
   than implementation cost.
4. Whether the sandbox entry becomes the default presented option for users arriving
   with no prior commitment.
