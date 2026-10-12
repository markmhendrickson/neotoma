# Machine-readable use-case → bundle map

Each `<use_case>.yaml` here mirrors a row of the "Reconciled bundle catalog"
table in `docs/foundation/bundles.md`. The map is many-to-many: a use case lists
the bundles that together serve it; `core` and `infrastructure` are implicit
(always active) and `core_workflows` is included by every use case.

Schema fields per file:

```yaml
use_case: <id> # matches docs/use_cases/<id>.md
description: <one line>
schema_bundles: [...] # schema bundles required (excludes implicit core/infra)
skill_bundles: [...] # skill bundles (always includes core_workflows)
```

## Scope

Real bundle directories exist for the default install (`core`,
`infrastructure`, `core_workflows`) and for the first opt-in schema bundles:
`crm`, `engineering`, and `communications` (email only). `engineering`
replaces the planned `devops` and `crypto_engineering` bundles, so
`crypto_engineering.yaml` names it.

The remaining catalog bundles (`agent_auth`, `cases`, `compliance`,
`customer_ops`, `diligence`, `financial_ops`, `government`, `healthcare`,
`logistics`, `personal_data`, `portfolio`, `procurement`, `trading`) are
**catalog references only** — these YAML files name them but no bundle dir
ships yet.
