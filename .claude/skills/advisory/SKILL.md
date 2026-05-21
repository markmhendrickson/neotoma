---
name: advisory
description: File, maintain, and close security advisories. Keeps docs/security/advisories/, docs/security/practices.md, and GitHub Security Advisories (GHSA) in sync. Two modes — new (file advisory) and close (mark fixed).
triggers:
  - /advisory
  - file advisory
  - create advisory
  - close advisory
  - mark advisory fixed
---

# Advisory

Use this skill to manage the full security advisory lifecycle. It enforces atomicity — advisory files, the README index, practices.md, GitHub issues, and the GHSA are updated together so nothing drifts.

Two modes:

- **`/advisory new`** — File a new advisory for a discovered vulnerability
- **`/advisory close <slug> <version>`** — Mark an existing open advisory fixed in a release

---

## When to Use

- A vulnerability has been identified and needs a disclosure record
- A fix has shipped for an open advisory and the record needs to be closed out
- `practices.md` is out of date with the current advisory set

Invoke with `/advisory new` or `/advisory close <slug> <version>`.

---

## Constraints (apply throughout)

- **MUST NOT** include attack vector specifics, exploit steps, or payload details in any repo markdown file (`docs/security/advisories/`, `practices.md`, GitHub issues). Those belong in the GHSA, which is private until coordinated disclosure.
- Sanitized content describes: what category of bug, what prerequisites, what data is accessible, what the severity is, and what the fix entails — without explaining *how* to perform the access.
- **MUST** commit advisory files, README update, and practices.md update atomically in a single commit.
- **MUST** use `SKIP_TESTS=1` on commit if pre-existing test failures on the branch would block the hook.

---

## Mode: `/advisory new`

### Step 1: Gather inputs

Collect the following before writing anything:

| Field | Notes |
|-------|-------|
| Slug | `<YYYY-MM-DD>-<short-kebab-description>` — date is discovery date |
| CVE class | Category of vulnerability (e.g., tenant isolation bypass, auth middleware gap) |
| Affected version(s) | Which released tag(s) contain the bug |
| Prerequisites | What the attacker needs — be specific but sanitized |
| Impact | What data/functionality is exposed — no exploit steps |
| Severity | Low / Medium / High with reasoning |
| Remediation approach | What the fix entails — high level |
| Tracking issues | GitHub issue numbers for fix and gate gaps (create if they don't exist) |
| Gate gap | Which security gate(s) failed to catch this and why |

If any field is unclear, ask before proceeding.

### Step 2: Draft the advisory file

Create `docs/security/advisories/<slug>.md` using this structure:

```markdown
# Advisory: <Title>

**Advisory ID:** <slug>
**Date:** <YYYY-MM-DD>
**Severity:** <Low|Medium|High> (<brief rationale>)
**Status:** <Fixed in vX.Y.Z | Open — fix tracked in #N, #M>

---

## CVE Class

<One paragraph: vulnerability category, what makes it exploitable, regression class if known.>

---

## Affected Versions

- vX.Y.Z

<Fixed in / Not yet fixed.>

---

## Prerequisites

<Numbered list of what an attacker needs. Sanitized — no exploit steps.>

---

## Impact

<What data or functionality is exposed. Sanitized — no exploit steps.>

---

## Severity

**<Low|Medium|High>** <reasoning paragraph>

<Escalation condition if applicable.>

---

## Remediation

<Fix approach. Reference tracking issues. No exploit details.>

---

## Disclosure Timeline

| Date | Event |
|------|-------|
| <date> | Vulnerability identified |
| <date> | Advisory filed |
| TBD | Fix released |

---

## Tracking Issues

- **#N** — <description>

---

## Gate Gap

<Which gate(s) did not catch this. Why. What the extension entails. Reference tracking issue for gate fix.>
```

### Step 3: Update the advisories README index

Add a row to the index table in `docs/security/advisories/README.md`:

```markdown
| [<slug>](./<slug>.md) | <Short title> | vX.Y.Z | <Severity> (<rationale>) | <Open — fix tracked in #N | Fixed in vX.Y.Z> |
```

### Step 4: Update practices.md

Open `docs/security/practices.md` and make the following updates:

1. **For each gate the advisory reveals a gap in:** add a row to that gate's "Known gaps" section describing the gap and referencing the advisory slug.

2. **For each gate extension the advisory motivates:** add a row to that gate's "History" table with the date, change description, and advisory slug.

3. **In the "Advisory → hardening linkage" section:** add a bullet for the new advisory linking it to the specific gate work it motivated (or a waiver if no gate change is needed).

4. **If the advisory introduces an escalation condition** (e.g., single-tenant assumption): update the "Cross-cutting practices" section to document it.

The practices.md update must reflect the *current* state — pending gate work is noted as "Pending, tracked in #N", not omitted.

### Step 5: File sanitized GitHub issues

For each required fix and gate gap that doesn't already have a tracking issue:

```bash
gh issue create \
  --title "<sanitized title>" \
  --body "<sanitized description — no attack vector details>" \
  --label "security"
```

Issues describe *what* to fix (add per-user scoping, extend gate coverage) without explaining *how the vulnerability works*.

### Step 6: Commit atomically

Stage all changed files and commit:

```bash
git add docs/security/advisories/<slug>.md \
        docs/security/advisories/README.md \
        docs/security/practices.md

SKIP_TESTS=1 git commit -m "docs(security): file advisory <slug>

<one-line summary of what the vulnerability is>

Advisory covers: <CVE class>. Affected: <version>. Severity: <level>.
Fix tracked in #N. Gate gap tracked in #M.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Step 7: Open a GitHub Security Advisory (GHSA)

This is where full technical details can go — the GHSA is private until coordinated disclosure.

```bash
gh api repos/{owner}/{repo}/security-advisories --method POST \
  --field summary="<title>" \
  --field description="<full technical description including prerequisites and exploit details>" \
  --field severity="<low|medium|high|critical>" \
  --field vulnerabilities='[{"package":{"ecosystem":"npm","name":"neotoma"},"vulnerable_version_range":"= X.Y.Z"}]'
```

If the API call fails due to token scope, instruct the user to open manually at:
`https://github.com/<owner>/<repo>/security/advisories/new`

and provide the full content to paste.

Record the GHSA URL in the advisory file's Disclosure Timeline once it's created.

### Step 8: Push and open a PR

```bash
git push origin <branch>
gh pr create \
  --title "docs(security): file advisory <slug>" \
  --base dev \
  --body "..."
```

The PR description must not expose attack vector details either — treat it as public.

---

## Mode: `/advisory close <slug> <version>`

Use when a fix has shipped in a release and the advisory record needs to be closed.

### Step 1: Verify the fix is released

```bash
gh release view <version>
```

Confirm the release tag exists and the fix commits are included.

### Step 2: Update the advisory file

In `docs/security/advisories/<slug>.md`:

- Change `**Status:** Open — fix tracked in #N` to `**Status:** Fixed in <version>`
- Fill in the Remediation section with what was actually done (commits, approach)
- Add the fix release date to the Disclosure Timeline table

### Step 3: Update the README index

Change the Status cell for the advisory row from `Open — fix tracked in #N` to `Fixed in <version>`.

### Step 4: Update practices.md

For each gate extension that was implemented as part of the fix:

1. Move pending items from "Known gaps" to the "History" table with the date they landed
2. Update the "Advisory → hardening linkage" bullet to show the gate work as completed

### Step 5: Close tracking issues

```bash
gh issue close <fix-issue-number> --reason completed
gh issue close <gate-gap-issue-number> --reason completed
```

Add a closure comment on each:

```bash
gh issue comment <number> --body "Fixed in <version>. Advisory: docs/security/advisories/<slug>.md"
```

### Step 6: Update the GHSA

If the GHSA is open, update it to reflect the fix and set it to published if disclosure is appropriate:

```bash
gh api repos/{owner}/{repo}/security-advisories/<ghsa-id> --method PATCH \
  --field state="published"
```

### Step 7: Commit and push

```bash
git add docs/security/advisories/<slug>.md \
        docs/security/advisories/README.md \
        docs/security/practices.md

SKIP_TESTS=1 git commit -m "docs(security): close advisory <slug> — fixed in <version>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push origin <branch>
gh pr create --title "docs(security): close advisory <slug>" --base dev
```

---

## File and gate reference

| File | Purpose | Updated by this skill |
|------|---------|----------------------|
| `docs/security/advisories/README.md` | Index of all advisories | Every invocation |
| `docs/security/advisories/<slug>.md` | Per-vulnerability record | `new` and `close` |
| `docs/security/practices.md` | Living gate posture and hardening history | Every invocation |
| `scripts/security/protected_routes_manifest.json` | Route auth manifest | Only if fix touches manifest |
| `tests/security/auth_topology_matrix.test.ts` | Auth-topology test | Only if gate gap fix lands |

---

## Checklist before committing

- [ ] Advisory file has no attack vector details (prerequisites and impact are sanitized)
- [ ] README index row added/updated
- [ ] practices.md updated: gate gaps noted, history rows added, hardening linkage bullet present
- [ ] GitHub issues filed for fix and gate gap (if not pre-existing)
- [ ] All three docs staged in the same commit
- [ ] GHSA opened or queued for manual creation
- [ ] PR description is sanitized (public-safe)
