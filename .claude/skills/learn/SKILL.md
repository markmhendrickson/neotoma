---
name: learn
description: Learn
---

<!-- Source: .cursor/skills/learn/SKILL.md -->


# Learn

Turn a behavior miss raised in chat into a permanent process improvement.

Use this skill when the user points out an omission, asks why something was not done, or requests stronger automatic behavior.

## Goals

1. Fix the immediate omission in the current turn.
2. Prevent recurrence by updating the smallest durable artifact (rule, skill, or workflow doc).
3. Apply the new guidance immediately in the same conversation.

## Workflow

1. Capture the miss
   - Record expected behavior, actual behavior, and impact.
   - Identify whether this is a one-off mistake or a recurring workflow gap.
   - **Neotoma:** `/learn` runs in normal chat — the full MCP turn lifecycle (bounded retrieval → user-phase store → edits/tools → reply → closing store) applies even when the fix is a one-line doc or rule tweak; "short pass" is never a waiver (see `docs/developer/mcp/instructions.md` [TURN LIFECYCLE]).

2. Choose the smallest durable artifact
   - Rule: global repeated behavior.
   - Skill: multi-step workflow behavior.
   - Workflow doc/checklist: release/process quality gates.
   - Hook/tooling: enforcement that should run automatically.

3. Implement focused guidance
   - Add explicit trigger language (when behavior must run).
   - Add explicit ordering (what must happen first/next).
   - Add forbidden patterns for the observed failure mode.
   - Keep changes minimal and reusable; avoid broad rewrites.

4. Validate and apply now
   - Re-run the scenario that failed (or nearest equivalent).
   - Perform the newly-required behavior in this chat before concluding.

5. Report outcome
   - What changed.
   - Why this artifact was chosen.
   - What behavior is now enforced.

## GitHub Release Pattern

When the miss is release-quality related (for example "release notes missed npm-impacting runtime changes"), do all of the following:

1. Inspect commit range for the release tag (for example `vX.Y.(Z-1)..vX.Y.Z`).
2. Classify changes into:
   - npm package/runtime impact (`src/`, `package.json`, `package-lock.json`, `README.md`, `openapi.yaml`)
   - docs/site/process-only impact
3. Update GitHub release notes with an explicit **NPM Package Impact** section.
4. Include clear "changed/not changed" statements for API surface artifacts (notably `openapi.yaml`).
5. Verify by reading the release body after update.

## Constraints

- Do not commit changes unless user explicitly asks.
- Do not change generated copies when a source-of-truth file exists.
- Do not perform destructive operations without explicit user approval.
- For release-note fixes, prefer updating the existing GitHub release over creating duplicate releases.
