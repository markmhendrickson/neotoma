Neotoma v0.31.0 includes a correctness fix: `neotoma mirror rebuild --clean` now deletes only files the mirror generated (#2939).

## What changed for npm package users

- `neotoma mirror rebuild --clean` removes a file only when all of these hold: the output root's ownership manifest (`.neotoma-mirror-manifest.json`) lists it, it is inside the requested scope, this rebuild did not generate it, its content still matches the hash the manifest recorded, and no part of its path is a symbolic link. It removes only folders the mirror created and that are left empty. Before, `--clean` deleted every Markdown file under the output path that the run did not write, including files it never created, recursed into subfolders, removed folders it emptied and walked a symlinked root (#2939).
- A generated file that was edited since the mirror wrote it is kept and listed in the report.
- A symlinked output root refuses `--clean`, and the report says why.
- With no manifest, or an invalid one, `--clean` deletes nothing and the report says so.
- The rebuild report lists the Markdown files under a cleaned folder that were left in place because the manifest does not record them, with one line: delete outdated ones by hand before running `mirror push`.
- Writing is unchanged. Rebuilds and incremental writes still overwrite a same-name file as before, and incremental removals behave as before. The mirror now also records each file it writes, with its content hash, and each folder it creates, in the manifest of that output root. `--clean` on a profile output folder works within that folder's manifest.

## Breaking changes

- **`mirror rebuild --clean` removes less than before.**
  - **Who:** anyone who runs `neotoma mirror rebuild --clean` on a mirror or a profile output folder.
  - **Before:** `--clean` deleted any Markdown file the run did not write.
  - **After:** `--clean` deletes only files the manifest records. The first `--clean` after upgrading removes nothing and writes the manifest. Files written before the upgrade are not recorded, so they are never removed automatically, even when outdated.
  - **Migration:** read the list of files left in place in the rebuild report. Delete the outdated ones by hand, one file at a time. Never delete the whole folder, because it can hold your own files. Do this before using `mirror push`. If the mirror folder is in git, commit `.neotoma-mirror-manifest.json` with the mirror files; if you ignore it instead, a fresh checkout has no manifest and its first `--clean` removes nothing.
