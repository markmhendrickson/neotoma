---
title: Schema modes (evolving, guided, locked)
category: developer_reference
locale: en
page_title: Schema modes
path: /faq/schema-modes
translation_status: canonical
---

# Schema modes (evolving, guided, locked)

## What's the difference between evolving, guided, and locked schema modes in Neotoma?

Neotoma exposes three schema-evolution modes via the `NEOTOMA_SCHEMA_MODE` environment variable.

| Value                | Behavior                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evolving` (default) | Any entity type may auto-create on first write. This is the historical default and matches Neotoma's current behavior.                                    |
| `guided`             | Only entity types provided by installed bundles may auto-create. Unknown types are rejected with a structured error naming the bundles that provide them. |
| `locked`             | No auto-create. Every entity type MUST be registered explicitly via an installed bundle.                                                                  |

The mode is read at boot and surfaced in the Inspector. The default is `evolving`, so existing installs see no behavior change when the variable is introduced.

## Where bundles fit

Bundles are the unit through which schemas, record-type docs, and skills ship in Neotoma. Under `guided` and `locked` modes, the set of registered entity types is determined by the set of installed bundles. See [Bundles](/foundation/bundles) for the bundle model and the reconciled catalog.

## When to use which mode

- `evolving`: exploratory work, prototypes, personal use where schema fluidity is desirable.
- `guided`: production teams that want curated schema growth without losing the ability for installed bundles to evolve.
- `locked`: regulated or audit-sensitive deployments where schema is a contract and any unregistered type MUST be an explicit error.

## Related

- `docs/foundation/bundles.md`
- `docs/site/pages/en/faq.md`
