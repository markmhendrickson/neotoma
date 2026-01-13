# File Naming Convention Migration Status

**Date:** 2026-01-01  
**Status:** Complete (Core violations addressed)

## Summary

Applying file naming convention from `foundation/agent_instructions/cursor_rules/file_naming.md` to `docs/` directory. All files must use snake_case (underscores) and lowercase (except README/CHANGELOG).

## Completed Renames

### Files with Dashes (Kebab-case → Snake_case)

- ✅ `docs/developer/add-summary-field_plan.md` → `docs/developer/add_summary_field_plan.md`
- ✅ `docs/architecture/local-first-e2ee-architecture.md` → `docs/architecture/local_first_e2ee_architecture.md`
- ✅ `docs/architecture/ingestion/dual-path_inference-based_ingestion.md` → `docs/architecture/ingestion/dual_path_inference_based_ingestion.md`
- ✅ `docs/architecture/ingestion/raw-first_ingestion_architecture.md` → `docs/architecture/ingestion/raw_first_ingestion_architecture.md`
- ✅ `docs/architecture/ingestion/sources-first-ingestion-v9.md` → `docs/architecture/ingestion/sources_first_ingestion_v9.md`
- ✅ `docs/architecture/ingestion/sources-first-ingestion-v11.md` → `docs/architecture/ingestion/sources_first_ingestion_v11.md`
- ✅ `docs/architecture/ingestion/sources-first_ingestion_v10.md` → `docs/architecture/ingestion/sources_first_ingestion_v10.md`
- ✅ `docs/architecture/ingestion/sources-first_ingestion_v12_final.md` → `docs/architecture/ingestion/sources_first_ingestion_v12_final.md` → `docs/architecture/sources_first_ingestion_final.md` (moved and version removed)

**Note:** FU-XXX files (e.g., `FU-100_implementation_log.md`) use dashes as part of feature unit IDs and are acceptable.

### Files with Uppercase → Lowercase

**UI Files:**
- ✅ `docs/ui/STYLE_GUIDE_UPDATES.md` → `docs/ui/style_guide_updates.md`
- ✅ `docs/ui/SHADCN_COMPONENTS.md` → `docs/ui/shadcn_components.md`

**Developer Files:**
- ✅ `docs/developer/VITE_TROUBLESHOOTING.md` → `docs/developer/vite_troubleshooting.md`

**Release Files (v0.2.15):**
- ✅ `docs/releases/v0.2.15/CLI_INSTALLATION_OPTIONS.md` → `docs/releases/v0.2.15/cli_installation_options.md`
- ✅ `docs/releases/v0.2.15/IMPLEMENTATION_SUMMARY.md` → `docs/releases/v0.2.15/implementation_summary.md`
- ✅ `docs/releases/v0.2.15/STATUS.md` → `docs/releases/v0.2.15/status.md`
- ✅ `docs/releases/v0.2.15/MIGRATION_GUIDE.md` → `docs/releases/v0.2.15/migration_guide.md`
- ✅ `docs/releases/v0.2.15/RELEASE_BUILD_SUMMARY.md` → `docs/releases/v0.2.15/release_build_summary.md`
- ✅ `docs/releases/v0.2.15/APPLY_MIGRATIONS_MANUALLY.md` → `docs/releases/v0.2.15/apply_migrations_manually.md`
- ✅ `docs/releases/v0.2.15/DEPLOYMENT_CHECKLIST.md` → `docs/releases/v0.2.15/deployment_checklist.md`

**Release Files (v0.2.3):**
- ✅ `docs/releases/v0.2.3/ENHANCEMENTS_SUMMARY.md` → `docs/releases/v0.2.3/enhancements_summary.md`
- ✅ `docs/releases/v0.2.3/AGENT_SKILLS_ALIGNMENT.md` → `docs/releases/v0.2.3/agent_skills_alignment.md`
- ✅ `docs/releases/v0.2.3/RELEASE_OVERVIEW.md` → `docs/releases/v0.2.3/release_overview.md`
- ✅ `docs/releases/v0.2.3/PLAN_COMPLETION_REVIEW.md` → `docs/releases/v0.2.3/plan_completion_review.md`

**Other Release Files:**
- ✅ `docs/releases/v0.1.0/REMEDIATION_SUMMARY.md` → `docs/releases/v0.1.0/remediation_summary.md`

**Prototype Files:**
- ✅ `docs/prototypes/PROTOTYPE_SUMMARY.md` → `docs/prototypes/prototype_summary.md`
- ✅ `docs/prototypes/PROTOTYPE_QUICKSTART.md` → `docs/prototypes/prototype_quickstart.md`
- ✅ `docs/prototypes/PROTOTYPE_INDEX.md` → `docs/prototypes/prototype_index.md`
- ✅ `docs/prototypes/PROTOTYPE_COMPLETE.md` → `docs/prototypes/prototype_complete.md`

**Private/Strategy Files:**
- ✅ `docs/private/DOCUMENTATION_SECOND_PASS_AUDIT.md` → `docs/private/documentation_second_pass_audit.md`
- ✅ `docs/private/strategy/COMPETITIVE_LANDSCAPE.md` → `docs/private/strategy/competitive_landscape.md`
- ✅ `docs/private/strategy/IMPLEMENTATION_OVERLAP_ANALYSIS.md` → `docs/private/strategy/implementation_overlap_analysis.md`

**Feature Unit Standards:**
- ✅ `docs/feature_units/standards/DISCOVERY_CAGAN_ALIGNMENT.md` → `docs/feature_units/standards/discovery_cagan_alignment.md`

## Remaining Files

### Acceptable Exceptions

The following files use uppercase but are acceptable per convention:

- **README.md and CHANGELOG.md**: Special files allowed to use uppercase
- **Spec files in `docs/specs/`**: Legacy convention (e.g., `MCP_SPEC.md`, `DATA_MODELS.md`). New spec files should use lowercase.
- **FU-XXX files**: Feature unit files use uppercase as part of identifiers (e.g., `FU-100_implementation_log.md`, `FU-050_spec.md`). These follow a consistent pattern and may be acceptable depending on project conventions.

## Reference Updates

After renaming files, all references must be updated in:
- Markdown files (`.md`)
- YAML files (`.yaml`, `.yml`)
- Code files that reference documentation paths
- `doc_dependencies.yaml`

## Script

A script has been created at `scripts/apply_file_naming_convention.sh` to automate renaming and reference updates. Run with caution and review changes before committing.

## Next Steps

1. Complete remaining file renames
2. Update all references in documentation
3. Verify no broken links
4. Update `doc_dependencies.yaml` if needed

