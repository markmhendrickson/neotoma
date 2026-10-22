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
