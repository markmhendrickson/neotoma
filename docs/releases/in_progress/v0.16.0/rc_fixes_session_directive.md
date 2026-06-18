# v0.16 RC fixes — new session agent directive

Handoff from the PR salvage + RC build session (2026-06-15). Use this as the operating brief for a **smoke-test → discover fixes → implement** Cursor session. **No fix list is prepared in advance** — the user will present issues during the session after testing the RC together.

## Mission

1. **Smoke-test** the v0.16 RC Inspector at `http://localhost:9180/` (user drives; agent assists).
2. **Capture** issues the user finds — reproduce, triage, and agree scope before coding.
3. **Fix** confirmed issues on `main` via focused PRs.

Do **not** expand scope into rename trains, salvage branches, or unrelated release work. Do **not** assume a fix list exists at session start.

## Session flow (expected)

| Phase | Who | Agent behavior |
|-------|-----|----------------|
| 1. Setup | Agent | Create worktree from `origin/main`; confirm RC is reachable |
| 2. Smoke test | **User** | User tests RC in browser; reports what’s broken or off |
| 3. Triage | Both | Agent reproduces each report; confirms bug vs expectation vs env |
| 4. Fix | Agent | Implement minimal fixes per issue cluster; PR to `main` |
| 5. Verify | User | Re-test on RC after merge + inspector rebuild |

**Important:** Wait for the user to present findings. Do not invent fixes or start coding until issues are reported and reproduced.

## Current state (as of 2026-06-15)

| Surface | Path / URL | Commit / version | Notes |
|--------|------------|------------------|-------|
| `origin/main` | `github.com/markmhendrickson/neotoma` | `03a155642` | All UI salvage merged |
| Live RC checkout | `~/neotoma-rc-src` (symlink `~/neotoma-active`) | `03a155642` on `main` | Autodeploy-managed; local `package.json` RC bump (`0.16.0-rc.1`) |
| RC server | `http://localhost:9180/` | `0.16.0-rc.1` | Tunnel: `https://neotoma.markmhendrickson.com/` |
| Inspector bundle on RC | `~/neotoma-rc-src/dist/inspector/` | Rebuilt 2026-06-15 | Entry: `assets/index-DvJb2Wsu.js` |

### UI already on `main` (verify, do not re-salvage)

- Inspector skinning — `NEOTOMA_INSPECTOR_SKIN` (#1585)
- Pinned dashboard panel on home (#1656)
- Sidebar pin cap (#1630)
- Sidebar build version + duplicate badge (#1660)

### Out of scope for this fixes session

- **Rename train** (`inspector/` → `app/`, etc.) — deferred; draft plan exists post-v0.16
- **PR #948** (`feat/inspector-bundled-mount-cursor-handoff`) — separate backend/mount decision; only touch if user explicitly asks
- **PR #1662** (`fix/rc-autodeploy-rebuild-inspector`) — RC deploy plumbing; handled in prior session, not mixed into UI fix branches

## Workspace setup (do this first)

```bash
cd /Users/markmhendrickson/repos/neotoma
git fetch origin

# One worktree per fix cluster; rename branch when the area is known
git worktree add ../neotoma-worktrees/v016-fixes -b fix/v0.16-rc origin/main
```

Open **`/Users/markmhendrickson/repos/neotoma-worktrees/v016-fixes`** in Cursor.

Branch naming examples once you know the area:

- `fix/v0.16-rc-sidebar`
- `fix/v0.16-rc-entities`
- `fix/v0.16-rc-home-pinned-panel`

### Do not use as dev workspace

- `~/neotoma-rc-src` — autodeploy target; RC version bump lives here uncommitted
- `fix/rc-autodeploy-rebuild-inspector` — separate PR #1662 work
- Stale inspector-upstream branches — separate repo layout; features already ported to monorepo `inspector/`

## Test protocol

### Phase 1 — Discovery (user-led)

User tests the RC and presents issues in chat (screenshots, routes, steps, expected vs actual). Agent:

- Confirms RC health (`curl -s http://localhost:9180/health`)
- Reproduces each reported issue when possible
- Records findings (Neotoma tasks/notes optional) before any code changes
- Uses the smoke-test checklist below as a **guide**, not a pre-filled bug list

### Phase 2 — Fix (after user reports issues)

1. **Reproduce on RC** — `http://localhost:9180/` (send `Accept: text/html` for the SPA; root without that header returns JSON server-info).
2. **Implement fix** in the worktree under `inspector/` (or `src/` if server-side).
3. **Local verify** (optional): `npm run build:inspector:prod-target` in the worktree.
4. **PR → merge to `main`**.
5. **Refresh RC after merge:**
   - Autodeploy pulls `main` within ~2 minutes (`com.neotoma.rc-autodeploy` launchd).
   - Until PR #1662 merges, **manually rebuild** inspector on RC:
     ```bash
     cd ~/neotoma-rc-src && npm run build:inspector:prod-target
     ```
   - No server restart required for static `dist/inspector` changes.

## Smoke-test checklist (guide — fill in during session)

Use while testing; mark pass/fail and note issues in chat as you find them:

- [ ] Root Inspector loads (`Accept: text/html` on `/`)
- [ ] Sidebar shows build version (from `/server-info` or sidebar footer)
- [ ] Duplicate badge on entities list (with entity-type filter active)
- [ ] Pinned dashboard panel on home
- [ ] Skinning via `NEOTOMA_INSPECTOR_SKIN` (if configured on RC)
- [ ] Sidebar pin cap (max 8 + “Show all”)
- [ ] No 404s on `/assets/*` chunks
- [ ] Key routes: `/entities`, `/home`, `/settings`, `/design`

**Issues found (user fills in during session):**

```
(none yet — user will report after testing)
```

## Fix workflow rules

- **Minimal diffs** — one logical fix per PR when possible.
- **Branch from `origin/main`** — not from RC checkout or autodeploy branch.
- **No commits in `neotoma-rc-src`** — RC is consume-only for testing.
- **Pre-check duplicates** — search `main` / open PRs before re-implementing salvaged UI.
- **Tests** — run targeted inspector lint/build; full `npm test` only if server paths touched.

## RC / autodeploy architecture (for debugging)

- **`com.neotoma.rc-autodeploy`** — polls `origin/main` every 120s into `~/neotoma-rc-src`; runs `scripts/redeploy_rc_from_main.sh`.
- **`com.neotoma.prod-server`** — serves API + static `dist/inspector` on port **9180** via `dev:server` (not live Vite watch).
- **Known gap (PR #1662):** autodeploy historically ran only `build:server`; inspector rebuild was manual. After #1662 merges, autodeploy also runs `build:inspector:prod-target`.

## Suggested session opener (paste into new chat)

```text
v0.16 RC smoke test + fixes session.

Read docs/releases/in_progress/v0.16.0/rc_fixes_session_directive.md.

I do not have a fix list yet — I will test the RC and report issues in this chat.
RC: http://localhost:9180/ (main @ 03a155642, 0.16.0-rc.1).

Please:
1. Set up worktree from origin/main (branch fix/v0.16-rc until we know the area).
2. Confirm RC is healthy.
3. Wait for me to present smoke-test findings before coding.
4. After I report issues: reproduce, triage, then fix via PR to main.
5. Rebuild inspector in neotoma-rc-src after merge until PR #1662 merges.
```

## Related Neotoma context

- Conversation: PR salvage onto main + v0.16.0 release
- Notes: UI salvage status, RC build refresh, branch re-audit (no missing UI)
- Open: manual smoke test task; PR #948 decision; merge PR #1662 for autodeploy inspector rebuild

## Prior session branches (reference only)

| Branch | Purpose | Action |
|--------|---------|--------|
| `fix/rc-autodeploy-rebuild-inspector` | PR #1662 — inspector rebuild in autodeploy | Merge when ready; keep separate from UI fixes |
| Salvage branches | UI already on `main` | Pruned; tips archived under `refs/archive/salvage-prune-20260615/` |
