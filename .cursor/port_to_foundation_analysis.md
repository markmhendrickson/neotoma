# Port to Foundation Analysis

Analysis of `.cursor/` materials to identify what can be generalized and moved to foundation.

## Summary

**Found 5 items that could potentially be generalized:**
1. `release_detection.md` (rule) - **HIGH PRIORITY** - Already references foundation, just needs to be moved
2. `checkpoint_management.md` (rule) - **MEDIUM PRIORITY** - Part of generic release workflow
3. `post_build_testing.md` (rule) - **MEDIUM PRIORITY** - Generic testing guidance pattern
4. `bug_fix_detection.md` (rule) - **LOW PRIORITY** - Could be generalized if error classification is configurable
5. `fix_feature_bug.md` (command) - **LOW PRIORITY** - Depends on error classification generalization

**Found 2 items that are REPO-SPECIFIC (should stay):**
1. `modify_subsystem.md` (command) - Neotoma-specific subsystems
2. `ingestion_flow.md` (command) - Neotoma-specific ingestion pipeline patterns

---

## Items to Port

### 1. `release_detection.md` (Rule) - **HIGH PRIORITY**

**Status:** Already references foundation files, just needs to be moved and generalized

**Current location:** `.cursor/rules/release_detection.md`

**Should move to:** `foundation/agent-instructions/cursor-rules/release_detection.md`

**Generalization needed:**
- Already references `foundation/development/release_workflow.md`
- Already references `foundation/agent-instructions/cursor-commands/create_release.md`
- Needs to remove Neotoma-specific paths:
  - `docs/feature_units/standards/creating_feature_units.md` → use foundation paths
  - `docs/specs/MVP_FEATURE_UNITS.md` → remove (repo-specific)
  - `docs/releases/in_progress/` → use configurable path from foundation-config

**Recommendation:** ✅ **MOVE** - Already well-structured for foundation, minimal changes needed

---

### 2. `checkpoint_management.md` (Rule) - **MEDIUM PRIORITY**

**Status:** Referenced in release workflow, could be generalized

**Current location:** `.cursor/rules/checkpoint_management.md`

**Should move to:** `foundation/agent-instructions/cursor-rules/checkpoint_management.md`

**Generalization needed:**
- Already references `docs/feature_units/standards/release_workflow.md` → change to `foundation/development/release_workflow.md`
- Checkpoint logic is generic (batch completion triggers checkpoints)
- Paths need to be configurable:
  - `manifest.yaml` path → use configurable release directory
  - `status.md` path → use configurable release directory

**Dependencies:**
- Release workflow already uses checkpoints
- Checkpoint system is part of generic release workflow

**Recommendation:** ✅ **MOVE** - Generic checkpoint system, just needs path configuration

---

### 3. `post_build_testing.md` (Rule) - **MEDIUM PRIORITY**

**Status:** Generic testing guidance pattern, could be generalized

**Current location:** `.cursor/rules/post_build_testing.md`

**Should move to:** `foundation/agent-instructions/cursor-rules/post_build_testing.md`

**Generalization needed:**
- Testing guidance pattern is generic (manual test cases after build)
- Paths need to be configurable:
  - `docs/releases/in_progress/{RELEASE_ID}/integration_tests.md` → use configurable path
  - `docs/releases/in_progress/{RELEASE_ID}/release_report.md` → use configurable path
- Test case format is generic (user-facing instructions)
- Integration with release report generation is generic

**Dependencies:**
- Release workflow (already in foundation)
- Integration tests structure (may need to be configurable)

**Recommendation:** ✅ **MOVE** - Generic testing guidance pattern, useful for any release workflow

---

### 4. `bug_fix_detection.md` (Rule) - **LOW PRIORITY**

**Status:** Could be generalized if error classification is made configurable

**Current location:** `.cursor/rules/bug_fix_detection.md`

**Should move to:** `foundation/agent-instructions/cursor-rules/bug_fix_detection.md` (if generalized)

**Generalization needed:**
- Error classification system needs to be configurable (Class 1/2/3 system is Neotoma-specific)
- Detection patterns are generic (bug, error, fix, broken, etc.)
- Workflow structure is generic (classify → fix → test)
- Paths need to be configurable:
  - Feature Unit spec paths → use configurable FU directory
  - Error protocol path → needs to be configurable or removed
  - Subsystem docs → remove (repo-specific)

**Dependencies:**
- Error classification system needs to be extracted to foundation config
- Fix command needs to be generalized first

**Recommendation:** ⚠️ **DEFER** - Requires error classification generalization first. Could be done later if other repos want bug fix workflows.

---

### 5. `fix_feature_bug.md` (Command) - **LOW PRIORITY**

**Status:** Depends on error classification generalization

**Current location:** `.cursor/commands/fix_feature_bug.md`

**Should move to:** `foundation/agent-instructions/cursor-commands/fix_feature_bug.md` (if generalized)

**Generalization needed:**
- Error classification system (Class 1/2/3) needs to be configurable
- Very Neotoma-specific currently:
  - References `docs/feature_units/standards/error_protocol.md`
  - References specific subsystems (i18n, accessibility)
  - References Neotoma-specific test commands (TEST_CHANGED, TEST_ALL)

**Dependencies:**
- Error classification system generalization
- Feature Unit workflow (already in foundation)
- Test infrastructure (repo-specific)

**Recommendation:** ⚠️ **DEFER** - Very repo-specific, would require significant generalization. Only move if other repos need similar bug fix workflows.

---

## Items to Keep (Repo-Specific)

### 1. `modify_subsystem.md` (Command)

**Reason:** Highly Neotoma-specific
- References specific subsystems (schema, ingestion, search, vector_ops, auth, i18n, accessibility, privacy, events, errors)
- References Neotoma-specific docs (`docs/subsystems/`, `docs/migration/migrations_lifecycle.md`)
- References Neotoma-specific test commands (TEST_CHANGED, TEST_ALL)
- Not generalizable to other repositories

**Recommendation:** ❌ **KEEP IN REPO** - Repository-specific command

---

### 2. `ingestion_flow.md` (Command)

**Reason:** Neotoma-specific domain workflow
- Document ingestion, normalization, chunking, embeddings, indexing
- Neotoma-specific ingestion pipeline patterns
- Not applicable to other repositories

**Recommendation:** ❌ **KEEP IN REPO** - Repository-specific domain workflow

---

## Implementation Priority

### Phase 1: Easy Wins (Already Foundation-Ready)
1. ✅ **`release_detection.md`** - Move and update paths
   - Already references foundation
   - Minimal changes needed
   - Update foundation-config.yaml to include in generic_rules

### Phase 2: Moderate Effort (Generic Patterns)
2. ✅ **`checkpoint_management.md`** - Move and configure paths
   - Generic checkpoint system
   - Paths need to be configurable
   - Already referenced in release workflow

3. ✅ **`post_build_testing.md`** - Move and configure paths
   - Generic testing guidance pattern
   - Paths need to be configurable
   - Useful for any release workflow

### Phase 3: Future Consideration (Requires Generalization)
4. ⚠️ **`bug_fix_detection.md`** - Defer until error classification is generalized
5. ⚠️ **`fix_feature_bug.md`** - Defer until error classification is generalized

---

## Next Steps

1. Move `release_detection.md` to foundation (high priority, easy)
2. Move `checkpoint_management.md` to foundation (medium priority, moderate effort)
3. Move `post_build_testing.md` to foundation (medium priority, moderate effort)
4. Update foundation-config.yaml to include new rules in generic_rules
5. Update Neotoma's .cursor/rules to remove moved rules (or create symlinks)
6. Update documentation references in moved rules

---

## Configuration Needed

For checkpoint_management and post_build_testing, need to add to foundation-config.yaml:

```yaml
development:
  releases:
    directory: "docs/releases/"  # Configurable release directory
    in_progress_subdir: "in_progress"
    integration_tests_file: "integration_tests.md"
    release_report_file: "release_report.md"
```

For release_detection, already has foundation-config support via feature_units.directory.





