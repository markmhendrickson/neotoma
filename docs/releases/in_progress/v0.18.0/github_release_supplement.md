# v0.18.0 Release Supplement

## Highlights

v0.18.0 closes the "my files and my edits are part of the loop" gap for local-first operators with two long-standing evaluator asks — **by-reference source storage** and **disk-to-entity write-back** — alongside the **Bundles** capability system (definition → runtime → activation → surfacing), richer sandbox showcase packs, and a set of cross-user read-leak security fixes.

## What changed for npm package users

**Sources / storage — by-reference (`source_storage: "reference"`)** (closes #1775)
- `store` (and `parse_file`) accept `source_storage: "inline" | "reference"`. With `reference`, Neotoma reads the file once to compute its `content_hash` + metadata and persists a `sources` row **without** copying the bytes — so a large or local file (e.g. a PDF on a space-constrained machine) becomes first-class in the graph without inflating the DB.
- Retrieval resolves the path at read time; a moved/deleted file surfaces a structured `SOURCE_UNAVAILABLE` (never a misleading empty blob), and content drift surfaces `SOURCE_REFERENCE_STALE`. Content-addressing, dedup, and interpretation linkage are unchanged.
- Default `inline` ⇒ zero behavior change for existing callers.

**Mirror profiles — disk-to-entity write-back (`neotoma mirror push`)** (closes #1776)
- New `neotoma mirror push <path|profile>` round-trips operator edits of a mirrored markdown file back into Neotoma as `correct()`-ions, behind an opt-in per-profile `allow_disk_writeback`.
- Editable fields only (generated/frontmatter regions are ignored); a 3-way diff against the last-synced base flags conflicts instead of overwriting; `--check` previews the exact corrections; edits are stamped `observation_source: "human"`.

**Bundles**
- A capability-bundle system landed end-to-end: definition lock (m1), runtime loader + enforcement + linter (m2), activation state store + CLI + `manage_bundles` MCP tool (m3), and `/bundles` surfacing — HTTP route + Inspector panel + scaffold tooling (m4).

**Docs / onboarding**
- `docs/foundation/what_to_store.md` now leads with **"you don't keep Neotoma clean — Neotoma keeps your state clean for you"** and recasts the Tier 1/2/3 tables as a guide, not a gate.
- New `docs/vocabulary/plain_language.md` — a plain-language primitives cheat-sheet (record/entity, observation, source, interpretation, relationship) with a "you say → Neotoma says" mapping.

## Behavior changes
- All additive / opt-in. `source_storage` defaults to `inline`; `allow_disk_writeback` defaults off; bundles enforce only when installed.

## Security hardening
- Scoped pre-existing cross-user read leaks in MCP handlers + aggregates (#1795).
- Sandbox: degrade an unresolvable session bearer to anonymous instead of 401 (#1790); exempt internal seeding from the write rate limit (#1797).

## Breaking changes
- None. Every new surface is opt-in and backward-compatible.

## Documentation
- Neotoma issues #1775 / #1776 carry the full designs; both were driven by developer-release evaluator feedback.
