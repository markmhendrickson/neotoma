import { isEmbeddedMode, runtimeEnv } from "../../config_embedded.js";
import { IssueTransportError } from "./errors.js";
import type { IssuesConfig } from "./types.js";

/**
 * In embedded mode the issue tools act only on what the host configured explicitly:
 * a target URL (`NEOTOMA_ISSUES_TARGET_URL` in `env`, or `issues.target_url` in the
 * data directory's `config.json`) or a GitHub token named in `env`. With neither,
 * refuse before any file or network access. No-op outside embedded mode.
 */
export function assertEmbeddedIssuesConfigured(config: Pick<IssuesConfig, "target_url">): void {
  if (!isEmbeddedMode()) return;
  if (config.target_url?.trim()) return;
  if (runtimeEnv().NEOTOMA_ISSUES_GITHUB_TOKEN?.trim()) return;
  throw new IssueTransportError({
    code: "embedded_issues_not_configured",
    status: 400,
    message:
      "Issue submission is not configured for this embedded instance. Name a target in the " +
      "embedded options: set NEOTOMA_ISSUES_TARGET_URL (or a GitHub token) in `env`.",
    hint: "Embedded instances read no home-directory configuration and send nothing to a default remote.",
  });
}
