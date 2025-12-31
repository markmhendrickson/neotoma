# UI Pattern: Settings
## Purpose
Settings pattern for user preferences and system configuration.
## When to Use
- User preferences
- System settings
- Integration configuration
## DSL Example
```yaml
component_type: settings
layout:
  type: form
  sections:
    - title: "General"
      fields:
        - field: locale
          label: "Language"
          type: select
          options: ["en-US", "es-ES", "fr-FR"]
        - field: timezone
          label: "Timezone"
          type: select
```
## States
- Loading: Skeleton form
- Saved: Success message
- Error: Error per field
## Accessibility
- Form fields MUST have labels
- Error messages MUST be associated with fields
## i18n
- All labels translatable
- Locale picker itself localized
## Agent Instructions
### When to Load This Document
Load `docs/ui/patterns/settings.md` when:
- Designing or implementing settings/preferences UIs
- Modifying forms that configure Neotoma behavior or integrations
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (explicit user control, privacy)
- `docs/subsystems/accessibility.md` (form accessibility)
- `docs/subsystems/i18n.md` (locale and language behavior)
### Constraints Agents Must Enforce
1. MUST ensure all settings changes are explicit and reversible
2. MUST label all form fields and associate errors correctly
3. MUST preserve content language and locale semantics
### Forbidden Patterns
- Hidden or implicit settings that change ingestion or privacy behavior
- Unlabeled fields or errors
- Auto-saving without clear user feedback
### Validation Checklist
- [ ] All fields have labels and associated error messages\n- [ ] Settings changes are explicit and visible to user\n- [ ] Localization and accessibility rules followed\n\*\*\* End Patch```}]]
