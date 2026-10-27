/**
 * PermissionsPreflight — tabbed allowlist snippets for agent harnesses.
 *
 * Goal: let the user paste one snippet before running the install prompt so
 * the agent only needs two approvals during the full onboarding flow
 * (`neotoma *` wildcard and `npm install -g neotoma`).
 */

import React, { useState } from "react";

import { SiteSnippet } from "./SiteSnippet";
import { SITE_CODE_SNIPPETS } from "../site/site_data";
import { sendFunnelPreflightCopy, type PreflightHarness } from "../utils/analytics";

interface HarnessTab {
  id: PreflightHarness;
  label: string;
  description: string;
  filePath: string;
  snippet: string;
}

const TABS: HarnessTab[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "JSON merge into Claude Code's permissions file.",
    filePath: ".claude/settings.local.json (project) — or ~/.claude/settings.json (user)",
    snippet: SITE_CODE_SNIPPETS.preflightClaudeCode,
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "JSON merge into Cursor's project allowlist.",
    filePath: ".cursor/allowlist.json",
    snippet: SITE_CODE_SNIPPETS.preflightCursor,
  },
  {
    id: "codex",
    label: "Codex",
    description: "TOML block appended to Codex's user config.",
    filePath: "~/.codex/config.toml",
    snippet: SITE_CODE_SNIPPETS.preflightCodex,
  },
];

export function PermissionsPreflight(): React.ReactElement {
  const [activeId, setActiveId] = useState<PreflightHarness>("claude-code");
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0]!;
  return (
    <section
      id="permissions-preflight"
      aria-labelledby="permissions-preflight-heading"
      className="mb-6 rounded-lg border border-border bg-card/50 p-4"
    >
      <header className="mb-3 flex flex-col gap-1">
        <h2
          id="permissions-preflight-heading"
          className="text-body font-semibold tracking-[-0.01em]"
        >
          Permissions pre-flight (copy once, before running the agent prompt below)
        </h2>
        <p className="text-ui leading-5 text-muted-foreground">
          Paste this snippet into the right file for your agent harness so the rest of onboarding
          only needs two approvals: <code className="rounded bg-muted px-1 py-0.5">neotoma *</code>{" "}
          and one <code className="rounded bg-muted px-1 py-0.5">npm install -g neotoma</code>.
          Without this, directory-scoped harnesses will prompt for every individual command.
        </p>
        <p className="text-fine leading-5 text-muted-foreground">
          Using <strong>OpenClaw</strong>? Skip this — the native plugin handles consent. Just run{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            openclaw plugins install clawhub:neotoma
          </code>{" "}
          and approve the plugin permission prompt once.
        </p>
      </header>
      <div
        role="tablist"
        aria-label="Agent harness"
        className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {TABS.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              aria-controls={`preflight-panel-${tab.id}`}
              id={`preflight-tab-${tab.id}`}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`rounded-md px-3 py-1.5 text-ui transition-colors ${
                selected
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={`preflight-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`preflight-tab-${active.id}`}
      >
        <SiteSnippet
          text={active.snippet}
          title={`${active.label} permissions`}
          subtitle={`${active.description} Target: ${active.filePath}`}
          copyFeedbackId={`preflight-${activeId}`}
          label="Permissions pre-flight snippet"
          onAfterCopy={() => sendFunnelPreflightCopy(active.id)}
        />
      </div>
    </section>
  );
}

export default PermissionsPreflight;
