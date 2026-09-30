# `/status` to `/digest` migration

## Breaking change

`/status` is removed. It is not an alias for `/digest`, because the default behavior changed from a read-out to a state-changing workflow: `/digest` verifies the session, dispatches every agent-movable recommendation, and writes one `session_digest`. Keeping `/status` as a compatibility alias would let an old read-only-looking invocation acquire side effects silently.

Update every saved prompt, link, automation, runbook, and harness command according to the intended behavior:

| Previous intent | Replacement |
| --- | --- |
| Verified mid-session report plus proactive dispatch | `/digest` |
| Verified report with no dispatch and no writes | `/digest --report-only` |
| Cheap, unverified present-tense orientation | `/where` |
| Session close-out and persistence audit | `/end` |

Natural-language “where are we” requests route only to `/where`. Use “status report” or “what's done so far” when natural-language routing to `/digest` is intended.

## Installed mirrors

Package-managed whole-directory mirrors adopt the rename when the source directory updates. Per-skill mirrors prune a stale `skills/status` symlink only when it points into the package's published skills source; foreign files are preserved. If an older installation left a real `skills/status` directory, remove or migrate it explicitly after confirming it is the retired Neotoma skill, then run `neotoma skills sync` again. The sync must not delete an unrelated or user-authored directory merely because it is named `status`.

After migration, verify that the harness exposes `/digest`, `/where`, and `/end`, does not expose `/status`, and that `/digest --report-only` performs no writes or dispatches.
