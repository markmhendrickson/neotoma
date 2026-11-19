# Trust and validity

Neotoma's useful guarantees concern recorded state, its sources, and the deterministic computation of the current view.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Check the actual effect

After a write, retrieve the entity and verify the specific field. A successful response does not establish that the intended field landed; undeclared fields can be kept as raw fragments. An empty query likewise needs a known-positive check before it is evidence of absence.

For a correction, inspect both the new current snapshot and the observation history. Earlier observations remain in the normal history path; a separate source exists only for source-backed observations. The current value changes through the reducer's configured field policy.

## Scope of the guarantee

Deterministic components produce the same result from the same inputs and configuration. AI interpretation of unstructured material can vary, so its output needs provenance and idempotent handling rather than a claim of byte-for-byte replay. Neotoma also does not verify that a supplied source is factually correct.

Continue with [How the record works](https://neotoma.io/architecture/), [Sources and provenance](https://neotoma.io/provenance/), and [Privacy and local control](https://neotoma.io/local-first/).

To preserve a copy, [choose between a current-field export and a recovery backup](export-backup.md). Their contents and verification steps differ.
