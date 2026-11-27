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
- If **both** the file and the canonical entity changed, the push reports a conflict instead of overwriting. Setting the file to the value you want and pushing again does not resolve it. To keep your edit, copy the changed values aside, delete the file, run `neotoma mirror rebuild --profile <profile>`, re-apply the values to the regenerated file, then run `neotoma mirror push <profile>`. To use the database value, delete the file, then run `neotoma mirror rebuild --profile <profile>`.
- A field whose database value moved while the file kept its old value is left alone. The push does not write the old value back.
- A file the manifest (`.neotoma-mirror-manifest.json`) lists, whose content still matches the hash recorded there, holds no edit of yours. `mirror push` applies nothing for it and reports no conflict, with or without a base, even when its values are older than the database.
- A file the mirror did not record as its own in the manifest is never refreshed by `mirror rebuild` until you delete it. Such a file can be an outdated copy written before the manifest existed. When it also has no last-synced base, `mirror push` does not apply it: it reports each differing field as needing a resolution, records no base, and changes nothing. `--check` reports the same file the same way. Setting the file to the value you want and pushing again does not resolve it. To keep an edit in it, use the same steps as for a conflict: copy the changed values aside, delete the file, rebuild, re-apply them, push. Otherwise delete the file, then run `neotoma mirror rebuild --profile <profile>` to get the current version.

The base only records values the database holds. After a push, a field's base takes the file's value only when the database already holds it or its correction succeeded; every other field keeps its previous base. A correction that failed is retried by the next push while the database value has not moved, and no other field is applied because of it.

`--check` previews exactly what would be applied before you commit. Write-back never deletes.

## See also

- Design and discussion: [neotoma#1776](https://github.com/markmhendrickson/neotoma/issues/1776)
- [Neotoma CLI reference](./cli_reference.md)
