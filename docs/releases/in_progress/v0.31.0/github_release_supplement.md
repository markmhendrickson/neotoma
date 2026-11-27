Neotoma v0.31.0 includes a correctness fix: `neotoma mirror rebuild --clean` now deletes only files the mirror generated (#2939).

## What changed for npm package users

- `neotoma mirror rebuild --clean` removes a file only when all of these hold: the output root's ownership manifest (`.neotoma-mirror-manifest.json`) lists it, it is a Markdown output file with no dot-prefixed path segment, it is inside the requested scope, no scope of this rebuild generated it, its content still matches the hash the manifest recorded, and no part of its path is a symbolic link. It removes only folders the mirror created and that are left empty. Before, `--clean` deleted every Markdown file under the output path that the run did not write, including files it never created, recursed into subfolders, removed folders it emptied and walked a symlinked root (#2939).
- A generated file that was edited since the mirror wrote it is kept and listed in the report.
- A symlinked output root refuses `--clean`, and the report says why.
- With no manifest, or an invalid or unreadable one, `--clean` deletes nothing from that output root and the report says so. Manifests are written only in output roots the run writes to, removes from or cleans, and a manifest that cannot be read or saved is reported without failing the write, removal or rebuild.
- The rebuild report lists the Markdown files under a cleaned folder that were left in place because the manifest does not record them, with one line: delete outdated ones by hand before running `mirror push`.
- Writing is unchanged. Rebuilds and incremental writes still overwrite a same-name file as before, and incremental removals behave as before. The mirror now also records each file it writes, with its content hash, and each folder it creates, in the manifest of that output root. `--clean` on a profile output folder works within that folder's manifest.

## Upgrade notes

- **Session index at the start of MCP instructions.**
  - Who: MCP clients and agents of an instance that has standing rules or graph-stored skills, especially clients that truncate long `instructions`.
  - Before: the full `[STANDING RULES]` block (up to 24,000 bytes) led the instructions and the `[INSTANCE SKILLS]` catalog came after the base block of over 100KB, so a client that cut the instructions early lost later rules and every skill.
  - After: the instructions open with a `[SESSION INDEX]` block of at most 2,048 bytes, closed by `[END SESSION INDEX]`, listing every rule title with its entity id and the instance skill names, with an explicit count and fetch hint for anything it cannot list. The full rules follow, then the skills catalog, then the base block and the policy. Session `initialize`, `server/discover`, `GET /mcp-interaction-instructions` and `neotoma instructions print` compose through one shared function. Instances with no rules and no skills serve unchanged text.
  - Migration: none. A client that checked that instructions start with `[STANDING RULES]` should skip the leading `[SESSION INDEX]` block first.

## Breaking changes

- **`mirror rebuild --clean` removes less than before.**
  - **Who:** anyone who runs `neotoma mirror rebuild --clean` on a mirror or a profile output folder.
  - **Before:** `--clean` deleted any Markdown file the run did not write.
  - **After:** `--clean` deletes only files the manifest records. The first `--clean` after upgrading removes nothing and writes the manifest. Files written before the upgrade are not recorded, so they are never removed automatically, even when outdated.
  - **Migration:** read the list of files left in place in the rebuild report. Delete the outdated ones by hand, one file at a time. Never delete the whole folder, because it can hold your own files. Do this before using `mirror push`. If the mirror folder is in git, commit `.neotoma-mirror-manifest.json` with the mirror files; if you ignore it instead, a fresh checkout has no manifest and its first `--clean` removes nothing.
