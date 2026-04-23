# GitHub Releases (neotoma)

Every **version tag** published to GitHub MUST have a matching **[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)** with human-readable notes. Tags alone are not enough for subscribers and npm users scanning changes.

**Before notes or `release-notes:render`:** Run preflight — `git fetch`, `git log origin/main..origin/dev`, `git status`, submodules, and choose compare range (prefer tag on `main` after merge; provisional draft from `dev` OK if re-rendered after tag). If the working tree is dirty, the `/release` preview **must** merge local changes into the same supplement sections as committed work (as if already committed); see `.cursor/skills/release/SKILL.md` Step 3. Commit only what should ship before tagging, respecting protected paths.

**Agent workflow:** When the user asks to **prepare a release** (or equivalent), follow the `/release` skill (`.cursor/skills/release/SKILL.md`). Do not use commit lists alone as the narrative. The preview step must show the same rendered Markdown body later passed to `gh release create --notes-file`.

## Template layout

1. **Wrap (fixed structure):** [`.github/release_notes_wrap.md`](../../.github/release_notes_wrap.md) — install commands, npm/compare table, commit list, compare link. Do not duplicate this by hand each time.
2. **Supplement (per release):** `docs/releases/in_progress/<TAG>/github_release_supplement.md` (then under `completed/<TAG>/` after the release moves). Follow the section pattern in [`github_release_supplement.example.md`](github_release_supplement.example.md) (audiences: npm users, API/OpenAPI, site/CI, breaking changes).

The supplement MUST start with a short **Highlights** section immediately after the one-line summary so upgrade readers can scan the value quickly.

### Highlights drafting rule

Highlights are not a commit-message summary; they are the upgrade pitch. Draft them by walking the **actual release scope** (shipped commits plus any folded-in working-tree work, OpenAPI diff, relevant plans under `.cursor/plans/`, subsystem docs) and extracting the user-visible benefit of each major subsystem that changed.

Rank candidate bullets by upgrade motivation, keep **3-5 total** (absolute max 7), and prefer fewer:

1. **New capability** — something the reader can now do that was impossible or painful before (e.g. repair an over-merged entity, verify a signed writer, diff against an external store).
2. **Visibility / trust / safety** — information or guarantees the reader newly gets (e.g. attribution tier exposed on every write, structured migration guidance on validation errors).
3. **Ops / quality-of-life** — defaults changed to the sane thing (e.g. `api start --env prod` flip, watch-mode default).
4. **Breaking-change cleanup** — only headline-worthy if the cleanup unlocks a new capability; otherwise keep it in **Breaking changes**, not in Highlights.

Each bullet uses the shape `- **<Bolded benefit claim in plain English>.** <One concrete mechanic sentence naming the tool, endpoint, field, flag, or file that delivers the benefit.>`. The benefit claim leads with what the reader can do or know; avoid implementation verbs ("refactored", "introduced middleware", "added service"). The mechanic sentence names the user-addressable hook (endpoint, MCP tool, CLI flag, schema field) exactly once so readers can map it to the detailed sections.

Cut aggressively. Single bug fixes, field tightenings, internal refactors, doc moves, and test-only changes are supporting cast and belong under the later audience sections, not Highlights.

### Comprehensive body coverage rule

Highlights are tight; the body is **comprehensive**. Take the time needed to explain every significant user-impacting change in the detailed sections — omission and under-explanation are equally bad. A change is user-impacting if it affects any audience: npm/CLI users, HTTP/OpenAPI callers, MCP tool callers, agent authors (including via the MCP instructions the server ships to clients), server operators, plugin/hook/SDK integrators, the Inspector/frontend, or the feedback/triage pipeline.

Before writing body sections, walk these source lanes and confirm each is covered somewhere in the supplement: committed commits since the base tag; dirty working-tree and untracked files (folded in as if committed); `openapi.yaml` diff (routes, schemas, validation tightenings); MCP tool diff in `src/tool_definitions.ts`; agent-facing instruction diffs in `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, and `AGENTS.md` (these ship to every connected client and count as user-facing); CLI diff (`src/cli/index.ts`, `package.json` scripts); runtime middleware / reducers / adapters / schema registry; plugin and hook packages under `packages/`; `frontend/` and `inspector/`; new `services/…` and `scripts/…`; new subsystem docs; new or changed tests; new env vars (grep `.env.example` and `NEOTOMA_*`); and security-relevant changes.

Every significant user-impacting item from the above lanes MUST appear in at least one body section with enough detail that the reader can act on it — endpoint path, tool name, CLI flag, env var, schema field, or file path. Supporting-cast items (internal refactors, test-only tweaks, doc typo fixes, generated-code churn) can be summarized in aggregate; substantive behavior changes cannot. Verbosity in body sections is fine when the content is substantive; add subheadings rather than cutting.

When a release changes agent-facing behavior via the shipped MCP instructions, include a dedicated **Agent-facing instruction changes** section calling out each net-new rule or block.

## Supplement immutability

Once a tag is published, its supplement under `docs/releases/completed/<TAG>/` is **historical**. Treat it as immutable:

- **Do not** rewrite a completed supplement to backfill information discovered after the tag shipped (e.g., a breaking change that was missed in the notes). Rewriting the file misrepresents what was communicated at release time.
- **Do** ship a patch release with its own supplement that documents the retroactive fix, and / or update the GitHub Release body via `gh release edit <TAG> --notes-file ...` to cross-link the new supplement. The live GitHub Release body is allowed to evolve; the in-repo supplement is not.
- **Do-only doc fixes** (install.md clarifications, new error hints, upgrade notes) that change user-facing guidance still warrant a version increment. When in doubt, use a patch bump.

### Validation tightening is breaking

Tightening request-shape validation is **always** a breaking change, even when the tightened input was never formally declared in `openapi.yaml`. The v0.5.0 `attributes`-nested regression is the canonical example: a resolver tolerance was removed, existing client payloads stopped being accepted, and because the shape had never been declared, the breakage was invisible to SemVer heuristics and release-notes authors.

A PR counts as a validation tightening whenever any of the following are true:

- Adding `additionalProperties: false` to a request schema that previously accepted arbitrary fields.
- Promoting a field from optional to required.
- Narrowing an enum, numeric range, or string pattern.
- Removing a resolver tolerance for a request shape that previously succeeded (nested `attributes`, alias field names, flat-vs-wrapped alternatives).
- Removing or renaming a request field, query parameter, or operation.

Minimum supplement requirements for a release that contains any tightening:

- The **"Breaking changes"** section in the supplement is **required and explicit**. An empty section carries a single line (`No breaking changes.`) rather than being omitted; this is what the release-skill preflight gate inspects.
- Each tightening lists (1) the before/after request shape, (2) the error code now returned, (3) the structured `hint` text clients will see, and (4) the migration step callers must take.
- The matching legacy-payload fixture under `tests/contract/legacy_payloads/` is updated in the same PR (see `docs/subsystems/errors.md` § Tightening-change hint obligation).

Version bump: a release containing any tightening MUST bump the **minor** segment at minimum (or **major** during 1.x+); patch-only rollouts are not allowed to ship tightenings. This rule is enforced in the release-skill preflight (`.cursor/skills/release/SKILL.md` Step 1) via the OpenAPI breaking-change diff gate.

## Render release notes

Use **silent** npm output when redirecting to a file (otherwise npm prints script headers into the file):

```bash
npm run -s release-notes:render -- --tag v0.3.11
```

Or call the script directly (no npm banner):

```bash
npx tsx scripts/render_github_release_notes.ts --tag v0.3.11
```

For a **pre-tag preview** of the final GitHub Release body, render against the intended release ref while keeping the future tag in the wrap:

```bash
npx tsx scripts/render_github_release_notes.ts --tag v0.4.3 --head-ref HEAD
```

Use `--supplement` when the draft body lives outside the canonical in-progress path.

Optional custom supplement path:

```bash
npm run -s release-notes:render -- --tag v0.3.11 --supplement path/to/extra.md
```

**Skipped npm version:** If a git tag exists but that version was **never published to npm** (registry still on an older semver), set **`--compare-base`** to the **last published npm tag** so the GitHub compare link and commit list match what registry users actually upgrade from:

```bash
npm run -s release-notes:render -- --tag v0.4.0 --compare-base v0.3.10
```

## Create or update the GitHub Release

After the tag exists on `origin`:

```bash
TAG=v0.3.11
npm run -s release-notes:render -- --tag "$TAG" > /tmp/gh-release-"$TAG".md
gh release create "$TAG" --title "$TAG" --notes-file /tmp/gh-release-"$TAG".md
# or if the release already exists:
gh release edit "$TAG" --notes-file /tmp/gh-release-"$TAG".md
```

## Publish to npm

A normal `/release` is **not finished** until the new version is on the npm registry. After the tag is on `origin` and the GitHub Release exists, run **`npm publish`** from the package root (same ordering as `.cursor/skills/release/SKILL.md` Step 4). GitHub Releases alone do not update npm installs. Skip **`npm publish`** only when the user explicitly confirmed a GitHub-only / no-registry scope.

Before the tag exists, `/release` should still render the preview body to a temp file with `--head-ref` and show that Markdown verbatim for approval. After the tag/commit set is finalized, re-render without `--head-ref` before `gh release create`.

If the **last npm publish** is older than the previous git tag (example: **`v0.4.0`** after **`v0.3.11`** was never on npm):

```bash
TAG=v0.4.0
npm run -s release-notes:render -- --tag "$TAG" --compare-base v0.3.10 > /tmp/gh-release-"$TAG".md
gh release create "$TAG" --title "$TAG" --notes-file /tmp/gh-release-"$TAG".md
```

The `/release` skill ([`.cursor/skills/release/SKILL.md`](../../.cursor/skills/release/SKILL.md)) requires this flow for all future releases.
