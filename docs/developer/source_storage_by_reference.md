# Storing sources by reference

## Overview

By default, attaching a file to a `store` (or `parse_file`) call reads the bytes and persists them as a content-addressed blob inside Neotoma (`source_storage: "inline"`). For large files, or files that already live durably on disk — a PDF on your machine, a media archive — copying the bytes can bloat the database without adding value.

**By-reference source storage** registers a source by its path and content hash **without** copying its bytes. The source is still first-class in the graph; only the bytes stay on disk.

## Usage

Pass `source_storage: "reference"` on the store request (default is `"inline"`):

```jsonc
store({
  file_path: "/Users/you/Documents/contract.pdf",
  source_storage: "reference"
})
```

Neotoma reads the file once to compute its `content_hash` (SHA-256) and metadata (size, MIME type, mtime), then persists a `sources` row that records **where the bytes are**, not the bytes themselves.

## What gets stored

| | `inline` (default) | `reference` |
| --- | --- | --- |
| Bytes | copied into Neotoma | left on disk |
| `content_hash` | yes | yes |
| `path` / `host_id` | — | yes |
| Dedup + interpretation linkage | yes | yes |

Content-addressing, deduplication, and interpretation linkage all work identically — a reference source behaves like any other source.

## Retrieval

Fetching a reference source resolves its `path` at read time:

- **Present:** you get the path + metadata (and bytes on demand).
- **Moved or deleted:** the call returns a structured `SOURCE_UNAVAILABLE` (with the path + last-known hash), never a misleading empty blob.
- **Changed since registration:** a re-hash surfaces `SOURCE_REFERENCE_STALE`.

## Tradeoffs

Reference sources are **host-local**: availability depends on the file staying where it was registered, and they are not portable across machines. Use `inline` (the default) for anything that must be durable and portable inside Neotoma itself; use `reference` for large local files you want represented in the graph without the storage cost.

## See also

- Design and discussion: [neotoma#1775](https://github.com/markmhendrickson/neotoma/issues/1775)
- [What to store in Neotoma](../foundation/what_to_store.md)
