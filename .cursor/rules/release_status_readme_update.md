# Release Status README Update Rule

## Purpose

Ensures the README.md file always reflects the current status of all releases, maintaining accurate project status visibility for all developers and stakeholders.

## Trigger Patterns

When a release status changes (e.g., from `planning` to `in_progress`, `in_progress` to `ready_for_deployment`, `ready_for_deployment` to `deployed`), agents MUST update the README.md Releases section immediately.

## Agent Actions

### Step 1: Detect Status Change

1. When release status changes in `docs/releases/{version}/status.md`
2. Identify the new status value
3. Locate the corresponding release entry in README.md (lines 167-179)

### Step 2: Update README.md

1. Read the current README.md Releases section
2. Find the release entry matching the version
3. Update the status in parentheses (e.g., `(planning)` → `(ready_for_deployment)`)
4. Preserve all other content in the release entry
5. Verify the status matches exactly what's in the release status.md file

### Step 3: Verify Update

1. Confirm the status in README.md matches the status in `docs/releases/{version}/status.md`
2. Ensure no other release entries were accidentally modified

## Constraints

- MUST update README.md immediately when release status changes
- MUST NOT defer this update to a later conversation or task
- MUST preserve all other content in the release entry (description, links, etc.)
- MUST use exact status values from the release status.md file
- MUST update during the same conversation where status changes

## Status Values

Valid status values (from release workflow):
- `planning`
- `in_progress`
- `ready_for_deployment`
- `deployed`
- `completed`

## Example

**Before:**
```markdown
- **v0.2.0**: Minimal Ingestion + Correction Loop (`planning`). Sources-first ingestion...
```

**After (when status changes to `ready_for_deployment`):**
```markdown
- **v0.2.0**: Minimal Ingestion + Correction Loop (`ready_for_deployment`). Sources-first ingestion...
```

