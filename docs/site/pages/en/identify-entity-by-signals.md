---
path: /identify-entity-by-signals
locale: en
page_title: Identity resolver
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 30
---

`identify_entity_by_signals` resolves "is this the same entity I already have?" in a single MCP call. Pass a bundle of identity signals — name, email, company, domain, phone, or any open-ended string properties — and get back a scored best match, ranked candidates, and a resolution band that tells you exactly what action to take next.

This is the recommended replacement for chaining `retrieve_entity_by_identifier` → `list_potential_duplicates` → `retrieve_entity_snapshot` when you want confidence scoring and disambiguation in one round-trip.

## When to use it

Use `identify_entity_by_signals` when you have **partial or combined** identity information about an entity and want to determine whether it already exists in the graph before creating a new record. Typical cases:

- Ingesting a contact from an email header (name + email address)
- Matching a company name from a document against your existing company entities
- Deduplicating a CRM import where multiple signals may be available but no single field is guaranteed to match

For direct lookups where you hold an exact identifier (entity ID, unique email, canonical key), `retrieve_entity_by_identifier` is faster. Reserve `identify_entity_by_signals` for the fuzzy/multi-signal case.

## Signal bundle

The `signals` object accepts five well-known keys and any number of open-ended string keys:

| Signal key | Weight | Notes |
|---|---|---|
| `email` | 1.0 | Highest confidence; direct match against indexed identifiers |
| `phone` | 0.9 | Normalized before lookup |
| `name` | 0.7 | Full name or display name |
| `domain` | 0.6 | Website domain (e.g. `example.com`) |
| `company` | 0.5 | Organisation or company name |
| *(any other key)* | 0.4 | Open-ended string signal |

All keys are optional strings. Supply as many as you have — the scorer normalizes weights over the supplied signals so the maximum score is always 1.0, plus a corroboration bonus of +0.05 per additional agreeing signal (capped at +0.15).

## Resolution bands

The response always includes a `resolution_band`:

| Band | Score range | Recommended action |
|---|---|---|
| `high` | ≥ 0.85 | Auto-merge or treat as the same entity with high confidence |
| `medium` | ≥ 0.55 | Surface `candidates` for human disambiguation |
| `low` | ≥ 0.30 | Likely a different entity; review before merging |
| `unresolved` | < 0.30 | No match found; safe to create a new entity |

Semantic-only matches (no direct or snapshot-field hit) are capped at `medium` regardless of their computed score.

`best_match` is `null` when `resolution_band` is `unresolved` — the resolver never invents an entity ID.

## Example call

Resolve a contact arriving from an email import:

```json
{
  "signals": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "company": "Acme Corp"
  },
  "entity_type": "contact",
  "max_candidates": 3
}
```

Example response (high-confidence match):

```json
{
  "best_match": {
    "entity_id": "ent_abc123",
    "identity_score": 0.9200,
    "matched_signals": ["email", "name"],
    "match_modes": ["direct", "snapshot_field"],
    "band": "high",
    "snapshot": { "name": "Jane Smith", "email": "jane@example.com" }
  },
  "candidates": [],
  "resolution_band": "high",
  "match_modes": ["direct", "snapshot_field"],
  "scoped_entity_types": ["contact"]
}
```

## Entity type scoping

If `entity_type` or `entity_types` is omitted, the resolver uses schema `query_synonyms` to infer candidate types from the signal values. For example, a `domain` signal widens the search to `company` and `organisation` types automatically. Explicit type scoping narrows the search and is faster for callers that know the type.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `signals` | object | required | Identity signal bundle (see above) |
| `entity_type` | string | — | Restrict to this entity type (takes precedence over `entity_types`) |
| `entity_types` | string[] | — | Restrict to these entity types |
| `max_candidates` | integer 1–20 | 5 | How many ranked candidates to return (best_match excluded) |
| `include_observations` | boolean | false | Attach recent observations to best_match and each candidate |

## Response fields

| Field | Description |
|---|---|
| `best_match` | Top-scoring entity, or `null` when unresolved |
| `best_match.entity_id` | The matched entity's ID — never invented |
| `best_match.identity_score` | Normalised weighted score in [0, 1], rounded to 4 decimal places |
| `best_match.matched_signals` | Input signal keys that contributed to this match |
| `best_match.match_modes` | Resolution passes used: `direct`, `snapshot_field`, `semantic`, `none` |
| `best_match.band` | Per-candidate resolution band |
| `best_match.snapshot` | Medium-density snapshot for the entity |
| `candidates` | Remaining candidates ranked by score desc, entity_id asc |
| `resolution_band` | Resolution band of `best_match` (or `"unresolved"` when null) |
| `match_modes` | Union of match modes across all signal lookups |
| `scoped_entity_types` | Entity types actually searched (may be wider than caller input) |

Shipped in v0.17.0 (PRs #1603, #1670). See the [changelog](/changelog) for release notes, and [capability delta](/capability-delta) for a machine-readable list of all tools added or removed in a given release.
