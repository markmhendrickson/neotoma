import type { NeotomaApiClient } from "../shared/api_client.js";

/**
 * CLI implementation for `neotoma issues` commands.
 *
 * Subcommands:
 *   create  -- Submit issue (HTTP POST /issues/submit; same orchestration as MCP submit_issue)
 *   message -- Append thread message (POST /issues/add_message)
 *   status  -- Read issue + thread (POST /issues/status)
 *   list    -- List issues from GitHub (no MCP twin)
 *   sync    -- Mirror ingest (POST /issues/sync; same as MCP sync_issues)
 *   config  -- View/set issues configuration
 *   auth    -- Trigger gh CLI auth flow
 */

export interface IssuesCreateOpts {
  title: string;
  body: string;
  labels?: string;
  /** `public` creates a GitHub issue when possible; `private` stores Neotoma-only (no GitHub create). */
  visibility?: "public" | "private";
  /** Deprecated alias for `visibility: "private"`; retained for one minor release. */
  advisory?: boolean;
  reporter_git_sha?: string;
  reporter_app_version?: string;
  reporter_git_ref?: string;
  reporter_channel?: string;
  reporter_ci_run_id?: string;
  json?: boolean;
}

export interface IssuesMessageOpts {
  body: string;
  json?: boolean;
  /** Neotoma `issue` entity id (preferred). */
  entity_id?: string;
  /** GitHub issue number in configured repo. */
  issue_number?: number;
  /** Guest token for operator remote append when the local snapshot does not carry it. */
  guest_access_token?: string;
  reporter_git_sha?: string;
  reporter_app_version?: string;
  reporter_git_ref?: string;
  reporter_channel?: string;
  reporter_ci_run_id?: string;
}

export interface IssuesStatusOpts {
  entity_id?: string;
  issue_number?: number;
  skip_sync?: boolean;
  guest_access_token?: string;
  json?: boolean;
}

export const ADVISORY_VISIBILITY_DEPRECATION =
  "visibility 'advisory' is deprecated; use 'private' instead.";

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
  labels?: string;
  json?: boolean;
}

export interface IssuesConfigOpts {
  repo?: string;
  mode?: "proactive" | "consent" | "off";
  authorAlias?: string;
  clearAuthorAlias?: boolean;
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
  const { mergeNeotomaToolingIssueLabels } = await import("../services/issues/github_client.js");
  const parsedLabels = opts.labels ? opts.labels.split(",").map((l) => l.trim()).filter(Boolean) : undefined;
  const labels = mergeNeotomaToolingIssueLabels(parsedLabels);
  const visibility = opts.advisory === true ? "private" : (opts.visibility ?? "public");

  if (opts.advisory === true && !opts.json) {
    process.stderr.write(`${ADVISORY_VISIBILITY_DEPRECATION}\n`);
  }

  const { data, error } = await api.POST("/issues/submit", {
    body: {
      title: opts.title,
      body: opts.body,
      labels: labels.length > 0 ? labels : undefined,
      visibility,
      reporter_git_sha: opts.reporter_git_sha?.trim() || undefined,
      reporter_app_version: opts.reporter_app_version?.trim() || undefined,
      reporter_git_ref: opts.reporter_git_ref?.trim() || undefined,
      reporter_channel: opts.reporter_channel?.trim() || undefined,
      reporter_ci_run_id: opts.reporter_ci_run_id?.trim() || undefined,
    },
  });

  if (error) {
    process.stderr.write(`issues submit failed: ${JSON.stringify(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const row = data as {
    issue_number?: number;
    github_url?: string;
    entity_id?: string;
    pushed_to_github?: boolean;
    github_mirror_guidance?: string | null;
    guest_access_token?: string;
  } | undefined;

  const issueNumber = row?.issue_number ?? 0;
  const githubUrl = row?.github_url ?? "";
  const entityId = row?.entity_id ?? "";
  const pushedToGithub = Boolean(row?.pushed_to_github);

  if (opts.json) {
    output(
      {
        issue_number: issueNumber,
        github_url: githubUrl,
        entity_id: entityId,
        pushed_to_github: pushedToGithub,
        guest_access_token: row?.guest_access_token,
        github_mirror_guidance: row?.github_mirror_guidance ?? null,
      },
      true,
    );
  } else {
    if (pushedToGithub && issueNumber > 0) {
      process.stdout.write(`Created issue #${issueNumber}: ${githubUrl}\n`);
    } else {
      process.stdout.write(`Issue stored locally (GitHub push pending or private). Entity: ${entityId}\n`);
      if (row?.github_mirror_guidance) {
        process.stdout.write(`${row.github_mirror_guidance}\n`);
      }
    }
    if (row?.guest_access_token) {
      process.stdout.write(
        "Guest access token returned. Treat it as a credential; pass it to issues status/message when needed.\n",
      );
    }
  }
}

export async function issuesMessage(opts: IssuesMessageOpts, api: NeotomaApiClient): Promise<void> {
  const entityId = opts.entity_id?.trim();
  const issueNumber = opts.issue_number;
  const hasEntity = typeof entityId === "string" && entityId.length > 0;
  const hasNumber = typeof issueNumber === "number" && Number.isFinite(issueNumber) && issueNumber > 0;
  if (!hasEntity && !hasNumber) {
    process.stderr.write("Error: provide a GitHub issue number as the command argument or --entity-id\n");
    process.exitCode = 1;
    return;
  }

  const { data, error } = await api.POST("/issues/add_message", {
    body: {
      ...(hasEntity ? { entity_id: entityId } : {}),
      ...(hasNumber ? { issue_number: issueNumber } : {}),
      body: opts.body,
      ...(opts.guest_access_token?.trim()
        ? { guest_access_token: opts.guest_access_token.trim() }
        : {}),
      reporter_git_sha: opts.reporter_git_sha?.trim() || undefined,
      reporter_app_version: opts.reporter_app_version?.trim() || undefined,
      reporter_git_ref: opts.reporter_git_ref?.trim() || undefined,
      reporter_channel: opts.reporter_channel?.trim() || undefined,
      reporter_ci_run_id: opts.reporter_ci_run_id?.trim() || undefined,
    },
  });

  if (error) {
    process.stderr.write(`issues message failed: ${JSON.stringify(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const row = data as {
    github_comment_id?: string | null;
    message_entity_id?: string;
    pushed_to_github?: boolean;
    submitted_to_neotoma?: boolean;
    remote_submission_error?: string | null;
  } | undefined;

  if (opts.json) {
    output(
      {
        pushed_to_github: Boolean(row?.pushed_to_github),
        github_comment_id: row?.github_comment_id ?? null,
        message_entity_id: row?.message_entity_id,
        submitted_to_neotoma: Boolean(row?.submitted_to_neotoma),
        remote_submission_error: row?.remote_submission_error ?? null,
      },
      true,
    );
  } else {
    if (row?.pushed_to_github) {
      process.stdout.write(
        `Message added${hasNumber ? ` to issue #${issueNumber}` : ""}${row.github_comment_id ? ` (comment ${row.github_comment_id})` : ""}\n`,
      );
    } else {
      process.stdout.write(`Message stored locally (GitHub push pending or private thread)\n`);
    }
    if (row?.remote_submission_error) {
      process.stderr.write(`Remote Neotoma append failed: ${row.remote_submission_error}\n`);
    }
  }
}

export async function issuesStatus(opts: IssuesStatusOpts, api: NeotomaApiClient): Promise<void> {
  const entityId = opts.entity_id?.trim();
  const issueNumber = opts.issue_number;
  const hasEntity = typeof entityId === "string" && entityId.length > 0;
  const hasNumber = typeof issueNumber === "number" && Number.isFinite(issueNumber) && issueNumber > 0;
  if (!hasEntity && !hasNumber) {
    process.stderr.write("Error: provide --entity-id or --issue-number\n");
    process.exitCode = 1;
    return;
  }

  const { data, error } = await api.POST("/issues/status", {
    body: {
      ...(hasEntity ? { entity_id: entityId } : {}),
      ...(hasNumber ? { issue_number: issueNumber } : {}),
      skip_sync: opts.skip_sync === true,
      ...(opts.guest_access_token?.trim()
        ? { guest_access_token: opts.guest_access_token.trim() }
        : {}),
    },
  });

  if (error) {
    process.stderr.write(`issues status failed: ${JSON.stringify(error)}\n`);
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    output(data, true);
    return;
  }

  const row = data as {
    title?: string;
    status?: string;
    issue_number?: number;
    github_url?: string;
    messages?: Array<{ author: string; body: string; created_at: string }>;
    synced?: boolean;
  } | undefined;
  process.stdout.write(`${row?.title ?? ""} [${row?.status ?? ""}]`);
  if (row?.issue_number) process.stdout.write(` #${row.issue_number}`);
  process.stdout.write("\n");
  if (row?.github_url) process.stdout.write(`${row.github_url}\n`);
  process.stdout.write(`synced=${Boolean(row?.synced)}\n\n`);
  for (const m of row?.messages ?? []) {
    process.stdout.write(`--- ${m.author} @ ${m.created_at}\n${m.body}\n\n`);
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
  const labelArr = opts.labels
    ? opts.labels.split(",").map((l) => l.trim()).filter(Boolean)
    : undefined;

  const { data, error } = await api.POST("/issues/sync", {
    body: {
      since: opts.since,
      state: opts.state ?? "all",
      labels: labelArr && labelArr.length > 0 ? labelArr : undefined,
    },
  });

  if (error) {
    process.stderr.write(`issues sync failed: ${JSON.stringify(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const row = data as {
    issues_synced?: number;
    messages_synced?: number;
    errors?: string[];
  } | undefined;

  const issuesSynced = row?.issues_synced ?? 0;
  const messagesSynced = row?.messages_synced ?? 0;
  const errors = row?.errors ?? [];

  if (opts.json) {
    output({ issues_synced: issuesSynced, messages_synced: messagesSynced, errors }, true);
  } else {
    process.stdout.write(`Synced ${issuesSynced} issues, ${messagesSynced} messages.\n`);
    if (errors.length) {
      process.stderr.write(`Errors:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
    }
  }
}

export async function issuesConfig(opts: IssuesConfigOpts): Promise<void> {
  const { loadIssuesConfig, updateIssuesConfig } = await import("../services/issues/config.js");

  if (!opts.repo && !opts.mode && opts.authorAlias === undefined && !opts.clearAuthorAlias) {
    const config = await loadIssuesConfig();
    if (opts.json) {
      output(config, true);
    } else {
      process.stdout.write(`Issues configuration:\n`);
      process.stdout.write(`  GitHub auth: ${config.github_auth}\n`);
      process.stdout.write(`  Repo: ${config.repo}\n`);
      process.stdout.write(`  Reporting mode: ${config.reporting_mode}\n`);
      process.stdout.write(`  Author alias: ${config.author_alias ?? "not configured"}\n`);
      process.stdout.write(`  Sync staleness: ${config.sync_staleness_ms}ms\n`);
      process.stdout.write(`  Configured at: ${config.configured_at ?? "not configured"}\n`);
    }
    return;
  }

  const updates: Record<string, unknown> = {};
  if (opts.repo) updates.repo = opts.repo;
  if (opts.mode) updates.reporting_mode = opts.mode;
  if (opts.clearAuthorAlias) {
    updates.author_alias = null;
  } else if (opts.authorAlias !== undefined) {
    const alias = opts.authorAlias.trim();
    updates.author_alias = alias.length > 0 ? alias : null;
  }

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
