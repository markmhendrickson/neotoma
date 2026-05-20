# Use cases

Canonical reference for Neotoma use cases. Each file describes a vertical application of the deterministic state layer and maps it to activation skills.

These markdown files serve as the source of truth for the site's `/use-cases` page and the skill-to-use-case mapping in `docs/skills/skill_strategy.md`.

## Bundle composition

Use cases are served by sets of **bundles**, the unit through which Neotoma ships schemas, record-type docs, and skills. See `docs/foundation/bundles.md` for the conceptual model and the reconciled bundle catalog.

The relationship between use cases and bundles is many-to-many: each use case lists the bundles that together serve it, and each bundle serves multiple use cases. Every use case includes the `core_workflows` skill bundle (session-loop skills from the default install). `core` and `infrastructure` schema bundles are always active and omitted below unless a use case depends on infrastructure types directly.

| Use case | Bundles |
|---|---|
| `agent_auth` | `infrastructure`, `agent_auth`, `core_workflows` |
| `cases` | `cases`, `crm`, `core_workflows` |
| `compliance` | `contracts`, `compliance`, `core_workflows` |
| `contracts` | `contracts`, `core_workflows` |
| `crm` | `crm`, `communications`, `core_workflows` |
| `crypto_engineering` | `crypto_engineering`, `core_workflows` |
| `customer_ops` | `crm`, `customer_ops`, `core_workflows` |
| `diligence` | `crm`, `financial_ops`, `contracts`, `diligence`, `core_workflows` |
| `financial_ops` | `financial_ops`, `core_workflows` |
| `government` | `government`, `compliance`, `core_workflows` |
| `healthcare` | `healthcare`, `personal_data`, `core_workflows` |
| `logistics` | `logistics`, `financial_ops`, `core_workflows` |
| `personal_data` | `personal_data`, `core_workflows` |
| `portfolio` | `financial_ops`, `portfolio`, `core_workflows` |
| `procurement` | `financial_ops`, `contracts`, `procurement`, `core_workflows` |
| `trading` | `financial_ops`, `trading`, `core_workflows` |

## Files

| File | Use case | Primary skills |
|------|----------|---------------|
| `personal_data.md` | Personal agent state | `remember-email`, `remember-finances`, `remember-contacts`, `remember-calendar` |
| `financial_ops.md` | Financial operations | `remember-finances` |
| `crm.md` | CRM | `remember-email`, `remember-contacts` |
| `compliance.md` | Vendor risk & compliance | `remember-email`, `store-data` |
| `contracts.md` | Contract lifecycle | `store-data`, `query-memory` |
| `diligence.md` | M&A and investment diligence | `store-data`, `query-memory` |
| `portfolio.md` | Portfolio monitoring | `store-data`, `query-memory` |
| `cases.md` | Legal & investigation | `store-data`, `query-memory` |
| `procurement.md` | Procurement & sourcing | `store-data`, `query-memory` |
| `agent_auth.md` | Agent authorization | `store-data` |
| `healthcare.md` | Healthcare operations | `store-data`, `query-memory` |
| `government.md` | Public sector & GovTech | `store-data`, `query-memory` |
| `customer_ops.md` | Support & CX operations | `store-data`, `query-memory` |
| `logistics.md` | Logistics & supply chain | `store-data`, `query-memory` |
| `trading.md` | Autonomous trading agents | `store-data`, `query-memory` |
| `crypto_engineering.md` | Crypto & security engineering | `remember-codebase`, `store-data` |
