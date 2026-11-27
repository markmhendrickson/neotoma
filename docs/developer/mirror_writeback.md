# Mirror write-back (`neotoma mirror push`)

## Overview

Mirror profiles render Neotoma entities to on-disk markdown files (Neotoma → disk). By default this is one-way: if you edit a mirrored file directly, your changes are overwritten on the next render. **Write-back** lets those edits flow back into Neotoma as corrections.

## Enabling

Write-back is opt-in per profile:

```yaml
allow_disk_writeback: true
```

With the flag off (the default), mirrors stay one-way and safe.

## Pushing edits

```bash
neotoma mirror push <path|profile>        # apply on-disk edits as corrections
neotoma mirror push <path> --check        # dry-run: show the corrections, change nothing
```

`mirror push` parses the edited markdown back into the entity's **editable** fields and writes the changes as `correct()` observations — stamped `observation_source: "human"`, with the file path recorded as provenance. Generated or managed regions (frontmatter, "do not edit" headers) are ignored, so regenerated content never round-trips into the entity.

## Conflict handling

`mirror push` keeps a last-synced base for each mirrored file and does a 3-way comparison of `{base, on-disk, current canonical}`:

- If the canonical entity is **unchanged** since the base, your on-disk edits apply as corrections.
- If **both** the file and the canonical entity changed, the push reports a conflict instead of overwriting — resolve it explicitly. To keep your edit, set the file to the value you want and run `neotoma mirror push <profile>` again. To use the database value, delete the file, then run `neotoma mirror rebuild --profile <profile>`.
- A file the mirror did not record as its own in the output root's manifest (`.neotoma-mirror-manifest.json`) is never refreshed by `mirror rebuild` until you delete it. Such a file can be an outdated copy written before the manifest existed. When it also has no last-synced base, `mirror push` does not apply it: it reports each differing field as needing a resolution, records no base, and changes nothing. `--check` reports the same file the same way. Delete the file, then run `neotoma mirror rebuild --profile <profile>` to get the current version.

`--check` previews exactly what would be applied before you commit. Write-back never deletes.

## See also

- Design and discussion: [neotoma#1776](https://github.com/markmhendrickson/neotoma/issues/1776)
- [Neotoma CLI reference](./cli_reference.md)
