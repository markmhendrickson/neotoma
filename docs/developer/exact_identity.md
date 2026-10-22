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

| Consumer                                                        | Current exact-namespace boundary                                                                                      | Work before activation                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Central object/positional resolution and structured store       | Accepted declaration validated; public mutation refused                                                               | Persist immutable original components and use them for matching/replay      |
| Conditional store                                               | Refuses before claiming its operation key; internal preparation uses raw strings                                      | Bind persisted components and conditional receipts atomically               |
| Typed identifier lookup (HTTP, MCP, generic CLI)                | Canonical refusal before legacy folding, aliases or fuzzy matching                                                    | Match admitted original components and the selected rule                    |
| Untyped/raw-ID identifier lookup                                | Returned entity and owned snapshot metadata types refuse before return; ordinary candidates retain legacy behavior    | Prove complete exact candidate acquisition without display-derived identity |
| Snapshot computation/canonical-name recomputation               | Reserved types refuse before projection or name effects                                                               | Read immutable original components; keep display separate                   |
| Company normalization/fuzzy helpers and signal lookup           | Not converted                                                                                                         | Use the same admitted binding or refuse before any relaxed matching         |
| Correction (including CAS/transaction), merge and split         | Owned physical types and requested namespaces refuse before effects or replay; HTTP/MCP/CLI preserve canonical errors | Settled original-component mutation semantics before any positive support   |
| Plural type repair                                              | Not converted; native reserved writes remain closed                                                                   | Explicit preflight and canonical refusal before repair effects              |
| Interpretation, raw-fragment promotion and file/model ingestion | Not converted end to end                                                                                              | Preflight before source/run/claim effects, including inferred/aliased types |
| Import/sync and specialized internal entity writers             | No separate exact import contract                                                                                     | Inventory entrypoints and prove the shared resolver or explicit refusal     |

Native guards also reject reclassification of an ordinary entity or observation
into a reserved namespace. They are a persistence boundary, not evidence that an
unconverted API has canonical errors or rolls back earlier side effects. Exact
activation remains unavailable until all supported consumers are converted or
explicitly refused and natural-interface acceptance covers their effects.

Returned-candidate validation retains physical type metadata alongside each
acquired payload in a private per-call sidecar. It does not re-read current
metadata to certify older content. Raw-ID, direct-name and snapshot-field reads
retain the actual acquired types even if a materialization is replaced or deleted
before validation. User data named `entity_type` inside snapshot JSON supplies no
metadata authority; the sidecar is absent from public responses. Negative
fault-injection fixtures exercise this boundary without activating a namespace
or creating an exact entity.

## Original component storage foundation

A nullable private `entities.identity_record` column reserves immutable original
identity authority in the existing entity store. Internal preparation retains the
original accepted anchor and contract ID, namespace, owner, selected rule and
ordered raw components. Validation must reproduce the physical entity ID from
those components under the retained accepted binding. Display names, aliases and
snapshots cannot reconstruct this authority. Ordinary row responses omit this
private column, including its legacy NULL value.

This is a storage/preparation foundation. Non-NULL insertion remains refused while
activation is closed; legacy rows cannot acquire authority through an update.
Native guards prevent replacing or removing stored authority, changing its entity
or owner, and erasing it through replacement or deletion. Negative unsupported
restore fixtures prove these guards without representing corrupt rows as accepted
exact persistence. No supported exact record has been written by this stage.

Positive atomic component persistence and operation-receipt replay remain an
explicit gate: the existing entity insertion path must write validated original
components under the same admission/owner transaction after every remaining
consumer is converted or refused and owning proof is accepted. Existing legacy
IDs and public operations retain their current behavior. Sensitive admission,
live migration, global rehash and identifier-changing corrections are unavailable.

The multi-signal MCP resolver propagates the shared exact-identity refusal;
unsupported namespaces do not become an empty ranked result. The declared HTTP
signal route remains a separate existing parity gate. Other inventoried writers,
imports and lifecycle operations still require conversion or pre-effect refusal
before exact activation.
The private original-component column is outside fields-column encryption;
no sensitive-profile or encrypted-at-rest coverage is claimed for it.

Correction, merge and split remain unsupported for reserved exact namespaces.
Their refusal uses retained registry authority and physical owned target types,
including an explicit split target whose request declares an ordinary type.
Retained physical targets are checked before correction and split receipt replay. Multi-entity
corrections preflight every target before their first field write. Ordinary
operations retain their established mutation and replay behavior. Negative
restored-state fixtures do not establish a supported exact persistence path.

A non-NULL physical `identity_record` also refuses these mutations when an
unsupported restored row carries an ordinary type. This is a presence-based
refusal, not validation or admission of that record. Mutation preflight selects
the private column directly with the owned physical entity row; ordinary public
adapter projections cannot supply this authority metadata.
