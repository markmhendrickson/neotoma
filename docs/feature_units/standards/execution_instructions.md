# Feature Unit Execution Instructions
## Feature Unit Lifecycle
```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TD
    Spec[Write Spec] --> Manifest[Create Manifest]
    Manifest --> Review1[Review Spec + Manifest]
    Review1 -->|Approved| Plan[Plan Implementation]
    Review1 -->|Changes| Spec
    Plan --> Implement[Implement Code]
    Implement --> Tests[Write Tests]
    Tests --> Docs[Update Docs]
    Docs --> Review2[Code Review]
    Review2 -->|Changes| Implement
    Review2 -->|Approved| Deploy[Deploy]
    Deploy --> Monitor[Monitor]
    Monitor -->|Issues| Rollback[Rollback]
    Monitor -->|Success| Complete[Complete]
    style Spec fill:#e1f5ff
    style Complete fill:#e6ffe6
    style Rollback fill:#ffe6e6
```
## Implementation Order
1. **Load Documentation**
   - `docs/NEOTOMA_MANIFEST.md`
   - Relevant subsystem docs from context index
2. **Implement Domain Logic**
   - Write deterministic extraction/entity resolution
   - Unit test each function
3. **Implement Application Logic**
   - Wire up domain services
   - Handle errors, emit events
   - Integration tests
4. **Implement UI (if applicable)**
   - Build components per spec
   - Add accessibility (keyboard, ARIA)
   - Add i18n strings
   - Component tests
5. **E2E Tests**
   - Test full user flows
   - Verify observability (metrics, logs)
6. **Documentation**
   - Update subsystem docs if patterns changed
   - Add examples
7. **Review and Deploy**
   - Human review per checklist
   - Deploy with monitoring
   - Watch key metrics
## Safety Classification
| Risk Level | Approval Required       | Testing Required   | Monitoring       |
| ---------- | ----------------------- | ------------------ | ---------------- |
| **Low**    | 1 reviewer              | Unit + integration | Standard         |
| **Medium** | 2 reviewers             | + E2E tests        | Enhanced         |
| **High**   | Tech lead + 2 reviewers | + Load tests       | Real-time alerts |
See `docs/private/governance/risk_classification.md` for classification rules.
## Agent Instructions
Load when implementing a Feature Unit or understanding execution flow.
**For creating NEW Feature Units:** See `docs/feature_units/standards/creating_feature_units.md` for complete workflow with interactive checkpoints.
**For implementing existing Feature Units:** Use this document after spec and prototype are approved.
Required co-loaded:
- `docs/feature_units/standards/feature_unit_spec.md` (spec template)
- `docs/feature_units/standards/error_protocol.md` (error handling)
- `docs/feature_units/standards/creating_feature_units.md` (creation workflow, if creating new FU)
Constraints:
- MUST have complete spec before coding (see creation workflow)
- MUST have prototype approved (if UI changes) before implementation
- MUST follow implementation order (this document)
- MUST write tests
- MUST update docs if patterns change
