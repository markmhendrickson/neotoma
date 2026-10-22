# Exact identity admission

`schema_definition.identity_contract` reserves an immutable identity declaration
in the existing schema registry. It is available only for a fresh schema and
identity space. Existing schemas, entities and legacy ID bytes are unchanged.

```json
{
  "fields": { "code": { "type": "string" } },
  "identity_contract": {
    "version": "2",
    "mode": "exact_utf8",
    "namespace": "inventory:item:v2",
    "canonical_name_fields": ["code"]
  }
}
```

Register with `activate: false`. Exact activation and public exact writes are
currently unavailable. An inactive reservation cannot fall back to legacy
resolution. This admission foundation does not establish support for exact
identifier retrieval, imports, split/merge, recomputation or embedded execution.

The declaration uses the existing identity-rule grammar: a flat string array
is one all-required composite; a mixed array containing a composite object is
an ordered rule list. Identifier fields must be declared strings without value
converters. Outer `canonical_name_fields`, when supplied, must match the contract.
Missing identifiers never acquire a display-name identity.

Admission captures the existing owner-scoping policy once. Later versions retain
the same accepted namespace, owner policy and identity rules, even if the host's
legacy identity setting changes. Nonidentity schema fields can evolve normally.
Native database guards prevent replacement, deletion, downgrade or scope changes
of accepted bindings. They also prevent activation and legacy entity/observation
insertion into reserved spaces while consumer conversion is incomplete.

The deterministic framing primitive includes the admitted contract identifier,
namespace, entity type, captured owner scope, selected rule and separately
length-framed field names and values. It preserves case, punctuation, whitespace
and Unicode normalization forms. Unpaired UTF-16 surrogates are rejected before
UTF-8 encoding. Display formatting and heuristic matching supply no identity
authority. These primitive guarantees are narrower than public write/read support.

No migration of old identities or reconstruction of previously collapsed records
is provided. Such a migration requires a separate inventory and explicit mapping
and ambiguity policy.

## Consumer conversion checkpoint

The registry loader validates every visible version against the retained original
anchor and the accepted declaration, including inactive versions. Missing anchors,
missing bindings, changed owner policies and unsupported declarations refuse;
there is no legacy fallback for an explicit exact declaration. Returned internal
metadata is copied and frozen. A valid checksum alone does not confer authority:
central preparation reads the binding from the registry.

Internal central and conditional preparation now select the same raw declared
strings and framing primitive. Case, punctuation, leading/trailing whitespace,
Unicode whitespace and composed/decomposed strings remain distinct. Preparation
is read-only and does not authorize persistence. Targeted writes refuse until
immutable original per-entity components are supported. Snapshot-derived names
cannot replace original exact identifiers.

| Consumer                                                        | Current exact-namespace boundary                                                          | Work before activation                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Central object/positional resolution and structured store       | Accepted declaration validated; public mutation refused                                   | Persist immutable original components and use them for matching/replay           |
| Conditional store                                               | Refuses before claiming its operation key; internal preparation uses raw strings          | Bind persisted components and conditional receipts atomically                    |
| Typed identifier lookup (HTTP, MCP, generic CLI)                | Canonical refusal before legacy folding, aliases or fuzzy matching                        | Match admitted original components and the selected rule                         |
| Untyped/raw-ID identifier lookup                                | Reserved candidate types refuse before return; ordinary candidates retain legacy behavior | Prove complete exact candidate acquisition without display-derived identity      |
| Snapshot computation/canonical-name recomputation               | Reserved types refuse before projection or name effects                                   | Read immutable original components; keep display separate                        |
| Company normalization/fuzzy helpers and signal lookup           | Not converted                                                                             | Use the same admitted binding or refuse before any relaxed matching              |
| Targeted correction, merge, split and type repair               | Not converted; native reserved writes remain closed                                       | Explicit preflight and canonical refusal or settled original-component semantics |
| Interpretation, raw-fragment promotion and file/model ingestion | Not converted end to end                                                                  | Preflight before source/run/claim effects, including inferred/aliased types      |
| Import/sync and specialized internal entity writers             | No separate exact import contract                                                         | Inventory entrypoints and prove the shared resolver or explicit refusal          |

Native guards also reject reclassification of an ordinary entity or observation
into a reserved namespace. They are a persistence boundary, not evidence that an
unconverted API has canonical errors or rolls back earlier side effects. Exact
activation remains unavailable until all supported consumers are converted or
explicitly refused and natural-interface acceptance covers their effects.
