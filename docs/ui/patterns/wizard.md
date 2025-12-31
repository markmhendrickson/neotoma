# UI Pattern: Wizard
*(Multi-Step Flows)*
## Purpose
Wizard pattern for multi-step processes (onboarding, setup).
## When to Use
- User onboarding
- Complex forms
- Multi-step configuration
## DSL Example
```yaml
component_type: wizard
steps:
  - id: upload
    title: "Upload File"
    component: FileUploadStep
  
  - id: review
    title: "Review"
    component: ReviewStep
  
  - id: confirm
    title: "Confirm"
    component: ConfirmStep
```
## Accessibility
- Step indicators MUST have ARIA labels
- Back/Next buttons MUST be keyboard accessible
- Current step MUST be announced to screen readers
## i18n
- Step titles translatable
- Button labels translatable
## Agent Instructions
### When to Load This Document
Load `docs/ui/patterns/wizard.md` when:
- Designing or implementing multi-step onboarding or setup flows
- Modifying wizard step structure or navigation
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (explicit user control, no hidden automation)
- `docs/subsystems/accessibility.md` (wizard accessibility)
- `docs/subsystems/i18n.md` (localization requirements)
- `docs/specs/ONBOARDING_SPEC.md` (onboarding flows)
### Constraints Agents Must Enforce
1. MUST ensure each step is explicit and user-controlled (no auto-advancing without consent)
2. MUST announce current step and progress to assistive technologies
3. MUST support keyboard navigation for Back/Next actions
### Forbidden Patterns
- Auto-advancing steps without clear user action
- Hiding critical choices behind implicit defaults
- Skipping accessibility requirements for step indicators and controls
### Validation Checklist
- [ ] Steps are clearly labeled and translatable
- [ ] Current step is announced and visually indicated
- [ ] Keyboard and screen reader navigation verified
