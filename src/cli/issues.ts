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
 *   import  -- Ingest observer JSONL logs and file/fold issues
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
  const parsedLabels = opts.labels
    ? opts.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
    : undefined;
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

  const row = data as
    | {
        issue_number?: number;
        github_url?: string;
        entity_id?: string;
        pushed_to_github?: boolean;
        github_mirror_guidance?: string | null;
        guest_access_token?: string;
      }
    | undefined;

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
      true
    );
  } else {
    if (pushedToGithub && issueNumber > 0) {
      process.stdout.write(`Created issue #${issueNumber}: ${githubUrl}\n`);
    } else {
      process.stdout.write(
        `Issue stored locally (GitHub push pending or private). Entity: ${entityId}\n`
      );
      if (row?.github_mirror_guidance) {
        process.stdout.write(`${row.github_mirror_guidance}\n`);
      }
    }
    if (row?.guest_access_token) {
      process.stdout.write(
        "Guest access token returned. Treat it as a credential; pass it to issues status/message when needed.\n"
      );
    }
  }
}

export async function issuesMessage(opts: IssuesMessageOpts, api: NeotomaApiClient): Promise<void> {
  const entityId = opts.entity_id?.trim();
  const issueNumber = opts.issue_number;
  const hasEntity = typeof entityId === "string" && entityId.length > 0;
  const hasNumber =
    typeof issueNumber === "number" && Number.isFinite(issueNumber) && issueNumber > 0;
  if (!hasEntity && !hasNumber) {
    process.stderr.write(
      "Error: provide a GitHub issue number as the command argument or --entity-id\n"
    );
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

  const row = data as
    | {
        github_comment_id?: string | null;
        message_entity_id?: string;
        pushed_to_github?: boolean;
        submitted_to_neotoma?: boolean;
        remote_submission_error?: string | null;
      }
    | undefined;

  if (opts.json) {
    output(
      {
        pushed_to_github: Boolean(row?.pushed_to_github),
        github_comment_id: row?.github_comment_id ?? null,
        message_entity_id: row?.message_entity_id,
        submitted_to_neotoma: Boolean(row?.submitted_to_neotoma),
        remote_submission_error: row?.remote_submission_error ?? null,
      },
      true
    );
  } else {
    if (row?.pushed_to_github) {
      process.stdout.write(
        `Message added${hasNumber ? ` to issue #${issueNumber}` : ""}${row.github_comment_id ? ` (comment ${row.github_comment_id})` : ""}\n`
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
  const hasNumber =
    typeof issueNumber === "number" && Number.isFinite(issueNumber) && issueNumber > 0;
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

  const row = data as
    | {
        title?: string;
        status?: string;
        issue_number?: number;
        github_url?: string;
        messages?: Array<{ author: string; body: string; created_at: string }>;
        synced?: boolean;
      }
    | undefined;
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
        output(
          ghIssues.map((i) => ({
            number: i.number,
            title: i.title,
            status: i.state,
            labels: i.labels.map((l) => l.name),
            author: i.user?.login ?? "unknown",
            url: i.html_url,
          })),
          true
        );
      } else {
        if (ghIssues.length === 0) {
          process.stdout.write("No issues found.\n");
          return;
        }
        for (const issue of ghIssues) {
          const labelStr = issue.labels.length
            ? ` [${issue.labels.map((l) => l.name).join(", ")}]`
            : "";
          process.stdout.write(`#${issue.number} [${issue.state}] ${issue.title}${labelStr}\n`);
        }
      }
      return;
    } catch (err) {
      process.stderr.write(
        `Warning: sync from GitHub failed, showing local data: ${(err as Error).message}\n`
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
    ? opts.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
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

  const row = data as
    | {
        issues_synced?: number;
        messages_synced?: number;
        errors?: string[];
      }
    | undefined;

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
  const { isGhInstalled, isGhAuthenticated, verifyGhAuth } =
    await import("../services/issues/gh_auth.js");
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

export interface IssuesImportOpts {
  fromJsonl: string;
  since?: string;
  until?: string;
  reporterChannel?: string;
  mode?: "proactive" | "consent";
  dryRun?: boolean;
  limit?: number;
  json?: boolean;
}

/**
 * `neotoma issues import --from-jsonl <path>`
 *
 * Reads an observer JSONL log, extracts anomaly lines, deduplicates against
 * existing open issues, redacts PII, and files or folds each surviving line.
 */
export async function issuesImport(opts: IssuesImportOpts, api: NeotomaApiClient): Promise<void> {
  const fs = await import("node:fs/promises");
  const { extractAnomalies, anomalyDedupKey } = await import("../services/issues/observer_import.js");
  const { runRedactionGuard } = await import("../services/issues/redaction_guard.js");
  const { listIssues } = await import("../services/issues/github_client.js");

  // Read the JSONL file.
  let content: string;
  try {
    content = await fs.readFile(opts.fromJsonl, "utf8");
  } catch (err) {
    process.stderr.write(
      `issues import: cannot read file ${opts.fromJsonl}: ${(err as Error).message}\n`
    );
    process.exitCode = 1;
    return;
  }

  const reporterAppVersion = await getCliVersion();

  const extraction = extractAnomalies(content, {
    since: opts.since,
    until: opts.until,
    reporterChannel: opts.reporterChannel,
    limit: opts.limit,
  });

  const { anomalies } = extraction;

  // Load existing open issues for dedup (best-effort; if GitHub is unavailable we still proceed).
  let existingIssues: Array<{ number: number; title: string; state: string; labels: Array<{ name: string }> }> = [];
  try {
    existingIssues = await listIssues({ state: "open", per_page: 100 });
  } catch {
    // Dedup is best-effort; skip if GitHub unavailable.
  }

  const report = {
    lines_scanned: extraction.lines_scanned,
    lines_unparseable: extraction.lines_unparseable,
    lines_skipped_by_filter: extraction.lines_skipped_by_filter,
    anomalies_extracted: anomalies.length,
    issues_filed: 0,
    issues_folded: 0,
    issues_skipped: 0,
    outcomes: [] as Array<{
      anomaly: { line_index: number; anomaly_class: string; title: string };
      outcome: { status: string; [key: string]: unknown };
    }>,
  };

  // Process each anomaly.
  for (const anomaly of anomalies) {
    const dedupKey = anomalyDedupKey(anomaly);

    // Redact PII from title+body.
    let redactedTitle: string;
    let redactedBody: string;
    try {
      const guarded = runRedactionGuard({ title: anomaly.title, body: anomaly.body, mode: "scan" });
      redactedTitle = guarded.title;
      redactedBody = guarded.body;
    } catch (err) {
      // Fail-closed: skip this line if redaction fails unexpectedly.
      const reason = `redaction failed: ${(err as Error).message}`;
      const outcome = { status: "skipped" as const, reason };
      report.issues_skipped++;
      report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
      if (!opts.json) {
        process.stderr.write(`[import] Skipping line ${anomaly.line_index}: ${reason}\n`);
      }
      continue;
    }

    // Dry-run: emit structured report and commit nothing.
    if (opts.dryRun) {
      const outcome = { status: "dry_run" as const, title: redactedTitle, body: redactedBody };
      report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
      continue;
    }

    // Dedup: look for an existing open issue that matches our dedup key.
    // We embed the dedup key in the issue title (format: [observer] ...) and labels.
    // Match by anomaly class prefix + command prefix from title, using existing open issues.
    const existingMatch = findExistingIssue(existingIssues, anomaly);

    if (existingMatch) {
      // Fold: append a message to the existing issue.
      if ((opts.mode ?? "consent") === "consent") {
        process.stdout.write(
          `\n[fold] Line ${anomaly.line_index} matches existing issue #${existingMatch.number}:\n` +
          `  Title: ${redactedTitle}\n` +
          `  Body preview: ${redactedBody.slice(0, 200)}\n`
        );
        const confirm = await promptConfirm(`Append message to #${existingMatch.number}? [y/N] `);
        if (!confirm) {
          const outcome = { status: "skipped" as const, reason: "user declined" };
          report.issues_skipped++;
          report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
          continue;
        }
      }

      try {
        const { data, error } = await api.POST("/issues/add_message", {
          body: {
            issue_number: existingMatch.number,
            body: `**Duplicate observation from observer JSONL import (dedup key: \`${dedupKey}\`)**\n\n${redactedBody}`,
            reporter_channel: anomaly.reporter_channel,
            reporter_git_sha: anomaly.reporter_git_sha?.trim() || undefined,
            reporter_app_version: (anomaly.reporter_app_version?.trim() || reporterAppVersion) || undefined,
          },
        });
        if (error) {
          const reason = `add_message failed: ${JSON.stringify(error)}`;
          const outcome = { status: "skipped" as const, reason };
          report.issues_skipped++;
          report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
          continue;
        }
        void data;
        const outcome = { status: "folded" as const, existing_entity_id: String(existingMatch.number) };
        report.issues_folded++;
        report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
      } catch (err) {
        const reason = `add_message error: ${(err as Error).message}`;
        const outcome = { status: "skipped" as const, reason };
        report.issues_skipped++;
        report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
      }
      continue;
    }

    // New issue: file it.
    if ((opts.mode ?? "consent") === "consent") {
      process.stdout.write(
        `\n[new issue] Line ${anomaly.line_index}:\n` +
        `  Title: ${redactedTitle}\n` +
        `  Body preview: ${redactedBody.slice(0, 200)}\n`
      );
      const confirm = await promptConfirm(`File this issue? [y/N] `);
      if (!confirm) {
        const outcome = { status: "skipped" as const, reason: "user declined" };
        report.issues_skipped++;
        report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
        continue;
      }
    }

    try {
      const { data, error } = await api.POST("/issues/submit", {
        body: {
          title: redactedTitle,
          body: redactedBody,
          labels: ["neotoma", "observer-import"],
          visibility: "public",
          reporter_channel: anomaly.reporter_channel,
          reporter_git_sha: anomaly.reporter_git_sha?.trim() || undefined,
          reporter_app_version: (anomaly.reporter_app_version?.trim() || reporterAppVersion) || undefined,
        },
      });

      if (error) {
        const reason = `submit failed: ${JSON.stringify(error)}`;
        const outcome = { status: "skipped" as const, reason };
        report.issues_skipped++;
        report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
        continue;
      }

      const row = data as { entity_id?: string; issue_number?: number } | undefined;
      const outcome = {
        status: "filed" as const,
        entity_id: row?.entity_id ?? "",
        issue_number: row?.issue_number,
      };
      report.issues_filed++;
      report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
    } catch (err) {
      const reason = `submit error: ${(err as Error).message}`;
      const outcome = { status: "skipped" as const, reason };
      report.issues_skipped++;
      report.outcomes.push({ anomaly: { line_index: anomaly.line_index, anomaly_class: anomaly.anomaly_class, title: anomaly.title }, outcome });
    }
  }

  // Emit sweep report.
  if (opts.json || opts.dryRun) {
    output(report, true);
  } else {
    process.stdout.write(`\n=== Observer JSONL import sweep report ===\n`);
    process.stdout.write(`  Lines scanned:       ${report.lines_scanned}\n`);
    process.stdout.write(`  Lines unparseable:   ${report.lines_unparseable}\n`);
    process.stdout.write(`  Lines filtered:      ${report.lines_skipped_by_filter}\n`);
    process.stdout.write(`  Anomalies extracted: ${report.anomalies_extracted}\n`);
    if (opts.dryRun) {
      process.stdout.write(`  (dry-run: no issues filed)\n`);
    } else {
      process.stdout.write(`  Issues filed:        ${report.issues_filed}\n`);
      process.stdout.write(`  Issues folded:       ${report.issues_folded}\n`);
      process.stdout.write(`  Issues skipped:      ${report.issues_skipped}\n`);
    }
  }

}

async function getCliVersion(): Promise<string> {
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const pkg = req("../../package.json") as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

async function promptConfirm(prompt: string): Promise<boolean> {
  // Non-interactive: auto-decline in non-TTY contexts.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

  const readline = await import("node:readline");
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function findExistingIssue(
  issues: Array<{ number: number; title: string; state: string; labels: Array<{ name: string }> }>,
  anomaly: import("../services/issues/observer_import.js").ObserverAnomaly
): { number: number; title: string } | null {
  // Match by: title contains the same anomaly class token and command prefix.
  const classToken = `[observer]`;
  const anomalyClassLabel = anomaly.anomaly_class;
  for (const issue of issues) {
    if (!issue.title.includes(classToken)) continue;
    // Check the labels for observer-import tag and anomaly class match.
    const hasObserverLabel = issue.labels.some((l) => l.name === "observer-import");
    if (!hasObserverLabel) continue;
    // Coarse match: title contains the command prefix.
    if (issue.title.includes(anomaly.command_prefix) || issue.title.includes(anomalyClassLabel)) {
      return issue;
    }
  }
  return null;
}
