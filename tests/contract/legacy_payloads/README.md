# Legacy-payload corpus

This directory captures real request bodies that shipped in earlier Neotoma minor versions and declares how the current build MUST treat them. Its purpose is to catch **silent validation tightenings** — changes that narrow an accepted request shape without being declared in `openapi.yaml` or the release supplement.

The motivating case is the v0.5.0 `attributes`-nested breaking change: a resolver tolerance for `{ entity_type, attributes: { ... } }` was removed, existing client payloads stopped working, and no gate flagged the tightening until a user upgraded in the field. The corpus turns that failure mode into a CI signal.

Canonical home: `docs/architecture/openapi_contract_flow.md` § Legacy-payload corpus.

## Directory layout

```
legacy_payloads/
  v0.4.x/
    <scenario>.payload.json       # Request body sent to the endpoint
    <scenario>.outcome.yaml       # Expected outcome for the current build
  v0.5.x/
    …
  CHANGES.md                      # Per-version notes when an outcome flips
  README.md                       # This file
  replay.test.ts                  # Vitest runner
```

Subfolders are named after the minor version during which the payload was **accepted and shipping** — not the version that tightened it. A payload that was valid on v0.4.x and is now rejected still lives under `v0.4.x/`; only its `outcome.yaml` changes.

## `<scenario>.outcome.yaml` shape

```yaml
endpoint: "POST /store"          # HTTP method + path
outcome: valid                   # one of: valid | deprecated | rejected
# When outcome is `rejected`:
error_code: "ERR_STORE_RESOLUTION_FAILED"
issue_code: "ERR_CANONICAL_NAME_UNRESOLVED"   # optional; for resolution-envelope errors
hint_match: "attributes"         # optional substring or /regex/ the structured hint MUST contain
notes: |                         # optional human context
  Pre-v0.5.0 shape that nested entity fields under `attributes`.
  v0.5.0 removed resolver tolerance; v0.5.1 added the structured hint.
```

Fields:

- `endpoint`: the exact HTTP method and path. The runner uses this to pick the target URL.
- `outcome`:
  - `valid` — the request MUST return a 2xx response.
  - `deprecated` — the request MUST return a 2xx response **and** include a deprecation marker (either `Deprecation`/`Sunset` header or a structured `deprecated: true` flag in the body). Reserved for future use.
  - `rejected` — the request MUST return a 4xx response with the declared `error_code`.
- `error_code`: required when `outcome: rejected`. Matches the `error.code` field on the standard envelope or the top-level code on the resolution envelope.
- `issue_code`: optional; when the error uses the resolution envelope (`ERR_STORE_RESOLUTION_FAILED`), assert that at least one `issues[].code` matches this value.
- `hint_match`: optional substring or `/pattern/` the `issues[].hint` field MUST match. Enforces the "tightening-change hint obligation" from `docs/subsystems/errors.md`.
- `notes`: optional human-readable context.

## Adding a payload

1. Drop the request body into `tests/contract/legacy_payloads/<version>/<scenario>.payload.json`. Use a real body your client sent — do not synthesize.
2. Write the matching `<scenario>.outcome.yaml` capturing the expected current behavior.
3. Run `npm test -- tests/contract/legacy_payloads/replay.test.ts` and confirm it passes.
4. If the payload is being added because an existing outcome flipped (for example, moving from `valid` to `rejected`), add a one-line entry to `CHANGES.md` under the version whose shape is being narrowed. The release-skill preflight and release supplement both reference this log.

## Outcome-flip workflow

When a PR causes a previously-`valid` payload to stop passing:

1. Decide whether the tightening is intentional. If not, restore compatibility in the PR.
2. If intentional, flip `outcome` to `rejected` (or `deprecated`), populate `error_code` and `hint_match`, and add a `CHANGES.md` entry.
3. Confirm the relevant error path emits a structured `hint` (see `docs/subsystems/errors.md` § Tightening-change hint obligation).
4. Add the tightening to the release supplement's **Breaking changes** section. The release-skill preflight refuses to tag a release whose supplement omits a known outcome flip.

## Related docs

- `docs/architecture/openapi_contract_flow.md` § Legacy-payload corpus — directory contract and dependency wiring.
- `docs/subsystems/errors.md` § Tightening-change hint obligation — the `hint` rule this corpus enforces.
- `docs/developer/github_release_process.md` § Validation tightening is breaking — why outcome flips are SemVer-breaking.
- `.cursor/skills/release/SKILL.md` — preflight gate that inspects this corpus plus the supplement.
