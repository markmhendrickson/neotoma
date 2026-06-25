# Machine-readable use-case → bundle map

Each `<use_case>.yaml` here mirrors a row of the "Reconciled bundle catalog"
table in `docs/foundation/bundles.md`. The map is many-to-many: a use case lists
the bundles that together serve it; `core` and `infrastructure` are implicit
(always active) and `core_workflows` is included by every use case.

Schema fields per file:

```yaml
use_case: <id>            # matches docs/use_cases/<id>.md
description: <one line>
schema_bundles: [...]     # schema bundles required (excludes implicit core/infra)
skill_bundles: [...]      # skill bundles (always includes core_workflows)
```

## Scope (m2)

Real bundle directories exist only for `core`, `infrastructure`, and
`core_workflows`. The 12 new schema bundles in the catalog (`agent_auth`,
`cases`, `compliance`, `crm`, `communications`, `crypto_engineering`,
`customer_ops`, `diligence`, `financial_ops`, `government`, `healthcare`,
`logistics`, `personal_data`, `portfolio`, `procurement`, `trading`) are
**catalog references only** in m2 — these YAML files name them but no bundle dir
ships yet.

Representative entries are scaffolded below. The full set of 16 use cases is
tracked as a follow-up; entries not yet written are listed as TODO in the m2 PR
body.
