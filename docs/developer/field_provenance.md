# Field provenance

`retrieve_field_provenance` (MCP) and `POST /get_field_provenance` (HTTP) implement
one `getFieldProvenance` response declared in `openapi.yaml`.

`observation_ids`, `observations` and `sources` are the canonical complete chain.
Every contributor is returned, ordered by `observed_at` descending then ID
ascending. Each observation's `fields` contains only the requested field;
unrelated fields and internal operation receipts are withheld. Stored write
keys, source kinds and permitted attribution/data-origin metadata remain
available. Null metadata on an old row means unknown; it is not inferred to be
model-authored, human-authored or a correction, and is not a credibility score.

Sources are deduplicated and ordered by ID. Their projection contains ID,
MIME type, content hash, file size and creation time; filesystem/storage paths
and original filenames are excluded. Use the existing `retrieve_file_url`
operation for authorized file access. This read does not create a source for a
correction or manufacture `file_urls: []`.

The compatibility aliases `source_observation`, `source` and `observed_at`
select the most recent contributing observation and its source, or null when
that contributor has no source. They do not identify a single winner of a
merged field. `value` is the current snapshot value, independently of this
representative choice. HTTP now returns these declared aliases too.

A corrected field with a null `source_id` is a successful chain containing its
correction observation and an empty `sources` array. Any unresolved contributor
or non-null source refuses the whole chain with `PROVENANCE_INTEGRITY_ERROR`;
there is no silently incomplete 200 response. Query failures are
`DB_QUERY_FAILED`. Missing/foreign entities and missing visible fields share
`RESOURCE_NOT_FOUND`. HTTP and MCP use the same ErrorEnvelope; MCP carries it
in error `data`.

The existing authenticated owner resolution and guest admission are unchanged.
This operation remains member-only; it does not turn an entity guest token into
permission to read source records. Existing guest attribution/data-origin
redaction remains in place on guest-capable routes.

## Compatibility changes

Plural contributor data is added to MCP, and existing MCP aliases are added to
HTTP. HTTP's formerly raw observation/source rows are now declared projections:
only the requested field and permitted metadata are returned, with no raw
storage paths, unrelated fields or internal receipts. MCP's fabricated
`source.file_urls` key is removed. Dangling references that previously produced
partial HTTP responses now return a typed integrity error. Consumers should use
the plural arrays for complete evidence and the separate file URL operation for
file access.

Correction reasons/source creation, pre-marker correction recovery and domain
valid-time queries are separate features; this response contract implements
none of them.
