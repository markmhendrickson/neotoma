# Transcript ingestion: session identity

`neotoma init --import-transcripts` discovers harness transcripts (Claude Code,
Codex, Cursor) and stores each raw file. Alongside the file it derives two
entity rows that record **which session the transcript is**, so a stored
transcript can later be located, verified, or re-materialized.

## Why `cwd` is load-bearing

Every harness scopes resume by working directory. Without `cwd` a stored
transcript is an opaque blob:

- **Cursor** keys its on-disk chat directory by `md5(cwd)`
  (`~/.cursor/chats/<md5(cwd)>/<chatId>/`). Resuming from a directory whose
  hash does not match returns an **empty thread rather than an error**.
- **Codex** filters its resume picker by `cwd` (`codex resume --all` disables
  the filter).
- **Claude Code** embeds `cwd` in most transcript records and derives the
  project directory name from it; a transcript moved to a different path needs
  those values rewritten.

`content_hash` (sha256 of the raw bytes) gives idempotent re-import: the same
transcript stores once no matter how often ingest runs.

## `agent_session`

One row per session. Uses the **existing** registered `agent_session` schema
(`canonical_name_fields: ["harness", "native_session_id"]`) — ingest populates a
subset of its declared fields and adds no new ones.

| Field                                                      | Source                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| `harness`                                                  | `claude-code` \| `codex` \| `cursor`     |
| `native_session_id`                                        | the id the harness itself resumes by     |
| `cwd`                                                      | working directory the session ran in     |
| `branch`                                                   | git branch at session time (claude-code) |
| `title`, `message_count`, `created_at`, `last_activity_at` | derived from the transcript              |

`native_session_id` is the **bare** id the harness expects. The Cursor parser
namespaces its ids internally as `cursor-<chatId>`; ingest strips that prefix,
because `cursor-agent --resume` wants the bare `chatId`.

Only harness sources emit this row. A ChatGPT or Slack export has no resumable
session, so none is written.

## `session_transcript`

One row per transcript file, content-addressed.

| Field                     | Source                                             |
| ------------------------- | -------------------------------------------------- |
| `content_hash`            | sha256 of the raw bytes (canonical name)           |
| `agent_session_id`        | the `native_session_id` above                      |
| `harness`, `format`       | `jsonl` for claude-code/codex, `sqlite` for cursor |
| `file_size`, `turn_count` | file metadata                                      |
| `storage_url`             | `file://` path at ingest time                      |

## Degraded imports

Derivation is best-effort: a parse failure must never block storing the raw
file, which remains the durable artifact. Degradation is **reported, not
swallowed** — `TranscriptImportResult.session_identity_degraded` lists
`{ file, reason }` for every file stored without identity, each is warned on
stderr, and a summary line names the count.

A degraded file is stored but **not resumable**. Re-running ingest after a
parser fix backfills it; `content_hash` prevents duplicate rows.

## Harness storage layouts

| Harness     | Transcript location                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/projects/<cwd-with-/-and-.-as->/<uuid>.jsonl` plus a sibling `<uuid>/` directory of large tool results |
| Codex       | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (live) and `~/.codex/archived_sessions/*.jsonl` (legacy) |
| Cursor      | `~/.cursor/chats/<md5(cwd)>/<chatId>/{store.db,meta.json}`                                                        |

Codex live rollouts encode user turns as `input_text` content blocks and
assistant turns as `output_text`; older archived sessions use plain `text`.
Cursor records `cwd` only in the sibling `meta.json`, never in `store.db`.
