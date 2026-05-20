# Neotoma security advisories

This directory is the in-repo index of security advisories that affect a published Neotoma version. Each advisory is a dated Markdown file (`YYYY-MM-DD-<slug>.md`) so the chronological ordering matches the disclosure timeline.

This index is the canonical cross-link target for:

- `SECURITY.md` (top-level disclosure flow)
- `docs/developer/github_release_process.md` § Security hardening section
- The `Security hardening` section of every release supplement under `docs/releases/in_progress/<TAG>/`
- `docs/security/threat_model.md` § Index of evidence
- The advisory bullets in `docs/releases/in_progress/<TAG>/security_review.md`

## Contents

| Date | Title | GHSA | CVE | Affected | Fixed in | Gate that catches the regression class |
|------|-------|------|-----|----------|----------|----------------------------------------|
| 2026-05-11 | [Inspector / API auth bypass behind a reverse proxy](2026-05-11-inspector-auth-bypass.md) | [GHSA-5cvp-p7p4-mcx9](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-5cvp-p7p4-mcx9) | _requested_ | `>= 0.4.0, < 0.11.1` | `0.11.1` | G2 (`loopback-trust-in-production`, `forwarded-for-trust`), G3 topology auth matrix, G5 deployed probes |

Add new rows above the existing entry (most-recent first). Keep the GHSA / CVE columns linked when assigned; use `_requested_` while a CVE is still pending.

## File template

Use the layout below for new advisories so downstream automation (the supplement linker, `security_review.md` scaffolds, and the weekly probe report) can parse them.

```markdown
# <Title> (vX.Y.Z fix)

- **Date disclosed:** YYYY-MM-DD
- **GHSA:** [GHSA-XXXX-XXXX-XXXX](https://github.com/...)
- **CVE:** CVE-YYYY-NNNNN (or `_requested_`)
- **Severity:** <CVSS / GHSA severity, plain English summary>
- **Affected:** `>= a.b.c, < x.y.z`
- **Fixed in:** `x.y.z`
- **Reporter:** <name or "internal review">
- **CWEs:** <CWE-NNN, CWE-NNN>

## Summary
## Impact
## Reproduction (sanitized)
## Root cause
## Fix
## Operator action
## Detection
## Gates that catch this regression class going forward
## Timeline
```

The seed entry `2026-05-11-inspector-auth-bypass.md` is a worked example.

## Filing flow (recap)

1. Reporter emails / files via the GitHub Security tab (`SECURITY.md` references the URL).
2. Maintainer drafts a private GHSA, requests a CVE, and lands the fix on a `hotfix/` branch.
3. After the patch ships, mirror the GHSA into a dated file in this directory using the template above.
4. Add a row at the top of the table.
5. Link the file from the release supplement's `Security hardening` section and from `docs/security/threat_model.md` if the channel is novel.

## Related

- `SECURITY.md` — disclosure flow + supported versions
- `docs/security/threat_model.md` — channels the gates cover
- `.cursor/skills/release/SKILL.md` § Step 3.5 — Track 1 security gates (pre-release review lane)
