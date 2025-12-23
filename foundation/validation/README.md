# Validation Systems

Optional validation systems for code compliance and documentation consistency.

## Overview

Foundation provides two optional validation systems:

1. **Spec Compliance Validation** - Validates code against specification requirements
2. **Documentation Dependency Validation** - Tracks and validates documentation dependencies

Both are disabled by default and can be enabled via `foundation-config.yaml`.

## Spec Compliance Validation

Validates that code implements all requirements from specifications.

### Configuration

```yaml
validation:
  spec_compliance:
    enabled: true
    spec_paths:
      - "docs/specs/**/*.md"
      - "docs/features/**/*.md"
    requirement_patterns:
      - "MUST"
      - "MUST NOT"
      - "SHALL"
      - "REQUIRED"
    check_types:
      - "code_existence"
      - "database_schema"
      - "validation_logic"
      - "testing"
```

### Usage

Implement `validate-spec-compliance.js` in your repository to check that code implements spec requirements.

**Example checks:**
- Required functions exist
- Database tables/columns match schema specs
- Validation logic matches requirements
- Tests cover all specified functionality

## Documentation Dependency Validation

Tracks dependencies between documentation files and validates updates.

### Configuration

```yaml
validation:
  doc_dependencies:
    enabled: true
    dependency_map_path: "docs/doc_dependencies.yaml"
    check_on_commit: true
    auto_suggest_updates: true
```

### Dependency Map Format

```yaml
# docs/doc_dependencies.yaml
dependencies:
  "docs/architecture/overview.md":
    downstream:
      - "docs/subsystems/ingestion.md"
      - "docs/subsystems/storage.md"
    reason: "Subsystems reference architecture patterns"
  
  "docs/subsystems/ingestion.md":
    upstream:
      - "docs/architecture/overview.md"
    downstream:
      - "README.md"
    reason: "Ingestion is user-facing feature"
```

### Usage

When you modify a documentation file:

```bash
# Check downstream dependencies
node scripts/validate-doc-dependencies.js docs/architecture/overview.md

# Output: Files that may need updates
# - docs/subsystems/ingestion.md (reason: references architecture patterns)
# - docs/subsystems/storage.md (reason: references architecture patterns)
```

## Implementation

These validation systems are optional and implementation-specific. Foundation provides:

- Configuration structure
- Conceptual framework
- Integration points

Projects implement the actual validation logic based on their needs.

See project-specific `scripts/` directory for implementation examples.

