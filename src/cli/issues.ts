import type { NeotomaApiClient } from "../shared/api_client.js";
import { githubIssueThreadConversationId } from "../services/issues/github_issue_thread.js";
import { githubIssueBodyTurnKey, githubIssueCommentTurnKey } from "../services/issues/github_thread_keys.js";

/**
 * CLI implementation for `neotoma issues` commands.
 *
 * Subcommands:
 *   create  -- Create a new GitHub issue
 *   message -- Add a message to an existing issue
 *   list    -- List issues (with sync-if-stale)
 *   sync    -- Explicit full sync from GitHub
 *   config  -- View/set issues configuration
 *   auth    -- Trigger gh CLI auth flow
 *
 * GitHub operations are called directly through the service layer.
 * Neotoma storage goes through the HTTP API's /store endpoint.
 */

export interface IssuesCreateOpts {
  title: string;
  body: string;
  labels?: string;
  advisory?: boolean;
  json?: boolean;
}

export interface IssuesMessageOpts {
  body: string;
  json?: boolean;
}

export interface IssuesListOpts {
  status?: "open" | "closed" | "all";
  labels?: string;
  since?: string;
  noSync?: boolean;
  json?: boolean;
}

export interface IssuesSyncOpts {
  since?: string;
  state?: "open" | "closed" | "all";
  json?: boolean;
}

export interface IssuesConfigOpts {
  repo?: string;
  mode?: "proactive" | "consent" | "off";
  json?: boolean;
}

function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else if (typeof data === "string") {
    process.stdout.write(data + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

export async function issuesCreate(opts: IssuesCreateOpts, api: NeotomaApiClient): Promise<void> {
  const { createIssue, mergeNeotomaToolingIssueLabels } = await import("../services/issues/github_client.js");
  const { loadIssuesConfig } = await import("../services/issues/config.js");

  const config = await loadIssuesConfig();
  const parsedLabels = opts.labels ? opts.labels.split(",").map((l) => l.trim()) : undefined;
  const labels = mergeNeotomaToolingIssueLabels(parsedLabels);
  const now = new Date().toISOString();

  let githubIssue: { number: number; html_url: string; user?: { login: string } | null; created_at: string } | null = null;
  let pushedToGithub = false;

  try {
    githubIssue = await createIssue({
      title: opts.title,
      body: opts.body,
      labels,
    });
    pushedToGithub = true;
  } catch (err) {
    process.stderr.write(`Warning: GitHub push failed: ${(err as Error).message}\n`);
  }

  const issueNumber = githubIssue?.number ?? 0;
  const githubUrl = githubIssue?.html_url ?? "";
  const author = githubIssue?.user?.login ?? "local";
  const threadConversationId = githubIssueThreadConversationId(config.repo, issueNumber);

  const { data, error } = await api.POST("/store", {
    body: {
      entities: [
        {
          entity_type: "issue",
          title: opts.title,
          body: opts.body,
          status: "open",
          labels,
          github_number: issueNumber,
          github_url: githubUrl,
          repo: config.repo,
          visibility: opts.advisory ? "advisory" : "public",
          author,
          created_at: githubIssue?.created_at ?? now,
          closed_at: null,
          last_synced_at: pushedToGithub ? now : null,
          sync_pending: !pushedToGithub,
          data_source: `github issues api ${config.repo} #${issueNumber} ${now.slice(0, 10)}`,
        },
        {
          entity_type: "conversation",
          title: `Issue #${issueNumber || "pending"}: ${opts.title}`,
          thread_kind: "multi_party",
          ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
        },
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "user",
          content: opts.body,
          author,
          github_comment_id: issueNumber ? `issue-body-${issueNumber}` : null,
          turn_key: issueNumber
            ? githubIssueBodyTurnKey(config.repo, issueNumber)
            : `github:${config.repo.trim()}#pending:issue-body`,
          created_at: githubIssue?.created_at ?? now,
        },
      ],
      relationships: [
        { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
        { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
      ],
      idempotency_key: `issue-create-${config.repo}-${issueNumber || Date.now()}`,
    },
  }) as { data?: { structured?: { entities?: Array<{ entity_id: string }> } }; error?: unknown };

  if (error) {
    process.stderr.write(`Store error: ${JSON.stringify(error)}\n`);
  }

  const entityId = (data as any)?.structured?.entities?.[0]?.entity_id ?? "";

  if (opts.json) {
    output({ issue_number: issueNumber, github_url: githubUrl, entity_id: entityId, pushed_to_github: pushedToGithub }, true);
  } else {
    if (pushedToGithub) {
      process.stdout.write(`Created issue #${issueNumber}: ${githubUrl}\n`);
    } else {
      process.stdout.write(`Issue stored locally (GitHub push pending). Entity: ${entityId}\n`);
    }
  }
}

export async function issuesMessage(
  issueNumber: number,
  opts: IssuesMessageOpts,
  api: NeotomaApiClient,
): Promise<void> {
  const { addIssueComment } = await import("../services/issues/github_client.js");

  let githubComment: { id: number; user?: { login: string } | null; created_at: string } | null = null;
  let pushedToGithub = false;

  try {
    githubComment = await addIssueComment(issueNumber, opts.body);
    pushedToGithub = true;
  } catch (err) {
    process.stderr.write(`Warning: GitHub push failed: ${(err as Error).message}\n`);
  }

  const now = new Date().toISOString();
  const author = githubComment?.user?.login ?? "local";
  const { loadIssuesConfig } = await import("../services/issues/config.js");
  const config = await loadIssuesConfig();
  const commentKey = githubComment ? String(githubComment.id) : `local-${Date.now()}`;
  const threadConversationId = githubIssueThreadConversationId(config.repo, issueNumber);

  await api.POST("/store", {
    body: {
      entities: [
        {
          entity_type: "conversation",
          title: `Issue #${issueNumber}`,
          thread_kind: "multi_party",
          ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
        },
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "user",
          content: opts.body,
          author,
          github_comment_id: commentKey,
          turn_key: githubIssueCommentTurnKey(config.repo, issueNumber, commentKey),
          created_at: githubComment?.created_at ?? now,
        },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
      ],
      idempotency_key: `issue-message-${config.repo}-${issueNumber}-${commentKey}`,
    },
  });

  if (opts.json) {
    output({ pushed_to_github: pushedToGithub, github_comment_id: githubComment?.id ?? null }, true);
  } else {
    if (pushedToGithub) {
      process.stdout.write(`Message added to issue #${issueNumber}\n`);
    } else {
      process.stdout.write(`Message stored locally (GitHub push pending)\n`);
    }
  }
}

export async function issuesList(opts: IssuesListOpts, api: NeotomaApiClient): Promise<void> {
  const { listIssues } = await import("../services/issues/github_client.js");

  if (!opts.noSync) {
    try {
      const ghIssues = await listIssues({
        state: opts.status ?? "open",
        labels: opts.labels ? opts.labels.split(",").map((l) => l.trim()) : undefined,
        since: opts.since,
      });
      // Display directly from GitHub
      if (opts.json) {
        output(ghIssues.map((i) => ({
          number: i.number,
          title: i.title,
          status: i.state,
          labels: i.labels.map((l) => l.name),
          author: i.user?.login ?? "unknown",
          url: i.html_url,
        })), true);
      } else {
        if (ghIssues.length === 0) {
          process.stdout.write("No issues found.\n");
          return;
        }
        for (const issue of ghIssues) {
          const labelStr = issue.labels.length
            ? ` [${issue.labels.map((l) => l.name).join(", ")}]`
            : "";
          process.stdout.write(
            `#${issue.number} [${issue.state}] ${issue.title}${labelStr}\n`,
          );
        }
      }
      return;
    } catch (err) {
      process.stderr.write(
        `Warning: sync from GitHub failed, showing local data: ${(err as Error).message}\n`,
      );
    }
  }

  // Fallback: show from local store
  await api.POST("/store", {
    body: { entities: [] },
  });
  process.stdout.write(`Use --no-sync to view cached local data only.\n`);
}

export async function issuesSync(opts: IssuesSyncOpts, api: NeotomaApiClient): Promise<void> {
  const { listIssues, listIssueComments } = await import("../services/issues/github_client.js");
  const { loadIssuesConfig } = await import("../services/issues/config.js");

  const config = await loadIssuesConfig();
  const now = new Date().toISOString();
  let issuesSynced = 0;
  let messagesSynced = 0;
  const errors: string[] = [];

  let ghIssues: Array<{ number: number; title: string; body: string | null; state: string; labels: Array<{ name: string }>; html_url: string; user: { login: string } | null; created_at: string; closed_at: string | null; updated_at: string }>;
  try {
    ghIssues = await listIssues({
      state: opts.state ?? "all",
      since: opts.since,
    });
  } catch (err) {
    errors.push(`Failed to list issues: ${(err as Error).message}`);
    if (opts.json) {
      output({ issues_synced: 0, messages_synced: 0, errors }, true);
    } else {
      process.stderr.write(`Sync failed: ${(err as Error).message}\n`);
    }
    return;
  }

  for (const issue of ghIssues) {
    try {
      const threadConversationId = githubIssueThreadConversationId(config.repo, issue.number);
      await api.POST("/store", {
        body: {
          entities: [
            {
              entity_type: "issue",
              title: issue.title,
              body: issue.body ?? "",
              status: issue.state,
              labels: issue.labels.map((l) => l.name),
              github_number: issue.number,
              github_url: issue.html_url,
              repo: config.repo,
              visibility: "public",
              author: issue.user?.login ?? "unknown",
              created_at: issue.created_at,
              closed_at: issue.closed_at,
              last_synced_at: now,
              sync_pending: false,
              data_source: `github issues api ${config.repo} #${issue.number} ${now.slice(0, 10)}`,
            },
            {
              entity_type: "conversation",
              title: `Issue #${issue.number}: ${issue.title}`,
              thread_kind: "multi_party",
              ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
            },
            {
              entity_type: "conversation_message",
              role: "user",
              sender_kind: "user",
              content: issue.body ?? "",
              author: issue.user?.login ?? "unknown",
              github_comment_id: `issue-body-${issue.number}`,
              turn_key: githubIssueBodyTurnKey(config.repo, issue.number),
              created_at: issue.created_at,
            },
          ],
          relationships: [
            { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
            { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
          ],
          idempotency_key: `issue-sync-${config.repo}-${issue.number}`,
        },
      });
      issuesSynced++;

      const comments = await listIssueComments(issue.number);
      for (const comment of comments) {
        // Same graph shape as the issue row above: issue → conversation (REFERS_TO),
        // message → conversation (PART_OF). Resolver merges issue + conversation so
        // each comment attaches to the shared thread instead of a one-off conversation.
        await api.POST("/store", {
          body: {
            entities: [
              {
                entity_type: "issue",
                title: issue.title,
                body: issue.body ?? "",
                status: issue.state,
                labels: issue.labels.map((l) => l.name),
                github_number: issue.number,
                github_url: issue.html_url,
                repo: config.repo,
                visibility: "public",
                author: issue.user?.login ?? "unknown",
                created_at: issue.created_at,
                closed_at: issue.closed_at,
                last_synced_at: now,
                sync_pending: false,
                data_source: `github issues api ${config.repo} #${issue.number} ${now.slice(0, 10)}`,
              },
              {
                entity_type: "conversation",
                title: `Issue #${issue.number}: ${issue.title}`,
                thread_kind: "multi_party",
                ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
              },
              {
                entity_type: "conversation_message",
                role: "user",
                sender_kind: "user",
                content: comment.body,
                author: comment.user?.login ?? "unknown",
                github_comment_id: String(comment.id),
                turn_key: githubIssueCommentTurnKey(config.repo, issue.number, String(comment.id)),
                created_at: comment.created_at,
              },
            ],
            relationships: [
              { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
              { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
            ],
            idempotency_key: `issue-comment-sync-${config.repo}-${issue.number}-${comment.id}`,
          },
        });
        messagesSynced++;
      }
    } catch (err) {
      errors.push(`Issue #${issue.number}: ${(err as Error).message}`);
    }
  }

  if (opts.json) {
    output({ issues_synced: issuesSynced, messages_synced: messagesSynced, errors }, true);
  } else {
    process.stdout.write(
      `Synced ${issuesSynced} issues, ${messagesSynced} messages.\n`,
    );
    if (errors.length) {
      process.stderr.write(`Errors:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
    }
  }
}

export async function issuesConfig(opts: IssuesConfigOpts): Promise<void> {
  const { loadIssuesConfig, updateIssuesConfig } = await import("../services/issues/config.js");

  if (!opts.repo && !opts.mode) {
    const config = await loadIssuesConfig();
    if (opts.json) {
      output(config, true);
    } else {
      process.stdout.write(`Issues configuration:\n`);
      process.stdout.write(`  GitHub auth: ${config.github_auth}\n`);
      process.stdout.write(`  Repo: ${config.repo}\n`);
      process.stdout.write(`  Reporting mode: ${config.reporting_mode}\n`);
      process.stdout.write(`  Sync staleness: ${config.sync_staleness_ms}ms\n`);
      process.stdout.write(`  Configured at: ${config.configured_at ?? "not configured"}\n`);
    }
    return;
  }

  const updates: Record<string, unknown> = {};
  if (opts.repo) updates.repo = opts.repo;
  if (opts.mode) updates.reporting_mode = opts.mode;

  const updated = await updateIssuesConfig(updates as any);
  if (opts.json) {
    output(updated, true);
  } else {
    process.stdout.write(`Issues configuration updated.\n`);
  }
}

export async function issuesAuth(opts: { json?: boolean }): Promise<void> {
  const { isGhInstalled, isGhAuthenticated, verifyGhAuth } = await import(
    "../services/issues/gh_auth.js"
  );
  const { updateIssuesConfig } = await import("../services/issues/config.js");

  const installed = await isGhInstalled();
  if (!installed) {
    const msg = "GitHub CLI (gh) is not installed. Install it with: brew install gh";
    if (opts.json) {
      output({ error: msg, gh_installed: false }, true);
    } else {
      process.stderr.write(`${msg}\n`);
    }
    return;
  }

  const authenticated = await isGhAuthenticated();
  if (!authenticated) {
    const msg = "GitHub CLI is not authenticated. Run: gh auth login";
    if (opts.json) {
      output({ error: msg, gh_installed: true, gh_authenticated: false }, true);
    } else {
      process.stderr.write(`${msg}\n`);
    }
    return;
  }

  const user = await verifyGhAuth();
  if (!user) {
    const msg = "GitHub CLI auth verification failed. Try: gh auth login --refresh";
    if (opts.json) {
      output({ error: msg, gh_installed: true, gh_authenticated: true, verified: false }, true);
    } else {
      process.stderr.write(`${msg}\n`);
    }
    return;
  }

  await updateIssuesConfig({ github_auth: "gh_cli" });

  if (opts.json) {
    output({ ok: true, login: user.login, github_auth: "gh_cli" }, true);
  } else {
    process.stdout.write(`Authenticated as ${user.login} via gh CLI.\n`);
    process.stdout.write(`Issues auth method set to: gh_cli\n`);
  }
}
