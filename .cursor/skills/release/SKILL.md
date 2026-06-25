---
name: release
description: Prepare a GitHub + npm + sandbox release with preview. Covers preflight, changelog preview, RC branch + PR for public review, version bump, tag, GitHub Release creation, npm publish, and sandbox.neotoma.io deployment.
triggers:
  - new release
  - release
  - /release
  - create release
  - prepare a release
  - prepare release
  - prep release
  - /publish
  - publish
---

# Release

Prepare and ship a GitHub + npm + sandbox release with a mandatory preview step. A confirmed **execute** run is **not complete** until **`npm publish`** succeeds from the published package root and `sandbox.neotoma.io` is deployed and verified, unless the user explicitly scoped the request to GitHub-only / no registry / no sandbox.

## When to Use

When you want to ship what is on `dev` (or the current integration branch) to `main`, tag it, publish to npm, create a GitHub Release with curated notes, and update the public sandbox deployment.

Trigger with `/release`, or naturally ("prepare a release", "let's ship v0.5.0").

## Reference Documents

| Document | Role |
|----------|------|
| `docs/developer/github_release_process.md` | GitHub Release template layout, `release-notes:render` usage, `gh release create` |
| `docs/developer/github_release_supplement.example.md` | Section pattern for the human-readable supplement |
| `docs/infrastructure/deployment.md` | Sandbox Fly deployment command and verification |
| `docs/subsystems/sandbox_deployment.md` | Sandbox runtime behavior and operator runbook |
| `.github/release_notes_wrap.md` | Fixed wrap template (install commands, npm/compare table, commit list) |

## Workflow

### Step 1: Preflight

Run before anything else:

1. **Fetch**: `git fetch origin` (and other configured remotes).
2. **Determine branches**: Default integration = `dev`, target = `main`. Override if the user specifies.
3. **Commits not on main**: `git log origin/main..origin/dev --oneline` (or `origin/main..HEAD` on integration branch). This is the default scope of "what ships."
4. **Uncommitted changes**: `git status --short`. If dirty, describe the actual pending work grouped by area/impact using `git diff --stat` and targeted file inspection. Do not use a generic placeholder.
5. **Submodules**: `git submodule status` — surface any that are ahead/behind recorded SHAs.
6. **Previous tag**: `git tag --sort=-v:refname | head -1` — this is the compare base unless the user specifies `--compare-base`.
7. **Current package.json version**: Read and display.
8. **Existing GitHub Release check**: Run `gh release view "vX.Y.Z" --json isDraft,tagName 2>/dev/null` for the target version. If a release exists and is a draft, surface this to the user ("Draft release vX.Y.Z already exists on GitHub — execute will update it rather than create a new one."). If a release exists and is **not** a draft (already published), **STOP** and ask the user explicitly before proceeding — updating a published release's notes is a hold point.
9. **Sandbox deploy readiness**: Confirm `fly.sandbox.toml` exists, `flyctl` is available, and the active Fly account can deploy `neotoma-sandbox`. If Fly auth is missing, report that execute will block at sandbox deployment unless the user explicitly scopes the release to no sandbox.

### Step 2: Resolve Version

1. If the user provided a version (e.g. "v0.5.0"), use it.
2. Otherwise, propose next patch from the latest tag: if latest is `v0.4.2`, propose `v0.4.3`. If the user wants a minor or major bump, ask once.
3. Confirm: "Release as **vX.Y.Z**?"

### Step 3: Preview

Draft the supplement following the section pattern from `docs/developer/github_release_supplement.example.md`:

- **Summary**: One plain-English sentence of what this release ships.
- **What changed for npm package users**: CLI, runtime/data layer, shipped artifacts.
- **API surface & contracts**: OpenAPI / MCP tool changes.
- **Behavior changes**: What users notice after upgrading.
- **Docs site & CI / tooling**: If applicable.
- **Internal changes**: Refactors, architecture, dependency, test-only work.
- **Fixes**: Bug fixes with user/operator impact.
- **Tests and validation**: What validates confidence. (Optional: for a committed Markdown test evidence file, run `npm run test:remote:critical:report` or `npm run test:integration:report`, then copy a redacted `.vitest/reports/*.md` into `docs/releases/in_progress/vX.Y.Z/` per [`docs/testing/integration_run_reports.md`](../../../docs/testing/integration_run_reports.md).)
- **Breaking changes**: None, or list with migration notes.

**Integrated supplement (mandatory for `/release`):** The narrative is always a **single release story** across committed history and the working tree. Walk the default compare range (commits not yet on `main`, plus any user override) **and** fold **all** material uncommitted and untracked work into **the same sections above**, written **as if that work were already committed** — same grouping and reader-facing tone as shipped commits. Do not isolate dirty work in a separate appendix (for example, do not use a standalone **Uncommitted changes pending inclusion** block as the primary description). If paths cannot ship under repo security or submodule policy, state that in **Breaking changes** or a one-line **Ship constraints** item inside the same structure.

**Exact GitHub Release preview (mandatory):** After drafting the supplement, render the **exact Markdown body** that `gh release create --notes-file` will use. Preview the rendered wrap + supplement, not just the supplement summary.

- If the tag already exists, render it normally:
  ```bash
  npm run -s release-notes:render -- --tag vX.Y.Z > /tmp/gh-release-vX.Y.Z.md
  ```
- If the tag does **not** exist yet, render a **pre-tag exact preview** against the intended release ref:
  ```bash
  npm run -s release-notes:render -- --tag vX.Y.Z --head-ref <release-ref> --supplement docs/releases/in_progress/vX.Y.Z/github_release_supplement.md > /tmp/gh-release-vX.Y.Z.md
  ```
  Use `<release-ref>` as the ref that will receive the tag (for example `HEAD`, `origin/dev`, or the chosen integration branch after any confirmed pre-release commit).

**Preflight honesty:** If the tree is dirty, append a short **Execute note:** the tag matches this preview only after the described local work is committed on the branch you will release (never stage paths forbidden by security / pre-commit rules). In that case the rendered Markdown is exact for the manual body and wrap, while the commit list becomes exact only after the pending commit set exists and you re-render in Step 4.

Write for a human reader deciding whether to upgrade. Do not dump raw commit lists into the supplement. Walk the commit range and group by theme together with local changes.

**Present the rendered `/tmp/gh-release-vX.Y.Z.md` body to the user verbatim. STOP and ask:**

> "Confirm release **vX.Y.Z** with these notes? (yes / modify / cancel)"

If the working tree was dirty when drafting, state that **execute** matches the preview only after that local work is committed (excluding forbidden paths); confirm whether the user intends that full scope or needs to narrow it before Step 4.

### Step 3.5: Security review lane

Run after preview is approved by the user, before Step 4. Sources: `docs/security/threat_model.md`, `SECURITY.md`.

1. **Classify the release diff:**
   ```bash
   npm run security:classify-diff -- --base <last-tag> --head HEAD --json
   ```
   If `sensitive=false`, this lane is informational; still write the gate artifact (Step 3.5.4) so the trail is consistent.

2. **Run the static rules (G2):**
   ```bash
   npm run security:lint
   ```
   Errors are gating; warnings annotate. Resolve any `error` finding before continuing.

3. **Run the topology auth matrix (G3) and confirm the protected-routes manifest is in sync:**
   ```bash
   npm run security:manifest:check
   npm run test:security:auth-matrix
   ```
   If the manifest is out of date, run `npm run security:manifest:write` (this is allowed inside the release commit) and re-render the supplement.

4. **Generate the AI review scaffold (G4):**
   ```bash
   npm run security:ai-review -- --tag vX.Y.Z --base <last-tag> --head HEAD
   ```
   Provider defaults to `cursor`. Set `NEOTOMA_AI_REVIEW_PROVIDER=claude|gpt|none` to override; `none` keeps the review fully manual.

5. **Fill `docs/releases/in_progress/vX.Y.Z/security_review.md`:** Walk the adversarial prompt sections (alternate-path auth, proxy trust, local-dev widening, unauth public route, guest-access widening, AAuth downgrade). Record findings, suggested negative tests, residual risks, and a sign-off verdict (`yes` | `with-caveats` | `block`). `block` keeps the release on the lane.

6. **Add a `Security hardening` section to the supplement** at `docs/releases/in_progress/vX.Y.Z/github_release_supplement.md` that links the security review file and any advisory under `docs/security/advisories/` opened or referenced by this release. When `classify-diff` was sensitive this section is mandatory; when not sensitive, write `No security-sensitive surfaces touched.` so the trail is explicit.

**Hard gate before Step 4:** Do not merge, tag, push, create a GitHub Release, publish to npm, or deploy sandbox until Step 3.5 has run against the exact commit that will be released. Before advancing, explicitly verify and report:

- G1 `security:classify-diff` completed and whether `sensitive` is true or false.
- G2 `security:lint` completed with zero errors; warnings are summarized in `security_review.md`.
- G3 `security:manifest:check` and `test:security:auth-matrix` completed successfully.
- G4 `security:ai-review` created `docs/releases/in_progress/vX.Y.Z/security_review.md`, and the file is filled with findings, suggested negative tests, residual risks, and a non-placeholder sign-off verdict (`yes` or `with-caveats`; never `block`).
- The supplement has a `Security hardening` section that links the review artifact.

If any pre-release commit is added after Step 3.5 runs, rerun Step 3.5 before any merge/tag/push action. If a required branch-protection check is missing or bypassed, the local Step 3.5 evidence must already exist and be called out; never use bypass as a substitute for the lane.

Re-render the GitHub Release preview (`npm run -s release-notes:render`) so the supplement diff is reflected; STOP and re-confirm if the supplement changed materially.

### Step 3.6: Test coverage review lane

Run after Step 3.5 passes, before Step 4. Symmetric in role to the security review lane: a structured audit of whether new user-facing surfaces actually have tests that would catch the failure modes a user would hit. Sources: `docs/testing/testing_standard.md`, the supplement's "What changed for npm package users" section.

**Why this lane exists:** Tests-exist is not the same as tests-cover-the-thing-users-will-do. A surface can ship with a named test file that exercises only the happy path of an internal helper, leaving destructive operations, external-file-shape parsing, or new CLI commands effectively unverified. The v0.13.0 audit found 5 such gaps after the supplement was confirmed; this lane catches them before execute.

0. **Run `/review <last-tag>..HEAD`** before writing the coverage file. The `/review` skill (`.claude/skills/review/SKILL.md`) walks the full pre-PR checklist against the diff and emits structured findings (BLOCKING / ADVISORY / NIT) covering architecture, schema-agnostic design, determinism, immutability, auth, contract seams, and user-facing-surface coverage in a single pass. Append its verdict and blocking findings to `docs/releases/in_progress/vX.Y.Z/test_coverage_review.md` under a `## Code review` section. A `NEEDS-CHANGES` verdict from `/review` is a hard gate on Step 4 — resolve all BLOCKING findings before proceeding, even if they were introduced by commits that bypassed PR review.

1. **Walk the supplement's user-facing surfaces** (from "New CLI commands", "New CLI flags on existing commands", "Behavior changes in existing commands", "API surface & contracts"). For each, locate the test file(s) and read what they assert. Note specifically:

   **Surfaces that need a regression test before shipping:**
   - **Destructive or data-mutating operations** (encryption migrations, schema migrations, repair commands, anything that writes to the user's database or filesystem at rest). Required: a real round-trip test against a real file, not in-memory stubs. Encrypt→decrypt identity, dry-run non-mutation, idempotency on re-run, NULL preservation.
   - **External file-shape parsers** (harness transcripts, exports, third-party config files). Required: at least one fixture per supported format that exercises the *actual* parsing code path (not just `detectSource`). For SQLite-backed formats, build the SQLite file in the test and parse it.
   - **New CLI commands or flags** (`neotoma <new-command>`, new flag on existing command). Required: a test that spawns or invokes the command with the flag and asserts the user-observable effect (file written, output emitted, exit code).
   - **Discovery / detection / parser pairs** that must agree on file layout. Required: a roundtrip test that asserts paths emitted by discovery are parseable by the parser.
   - **HTTP server runtime configuration** (timeouts, headers, connection behavior) that fails silently. Required: a test that asserts the *runtime* behavior, not just the source string. For timeouts, read the response header or socket behavior.

2. **For each surface, classify the existing test coverage as one of:**
   - **Covers user-observable behavior end-to-end** → no action needed.
   - **Covers a helper function only** → flag as a gap. The helper test does not prove the command/parser/migration works for users.
   - **No test** → flag as BLOCKING.

3. **Write `docs/releases/in_progress/vX.Y.Z/test_coverage_review.md`** with one section per surface, the classification above, and either a link to the satisfying test or a description of the test that needs to be added before execute.

**Hard gate before Step 4:** Any surface classified BLOCKING must be either tested before execute or explicitly deferred to a follow-up patch release with the user's approval recorded in the review file. Trust-but-verify: read the actual test bodies; do not accept "the test file exists" as evidence of coverage.

If new commits are added to satisfy this lane, rerun Step 3.5 (Security review lane) against the final HEAD before Step 4.

### Step 3.7: Release candidate PR

Run after Step 3.6 passes. Push an RC branch and open a PR so the release can be reviewed publicly — with inline comments on the notes, CI, and a clear merge point — before anything is tagged or published.

1. **Create and push the RC branch** from the current integration branch (e.g. `dev`):
   ```bash
   git checkout -b release/vX.Y.Z
   git push origin release/vX.Y.Z
   ```

2. **Open the PR** targeting `main`, using the confirmed supplement as the PR body:
   ```bash
   gh pr create \
     --base main \
     --head release/vX.Y.Z \
     --title "Release vX.Y.Z" \
     --body "$(cat docs/releases/in_progress/vX.Y.Z/github_release_supplement.md)"
   ```
   The PR body gives reviewers the exact same narrative they will see in the GitHub Release notes.

2b. **Post `@claude review` on the release PR** immediately after opening it:
   ```bash
   gh pr comment <PR_NUMBER> --body "@claude review"
   ```
   The automated Opus review (`claude_pr_review.yml`) will run the full `/review` skill against the release diff and post findings as a `github-actions[bot]` comment. Wait for the review to complete, then check for Blocking findings:
   ```bash
   gh api repos/{owner}/{repo}/issues/<PR_NUMBER>/comments \
     --jq '[.[] | select(.user.login == "github-actions[bot]" and (.body | length > 300))] | last | .body' \
     | grep -E "Blocker|MUST|request changes|NEEDS-CHANGES" || echo "No blockers found"
   ```
   **Hard gate:** If the review verdict is `NEEDS-CHANGES` or any finding is labeled `Blocker` / `MUST`, resolve those findings before proceeding to Step 4. A review that returns only `ADVISORY` / `NIT` findings is not blocking.

3. **Surface the PR URL** to the user and **STOP**:

   > "Release candidate PR for **vX.Y.Z** is open at `<PR_URL>`. Review, comment, and approve — then reply **`execute`** (or confirm merge) to continue with tagging, npm publish, and sandbox deployment."

   Do not proceed to Step 4 until the user explicitly confirms they are ready to execute. This is the public review window.

4. **When the user confirms execute** (either by replying `execute`, confirming they merged the PR, or explicitly approving):
   - If the PR is not yet merged, merge it now:
     ```bash
     gh pr merge release/vX.Y.Z --merge --delete-branch
     ```
   - Verify the merge landed on `main` before proceeding.

**Note:** If uncommitted changes were staged in Step 4.1 and not yet committed, commit them onto `release/vX.Y.Z` before pushing the branch. The PR must reflect the exact state that will be released.

### Step 4: Execute

After the RC PR is merged and the user confirms execute, run **every** step below in order through **npm publish and sandbox deployment**. Stopping after `gh release create` or `npm publish` is a failed full `/release` unless the user confirmed a GitHub-only / no-registry / no-sandbox scope.

1. **Commit uncommitted changes** (when the preview assumed them and the user confirms execute):
   - Stage only paths that should ship; **never** stage paths forbidden by repository security / pre-commit rules (for example configured `protected_paths`, `.env*`, `data/` when disallowed).
   - Prefer explicit `git add <paths>`; avoid blind `git add -A` when forbidden or local-only paths are present.
   ```bash
   git commit -m "Pre-release: include pending changes for vX.Y.Z"
   ```
   Skip this step if the working tree was clean at confirm time. If this step creates or changes any commit included in the release, rerun Step 3.5 before continuing to version bump, merge, tag, or push.

2. **Bump version** in `package.json` (and workspaces if monorepo):
   ```bash
   npm version X.Y.Z --no-git-tag-version
   git add package.json package-lock.json
   git commit -m "Bump version to vX.Y.Z"
   ```

3. **Update `SECURITY.md` Supported Versions table** if this release introduces a new minor (e.g. `0.12.x` → `0.13.x`):
   - Add the new minor series as supported.
   - Demote the oldest supported series to the unsupported row.
   - Stage and amend into the version bump commit, or create a separate commit.

4. **Confirm main is up to date** (the RC PR merge already landed the release commits on `main`):
   ```bash
   git checkout main
   git pull origin main
   ```
   Verify `git log --oneline -5` shows the RC PR merge commit at HEAD. If the branch was merged via the PR in Step 3.7, no separate `git merge dev` is needed. If for any reason `main` does not reflect the RC commits, STOP and reconcile before tagging.

5. **Tag**:
   ```bash
   git tag -a "vX.Y.Z" -m "Release vX.Y.Z"
   ```

6. **Push**:
   ```bash
   git push origin main
   git push origin "vX.Y.Z"
   ```

7. **Write supplement file**: Save the confirmed changelog to `docs/releases/in_progress/vX.Y.Z/github_release_supplement.md`.

8. **Render release notes**:
   ```bash
   npm run -s release-notes:render -- --tag vX.Y.Z > /tmp/gh-release-vX.Y.Z.md
   ```
   If the last npm publish does not match the previous git tag, use `--compare-base <last_published_tag>`. This must reproduce the same body style shown in Step 3, now with the final tag/commit set.

9. **Create or update GitHub Release draft**:
   ```bash
   if gh release view "vX.Y.Z" --json isDraft --jq '.isDraft' 2>/dev/null | grep -q true; then
     gh release edit "vX.Y.Z" --title "vX.Y.Z" --notes-file /tmp/gh-release-vX.Y.Z.md
   else
     gh release create "vX.Y.Z" --title "vX.Y.Z" --notes-file /tmp/gh-release-vX.Y.Z.md --draft
   fi
   ```
   If a draft already exists it is updated in place; otherwise a new draft is created. In either case the release remains invisible to users and does not trigger the "latest release" pointer until published in step 11b. If `gh release view` returns a release that is **not** a draft, **STOP** — do not overwrite a published release without explicit user approval.

10. **Publish to npm (mandatory for a full release)**:
   From the directory that owns the published `package.json` (repo or workspace root per your monorepo layout):

   - **Registry auth:** If `npm publish` fails for auth or the session is stale, run `npm login` in an interactive terminal when needed.
   - **Web login URL (agent-assisted):** When `npm login` prints `Login at: https://www.npmjs.com/login?...`, an agent with shell access may parse that URL from the CLI or terminal transcript and run `open '<url>'` on macOS or `xdg-open '<url>'` on Linux so the default browser loads the same page pressing Enter would open. **Only** use URLs that clearly come from official `npm` output for `registry.npmjs.org` / `npmjs.com`; prefer explicit user confirmation before opening browser or running `open`/`xdg-open`.

   **npm web-login checkpoint (mandatory — do not skip):** Browser sign-in does **not** prove the same shell that will run `npm publish` has a valid token. After any web-login assist **or** when the user says they finished signing in:

   1. **Immediately** run `npm whoami` in the **same** environment you use for `npm publish` (same repo root, same `HOME` / `~/.npmrc`).
   2. **If `npm whoami` succeeds:** State clearly that the session is authenticated, then run `npm publish` (and `npm publish --otp=<code>` when 2FA applies). Do not advance to sandbox until publish and registry verification succeed.
   3. **If `npm whoami` still fails (`E401` / unauthorized) or `npm login` exited before completing (for example npm printed `Exit handler never called`):** You **must** end the user-visible turn with an explicit handoff that includes all of the following — do not assume the user knows the next step:
      - Explain that the browser login authorized the **browser**, not necessarily the **agent shell** (or that the CLI session aborted before writing a token).
      - Give **copy-paste** commands for the operator to finish auth where `npm publish` will run (their own Terminal with the repo as cwd, or fixing `~/.npmrc` / `NPM_TOKEN` for CI-style shells).
      - Ask them to reply **`ready`** (or confirm they ran `npm publish` locally and the registry shows `X.Y.Z`) so the next turn **retries `npm whoami` then `npm publish` immediately** without waiting for another vague ping.
   4. **If the user message is only “I signed in” / “done” in the browser:** Treat that as a signal to run the checkpoint (step 1), not as permission to end the release thread without step 2 or step 3 text above.

   ```bash
   npm publish
   ```
   Do not treat the release as finished until this succeeds (capture or report the registry URL / version). **Skip only** if the user explicitly confirmed a scope that excludes npm (for example tag-only or internal).

   After `npm publish` returns, confirm the registry actually reflects the new version before moving on:
   ```bash
   npm view neotoma version
   ```
   The output must equal `X.Y.Z`. If it still reports the previous version, the registry has not propagated yet — wait 30s and retry rather than advancing.

11. **Deploy sandbox.neotoma.io (mandatory for a full release)**:
    Deploy the Fly app from the final release commit, stamping the real commit
    SHA so the deployed build is verifiable (otherwise the root JSON `git_sha`
    falls back to the opaque Fly machine-version ULID):
    ```bash
    flyctl deploy -c fly.sandbox.toml --remote-only \
      --build-arg NEOTOMA_GIT_SHA="$(git rev-parse HEAD)"
    ```
    Then verify the live sandbox before advancing — confirm both the version
    **and** that `git_sha` matches the released commit (not a 26-char ULID):
    ```bash
    curl -fsS -H "Accept: application/json" https://sandbox.neotoma.io/ | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); const sha="'"$(git rev-parse HEAD)"'"; if (j.version !== "X.Y.Z" || j.mode !== "sandbox" || j.git_sha !== sha) { console.error(j); process.exit(1); } console.log(j.version, j.git_sha); })'
    curl -fsSI https://sandbox.neotoma.io/health | grep -i '^x-neotoma-sandbox: 1'
    ```
    Do not treat the release as complete until the root JSON reports `version: X.Y.Z`, `mode: sandbox`, a `git_sha` equal to the released commit, and `/health` returns `X-Neotoma-Sandbox: 1`. If sandbox deployment fails after npm publish, report the partial-release state and keep working the sandbox failure unless the user explicitly pauses.

11b. **Publish the GitHub Release draft** (after sandbox verified):
    ```bash
    gh release edit "vX.Y.Z" --draft=false
    ```
    This makes the release public and sets it as the latest release. Only run after sandbox verification passes.

12. **Merge main back to dev** (keep branches in sync):
    ```bash
    git checkout dev
    git merge main
    git push origin dev
    ```

### Step 5: Post-Release

1. **Run the deployed protected-route probes (G5):**
   ```bash
   NEOTOMA_PROBE_HOSTS="https://sandbox.neotoma.io
   https://neotoma.markmhendrickson.com" \
     bash scripts/security/deployed_probes.sh --tag vX.Y.Z
   ```
   The probe writes `docs/releases/in_progress/vX.Y.Z/post_deploy_security_probes.md` and exits non-zero on any unexpected status. A failure here BLOCKS release completion: open an advisory under `docs/security/advisories/`, hotfix the regression, and re-run before declaring done.

2. **Publish any draft security advisories linked from this release (mandatory when `Security hardening` section is non-trivial):**

   After the tag is live and before declaring the release complete, check and publish every advisory referenced in the supplement's `Security hardening` section. The local doc status field is **not** authoritative — always check the live GHSA state via the API.

   a. **Scan the supplement for advisory links:**
      ```bash
      grep -oE 'docs/security/advisories/[^ )]+\.md' docs/releases/in_progress/vX.Y.Z/github_release_supplement.md
      ```

   b. **For each linked advisory file, extract the GHSA ID:**
      ```bash
      grep -i 'ghsa\|github.com/.*security/advisories' docs/security/advisories/<slug>.md | head -5
      ```

   c. **Check the live GHSA state via GitHub API** (do not rely on the local doc `status` field):
      ```bash
      gh api repos/markmhendrickson/neotoma/security-advisories \
        --jq '.[] | select(.ghsa_id == "<GHSA-ID>") | {ghsa_id, state, published_at, vulnerabilities}'
      ```
      If `state` is anything other than `published`, publish it now.

   d. **Before publishing, ensure `patched_versions` is set** for the fix version:
      ```bash
      gh api repos/markmhendrickson/neotoma/security-advisories/<GHSA-ID> \
        --method PATCH \
        --input - <<'EOF'
      {
        "vulnerabilities": [
          {
            "package": { "ecosystem": "npm", "name": "neotoma" },
            "vulnerable_version_range": ">=X.Y.0, <X.Y.Z",
            "patched_versions": "X.Y.Z"
          }
        ]
      }
      EOF
      ```

   e. **Publish the GHSA:**
      ```bash
      gh api repos/markmhendrickson/neotoma/security-advisories/<GHSA-ID> \
        --method PATCH \
        --input - <<'EOF'
      {"state": "published"}
      EOF
      ```

   f. **Verify the GHSA is public:**
      ```bash
      gh api repos/markmhendrickson/neotoma/security-advisories/<GHSA-ID> \
        --jq '{ghsa_id, state, published_at}'
      ```
      `state` must be `published` and `published_at` must be non-null. If the publish step fails (auth, scope), STOP and surface the exact error — do not declare the release complete with a draft GHSA.

   **Why this step is here and not in Step 3.5:** The GHSA should only go public after the fix is actually tagged and shipped. Publishing before the tag leaks attack vector details before users can protect themselves. The advisory doc is written during Step 3.5; the GHSA is published here.

   **Do not rely on the local advisory doc `status` field.** A doc marked `disclosed` locally may still have a draft GHSA. Always verify via the API (step c above).

   **Skip this step** only when the supplement's `Security hardening` section reads `No security-sensitive surfaces touched.`

3. **Verify GitHub Actions workflows triggered by the release push:**

   The `git push origin main` and `git push origin vX.Y.Z` in Step 4.5 trigger CI and deployment workflows. All must succeed before declaring the release complete.

   a. **Wait for runs to start** (allow ~30s after push, then poll):
      ```bash
      gh run list --branch main --limit 10 --json databaseId,name,status,conclusion,headSha,createdAt
      ```

   b. **Watch each in-progress run** (repeat for each relevant run ID):
      ```bash
      gh run watch <run-id>
      ```
      Or wait for completion in batch (exit 1 on any failure):
      ```bash
      gh run list --branch main --limit 10 --json databaseId,status,conclusion,name \
        | node -e "
          const runs = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
          const relevant = runs.filter(r => ['CI test lanes','Deploy site (GitHub Pages)','Sandbox weekly reset'].includes(r.name) || r.status !== 'completed');
          const failed = runs.filter(r => r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'skipped');
          if (failed.length) { console.error('FAILED:', failed.map(r=>r.name)); process.exit(1); }
          console.log('All relevant runs passed or in-progress.');
        "
      ```

   c. **Workflows to verify:**
      - `CI test lanes` — all four jobs (`baseline`, `frontend`, `site_export`, `security_gates`) must pass
      - `Deploy site (GitHub Pages)` — triggered by push to `main`; must reach `success`
      - Any tag-triggered workflows (inspect `gh run list --ref vX.Y.Z`)

   d. **If any workflow fails:**
      - Inspect with `gh run view <run-id> --log-failed`
      - Fix the root cause (typically a commit in the release range introduced the failure)
      - If the fix requires a new commit, create a patch release (`vX.Y.Z+1`) using this same workflow — do not force-push the tag
      - Re-run this step after the patch push until all checks pass

   e. **Record the outcome** in the release summary (step 4 of this section).

4. **Close resolved GitHub issues:**
   - Fetch the release URL created in Step 4.8:
     ```bash
     RELEASE_URL=$(gh release view vX.Y.Z --json url --jq .url)
     ```
   - List open issues and cross-reference against the commits in this release:
     ```bash
     gh issue list --state open --json number,title,body,labels
     git log <last-tag>..vX.Y.Z --oneline
     ```
   - For each issue that is resolved by a commit in the release range (via `Fixes #N`, `Closes #N`, `Resolves #N` in commit messages or PR descriptions) **or** whose described behavior is demonstrably fixed:
     ```bash
     gh issue close <number> --comment "Resolved in [vX.Y.Z]($RELEASE_URL)."
     ```
   - If there are open issues that are partially addressed but not fully resolved, add a comment noting what was fixed and what remains:
     ```bash
     gh issue comment <number> --body "Partially addressed in [vX.Y.Z]($RELEASE_URL): <what changed>. Remaining: <what's still open>."
     ```
   - Report which issues were closed and which were commented on.
5. Move supplement: `mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z` (if directory was created); the security review and probe report move with it.
6. Report summary: version, GitHub Release URL, npm package URL (must reflect a successful **`npm publish`** when the release included npm), sandbox URL/version verification, the probe report verdict (passes / failures), advisories published (GHSA IDs and public URLs), issues closed, and CI workflow outcomes (all-pass / any-failure with run IDs).

## Submodule Mode

If the user says `/release foundation` (or another submodule name):

1. `cd <submodule>` and run the same workflow scoped to that submodule.
2. After tagging and pushing inside the submodule, return to the main repo.
3. Do NOT proceed with main repository release.

## Constraints

- Always run preflight before version bumps or note drafting.
- Always preview the full changelog and get explicit user confirmation before executing.
- Always show the rendered GitHub Release Markdown body during preview, not just a prose summary of the supplement.
- Always describe uncommitted changes concretely — never use a generic placeholder.
- Do not ship a GitHub Release body that is only an auto-generated commit list.
- Do not merge or tag without user approval of the preview.
- For a standard `/release`, always open a release candidate PR (`release/vX.Y.Z` → `main`) in Step 3.7 after all review lanes pass, and do not proceed to Step 4 until the user confirms execute (or confirms the PR is merged).
- For a standard `/release`, always create the GitHub Release as a **draft** (`--draft`) in Step 4.9 and publish it (`gh release edit --draft=false`) only after sandbox verification passes in Step 4.11b.
- For a standard `/release`, **always** run **`npm publish`** after `gh release create --draft` unless the user explicitly confirmed GitHub-only / no registry.
- For a standard `/release`, **always** deploy `sandbox.neotoma.io` with `flyctl deploy -c fly.sandbox.toml --remote-only` and verify the live sandbox version unless the user explicitly confirmed no sandbox.
- For a standard `/release`, **always** run Step 3.5 (Security review lane) before Step 4 and Step 5 (Deployed probes) before declaring complete; the supplement MUST contain a `Security hardening` section linking `docs/releases/in_progress/<TAG>/security_review.md` (and `post_deploy_security_probes.md` after Step 5).
- For a standard `/release`, **always** run Step 5.2 (Advisory publication) when the supplement's `Security hardening` section references any advisory file. Draft GHSAs MUST be published after the tag is live and before declaring the release complete. Never publish a GHSA before the fix tag exists.
- For a standard `/release`, **always** verify that all GitHub Actions workflows triggered by the release push (`CI test lanes`, `Deploy site (GitHub Pages)`, and any tag-triggered workflows) reach `success` before declaring complete. A CI failure after push is a partial release — fix and re-verify.
- If `docs/developer/github_release_process.md` exists, follow its template and render pipeline.

## Agent Instructions

### Load Order

1. This skill
2. `docs/developer/github_release_process.md` (template layout, render commands)
3. `docs/developer/github_release_supplement.example.md` (section pattern)

### Forbidden Patterns

- Skipping the preview step
- Showing only a release summary when the final GitHub Release body can be rendered
- Tagging or pushing without user confirmation
- Omitting material working-tree changes from the integrated preview (they must appear in-section, not dropped)
- Treating confirmed uncommitted changes as shipped without committing them first
- Using only `git log --oneline` as the GitHub Release body
- Skipping the RC PR step (Step 3.7) and proceeding directly to merge/tag/push after review lanes pass
- Proceeding to Step 4 execute without the user explicitly confirming after the RC PR is open
- Creating the GitHub Release without `--draft` when no draft exists yet (must be a draft until sandbox is verified)
- Calling `gh release create` when a draft already exists for the tag (must use `gh release edit` to update it)
- Silently overwriting a published (non-draft) GitHub Release — always stop and ask the user first
- Publishing the GitHub Release draft (`gh release edit --draft=false`) before sandbox verification passes
- Ending execute after the GitHub Release without **`npm publish`** when the user confirmed a normal (npm-included) release
- Ending execute after **`npm publish`** without deploying and verifying `sandbox.neotoma.io` when the user confirmed a normal sandbox-included release
- Ending the execute turn right after npm web-login / “I signed in” **without** running the **npm web-login checkpoint** (`npm whoami` → publish or explicit `ready` handoff with copy-paste commands)
- Skipping Step 3.5 (Security review lane) before Step 4 when `npm run security:classify-diff` reports the release diff as sensitive, or omitting the supplement's `Security hardening` section
- Declaring a release complete without running Step 5 deployed probes (`bash scripts/security/deployed_probes.sh --tag vX.Y.Z`) and recording the report under `docs/releases/in_progress/vX.Y.Z/post_deploy_security_probes.md`
- Declaring a release complete without verifying all release-triggered GitHub Actions workflows (`CI test lanes`, `Deploy site`, tag-triggered workflows) reached `success` via `gh run list` / `gh run watch`
- Declaring a release complete when the supplement's `Security hardening` section references an advisory that is still in draft/private state — run Step 5.2 and confirm GHSA state is `published` first
- Publishing a GHSA (Step 5.2) before the fix tag is pushed and live on `main` — GHSA publication must come after `git push origin vX.Y.Z` in Step 4.6
