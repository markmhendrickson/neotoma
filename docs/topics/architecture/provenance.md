# Sources and provenance

A current entity value is useful only when a reader can tell which recorded evidence supports it.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Follow a value backward

Start with the current entity snapshot. Inspect the observations for the field, including corrections, then inspect each observation's source and recorded context. A query result with no rows should be checked against a known positive case before concluding that the source is absent.

This path matters when two tools report different values. The current Neotoma snapshot settles agent-held state, while its observation history explains the transition. The source itself is not silently changed to make the latest answer look as though it had always been true.

For a source-backed interpretation, the trace can include the original material and the interpretation configuration. For a direct structured write or correction, there may be no separate source file. In that case, inspect the observation's attribution, timing and write context instead of promising a document that does not exist.

## Compare competing claims

When two observations disagree, identify the entity and field first. Then read the active schema's merge policy for that field. Recency, source priority, specificity and array merging answer different questions. The chosen snapshot field should have a provenance pointer to the observation selected by the policy. This is more useful than describing the last write as inherently correct.

If a correction appears to have done nothing, read the entity back and inspect the observation history. The intended key may be undeclared, the query may target another entity, or the policy may choose a different observation. Check a known-positive retrieval before concluding that there is no data. A successful correction response is only the beginning of the verification, not the end.

## What the trace can and cannot say

Provenance shows the recorded input and processing context. It does not make a false source fact true, nor does it make an AI interpretation perfectly reproducible. The [architecture reference](../../architecture/architecture.md) describes the observation and reducer model in detail. [How the record works](https://neotoma.io/architecture/) gives the short sequence.

An export of current entity fields is not necessarily an archive of every source, observation and configuration needed to restore the record. If preservation or recovery is the goal, use the documented backup path and verify its contents. For the present field view, continue to [Current snapshots](https://neotoma.io/current-snapshot/).
