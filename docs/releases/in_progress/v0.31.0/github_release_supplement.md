Neotoma v0.31.0 is a minor release. `neotoma mirror rebuild --clean` now deletes only files the mirror generated and the user has not edited (#2939).

## What changed for npm package users

- `neotoma mirror rebuild --clean` removes a file only when the output root's owned-paths manifest (`.neotoma-mirror-manifest.json`) lists it, this rebuild no longer generates it, and its content still matches what the mirror wrote. Foreign files, edited files and anything reached through a symlink are kept. A symlinked output root refuses `--clean`. Mirror writes no longer overwrite a same-name file the mirror did not create, including `index.md`. The rebuild report prints `removed`, `kept_edited`, `skipped_foreign` and `refused` counts (#2939).

## Breaking changes

- **`mirror rebuild --clean` on an existing mirror removes nothing the first time.**
  - **Who:** anyone with a markdown mirror (or mirror profile output folder) built by v0.30.0 or earlier.
  - **Before:** `--clean` deleted every `*.md` under the output path that the rebuild did not write, recursed into subfolders, removed folders it emptied, and followed a symlinked root. Rebuilds overwrote any same-name file.
  - **After:** without a manifest, `--clean` removes nothing and reports that cleanup needs a manifest; the rebuild writes the manifest. Files that exist at a generated path but differ from the generated content and are not in the manifest are not overwritten and are listed as `skipped_foreign`.
  - **Migration:** run `neotoma mirror rebuild --clean` once to write the manifest, then again to remove stale generated files. If the report lists `skipped_foreign` files that you know the mirror wrote earlier, delete them (or the whole mirror folder) and rebuild.
