# Export and back up your record

Choose an export for portable current fields, or a verified backup when recovery needs the database and source files.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Choose what must survive

`neotoma entities export --out records.jsonl` writes an import-compatible JSONL file of entity types and current snapshot fields. `--with-relationships` adds a companion file of typed edges. This is useful for moving the current structured view into another instance or checking that data can leave Neotoma. It includes only fields declared by each entity's active schema. It is not a complete archive of every observation, source byte, interpretation, or log entry.

`neotoma memory-export` has a different purpose: it writes a bounded Markdown summary for tools that consume file-based memory. Its line and field limits can omit or shorten records. Do not treat that file as a restore source. The [exit and rebuild protocol](../../developer/exit_rebuild_test.md) explains how to test a structured export against a fresh instance and compare what came back.

## Preserve a recoverable copy

`neotoma backup create` packages the local database, sources, and logs into a timestamped directory with a manifest. Run `neotoma backup verify` against that directory before relying on it. Store the backup separately from the live data directory and protect it under the same access expectations as the original record. If encryption is enabled, retain the required key material separately; encrypted bytes without the key cannot restore readable data.

```bash
neotoma backup create --output ./backups
neotoma backup verify ./backups/SELECTED_BACKUP_DIRECTORY
```

The second command needs the actual timestamped directory returned by the first. Verification checks the backup artifact; a recovery drill against a separate data directory is stronger evidence that restore works. The [backup and restore reference](../../developer/cli_reference.md#backup-and-restore) documents the restore command and contents.

## Check the boundary

A current-field export and a full backup solve different problems. Record which one you made, when, from which instance, and what its verification established. A backup can contain sensitive source material even if an exported snapshot looks narrow. [Privacy and local control](https://neotoma.io/local-first/) covers the input and instance choices, and [Limits to check](https://neotoma.io/limitations/) helps keep recovery claims bounded.
