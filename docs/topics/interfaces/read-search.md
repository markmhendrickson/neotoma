# Find and read a record

Start with the identity and type of the thing you need, then inspect the current value and its evidence.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Narrow the question

If you have a returned entity ID, retrieve that exact entity first. If you have a stable identifier, use identifier retrieval. For a category question, search with an entity type and bounded result count. A broad text query is useful for discovery, but matching words do not establish that two hits are the same entity.

| What you know                                   | Good first read                                 | Check next                              |
| ----------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| Exact entity ID                                 | Entity snapshot or `entities get`               | Type, fields, and observation context   |
| An identifier                                   | Identifier retrieval or `entities search`       | Which entity the identifier resolved to |
| A type and a few fields                         | Filtered entity query or `entities list --type` | User scope and pagination               |
| A person or organization described several ways | Multi-signal identification                     | Candidate identities before a write     |

For terminal work, `neotoma schemas list` and `neotoma entities list --type task --limit 5` illustrate the read shape without changing data. The type must exist in the selected instance. For HTTP clients, [OpenAPI](../../../openapi.yaml) defines `POST /entities/query` and the snapshot routes. MCP clients expose retrieval tools on the configured instance. [Interfaces](https://neotoma.io/interfaces/) helps choose a client path.

## Verify an empty result

A zero can mean the query used the wrong type or field, the instance or user scope is different, a page of results was missed, or there is genuinely no match. Before reporting absence, read an entity known to exist through the same connection. Then inspect the schema and broaden the query carefully. A known-positive result validates the path; it does not prove every possible search mode is complete.

When text search follows a recent write, use the exact returned entity ID for read-back. A search index may lag the write path; the entity snapshot is the right place to verify the immediate result. [The search subsystem reference](../../subsystems/search/search.md) explains indexing and filters.

## Read beyond the answer

The snapshot is the current view, not the full chain of claims. For a disputed value, list its observations and inspect field provenance. A source-backed observation may point to a file and interpretation; a direct fact may have no separate file. [Inspect a change](https://neotoma.io/history/) gives the comparison path, and [Sources and provenance](https://neotoma.io/provenance/) explains what the trace can establish.
