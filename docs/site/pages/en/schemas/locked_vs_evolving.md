---
path: /schemas/locked-vs-evolving
locale: en
page_title: Locked vs evolving schemas
shell: detail
translation_status: canonical
nav_group: guides
nav_order: 83
---

Neotoma exposes a schema-authoring posture through the `NEOTOMA_SCHEMA_MODE` environment variable. The default, `evolving`, matches Neotoma's historical behavior: any entity type may auto-create on first write. Two stricter modes, `guided` and `locked`, are introduced alongside the bundles model to let teams curate or freeze the set of registered types.

## Why a schema mode

Schema evolution is a feature for exploratory work and a risk for regulated deployments. The same Neotoma install can serve both audiences when the posture is configurable: an individual user benefits from auto-inferred schemas while a compliance-bound team wants every entity type to be an explicit, reviewed contract.

The mode is read at boot, cached, and surfaced in the Inspector (a small badge in the Inspector header reflects the current mode). The default is `evolving`, so existing installs see no behavior change when the variable is introduced.

## The three modes

| Value                | Behavior                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evolving` (default) | Any entity type may auto-create on first write. Matches Neotoma's current behavior.                                                                       |
| `guided`             | Only entity types provided by installed bundles may auto-create. Unknown types are rejected with a structured error naming the bundles that provide them. |
| `locked`             | No auto-create. Every entity type MUST be registered explicitly via an installed bundle.                                                                  |

## How to enable

Set the environment variable before starting the server:

```
NEOTOMA_SCHEMA_MODE=guided neotoma serve
```

or persist it in your `.env`:

```
NEOTOMA_SCHEMA_MODE=locked
```

Restart the server to pick up the change. Invalid values fall back to `evolving` with a structured warning so misconfiguration never breaks startup. Comparison is case-insensitive: `LOCKED`, `Locked`, and `locked` all resolve to the same canonical value.

## What gets rejected under guided and locked

Milestone 1 (m1) of the bundles work introduces the flag and surfaces the value via `/server-info` and the Inspector badge. **Currently nothing is rejected**: enforcement lands in milestone 2, which gates the two auto-create points in `src/server.ts` and `src/services/interpretation.ts`. Until then, `guided` and `locked` are observable but not yet enforced.

Once enforcement lands, the rejection envelope under `guided` and `locked` will name the missing bundle and suggest the install path, so an operator can either install the bundle that provides the type or treat the unknown type as a legitimate error.

## Relationship to bundles

Bundles are the unit through which schemas, record-type docs, and skills ship in Neotoma. Under `guided` and `locked`, the set of registered entity types is determined by the set of installed bundles. See [Bundles](/foundation/bundles) for the full bundle model, lifecycle, and reconciled catalog.

## Related

- [Schema modes FAQ](/faq/schema-modes)
- [Schemas overview](/schemas)
- [Schema registry](/schemas/registry)
- [Bundles](/foundation/bundles)
