# Subsystem: agent_session

Runtime and resume record for a coding-agent session, across harnesses (Claude Code, Codex, Cursor) and across devices. An `agent_session` captures where a session's transcript lives, the git environment needed to reconstruct it, and (for autonomous swarm runs) the trigger and AAuth attribution. It is the resume-oriented sibling of the semantic `conversation`: `conversation` answers "what was discussed", `agent_session` answers "where is the transcript and how do I resume it".

Neotoma owns the State Layer parts of this subsystem (the entity types, deterministic capture, durable transcript storage). The resume orchestration (materialize transcript, fetch git, recreate worktree, launch or re-dispatch) is Operational Layer work and lives in ateles, not here.

## Entity model

### `agent_session` (`category: agent_runtime`)

- **Identity**: joint `canonical_name_fields: ["harness", "native_session_id"]` with `name_collision_policy: "reject"`. A native session id is only unique within its harness.
- **`kind`**: `interactive` | `autonomous` | `subagent`.
- **Runtime / git fields**: `cwd`, `repo`, `repo_remote_url`, `source_branch`, `branch`, `git_head_sha`, `worktree_path`, `origin_device`, `parent_session_id`. Paths and host are context only and are excluded from identity because they move and embed usernames.
- **Activity**: `title`, `summary`, `model`, `status`, `message_count`, `created_at`, `last_activity_at`.
- **Per-device app state**: `is_archived`, `auto_archive_exempt`, `is_pinned`, `is_bridged`, `bridge_session_ids`.
- **Autonomous trigger and attribution block**: `trigger_kind`, `trigger_ref`, `dispatch_parent`, `aauth_sub`, `workflow_definition_ref`, `gate_name`. These are denormalized for discovery and filtering; the authoritative record stays in the linked orchestration entities (see below).
- **`resume_command`**: literal harness-specific command to resume.

### `session_transcript` (`category: agent_runtime`)

The raw, lossless transcript artifact. Specialized asset type, modeled like `image_asset` and `audio_asset`: content-addressed bytes in the `sources` bucket at `{user_id}/{content_hash}`, surfaced via `retrieve_file_url`.

- **Identity**: `canonical_name_fields: ["content_hash"]` (SHA-256 of the transcript bytes).
- **Fields**: `source_id`, `mime_type`, `file_size`, `storage_url`, `harness`, `format` (`claude_code_jsonl` | `codex_rollout` | `cursor_sqlite`), `format_version`, `turn_count`, `transcript_kind` (`main` | `subagent`), `agent_session_id`.

The raw transcript is the byte-exact resume artifact and the durable backup. The structured turns of the same session live separately in `conversation_message`. The two fidelities are complementary, not alternatives.

## Relationship to existing entities

`agent_session` links, it does not duplicate.

- `agent_session` is `PART_OF` linked from a `conversation` (the semantic record already carries `session_id`, `client_name`/`harness`, and `repository_*`).
- `agent_session` relates to its `session_transcript` (raw bytes) and to the `conversation_message` rows (structured turns).
- For autonomous swarm runs, `agent_session` relates to the existing ateles orchestration entities rather than re-deriving them: `harness_event` (lifecycle plus `agent_sub` AAuth identity and `task_entity_id`), `participation_record` (gate dispatch and satisfaction), and the `agent_task` to `agent_attempt` to `agent_outcome` chain. The `agent_attempt` type already claims the alias `agent_run`, so `agent_session` deliberately does not introduce a competing run type; it is the per-session unifying record that the orchestration entities lacked.

## Deterministic capture

Capture does not depend on the model calling the MCP `store` tool. Neotoma already runs deterministic harness hooks (`claude-code-plugin`, `cursor-hooks`, `codex-hooks`, `opencode-plugin`, `claude-agent-sdk-adapter`) that record structured turns. This subsystem extends that path with:

1. A raw-transcript tail in the Stop and SessionEnd hooks that reads transcript lines appended since a per-session offset cursor and appends the delta to a durable local queue, then exits fast with no synchronous Neotoma call.
2. An async drainer that ships queued deltas to Neotoma: `storeRawContent` for the `session_transcript` blob plus the structured `conversation_message` rows. Idempotent via the JSONL `uuid` and `parentUuid` natural keys plus the offset cursor.
3. A filesystem-watcher backstop for sessions whose harness has no hooks installed, or that die before Stop fires.

A backfill scanner provides historical coverage and repair. The scanner reads `cwd` and `gitBranch` from the message lines of the transcript, not from line one (line one is a hook or summary event without `cwd`). Validation across 1288 desktop sessions showed reading only line one left `cwd` null on 91 percent of sessions; reading the message lines raised resolution to 99.5 percent.

## Autonomous and swarm sessions

The ateles swarm runs T2, T3, and T4 agents headlessly through `claude --print` subprocesses, with no interactive UI harness. These are still Claude Code sessions: they write standard JSONL transcripts under `~/.claude/projects` and fire the same hooks, because the daemon sets no `CLAUDE_CONFIG_DIR` override.

Empirical hook firing under `--print` (60 sampled swarm sessions): `SessionStart` 60 of 60, `PostToolUse` 60 of 60, `Stop` 59 of 60 (the miss was a run killed mid-execution), `PreCompact` 1 of 60 (only on compaction), `UserPromptSubmit` 15 of 60. `UserPromptSubmit` is unreliable headlessly because the prompt is piped rather than interactively submitted, so capture reads the prompt and turns from the transcript, not from that hook. The roughly 2 percent of runs that die before `Stop`, plus daemon timeouts, are covered by the watcher and scanner backstops.

Sub-agent runs spawned by the Task tool write their own nested `~/.claude/projects/<session>/subagents/*.jsonl` transcripts. These are modeled as child `agent_session` rows with `kind: subagent` and `parent_session_id` set, each with its own `session_transcript`.

## Layer boundaries and invariants

- State Layer only. No resume orchestration, dispatch logic, or scheduled runs live in Neotoma. Resume and re-dispatch live in ateles.
- Immutability. The drainer writes via observations; corrections create new observations. Content-addressed transcript storage makes re-ingest of identical bytes a no-op.
- Determinism. Entity and event ids are reproducible; the offset cursor and content hash make capture idempotent.
- Schema-first. Behavior that varies by type is declared on the schema, not branched in code.

## Resume fidelity ladder (ateles, Operational Layer)

The `/resume-session` flow auto-selects the highest available tier; `--mode` can force one.

1. **Native**: materialize the transcript from the `session_transcript` blob (or a reachable peer device), then `claude --resume` or `codex resume`. Exact fidelity, same session id.
2. **Context injection**: start a fresh session in any harness and inject a reconstructed context block (summary plus the last N turns verbatim plus key entities), restoring model and effort from the `agent_session`. Portable, new session id.
3. **Re-dispatch** (autonomous): re-fire the trigger or re-run the skill with the same task entity. Used for swarm runs, which have no UI to reopen. Builds on the existing ateles idempotent re-dispatch and gate-state recovery.

Cross-harness transcript translation is intentionally not built.
