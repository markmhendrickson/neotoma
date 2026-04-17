/**
 * PermissionsPreflight — tabbed allowlist snippets for agent harnesses.
 *
 * Goal: let the user paste one snippet before running the install prompt so
 * the agent only needs two approvals during the full onboarding flow
 * (`neotoma *` wildcard and `npm install -g neotoma`).
 */

import { Check, Copy } from "lucide-react";
import React, { useState, useCallback } from "react";

import { Button } from "./ui/button";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
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
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "Native plugin handles consent. No allowlist needed.",
    filePath: "(managed by the OpenClaw plugin)",
    snippet: SITE_CODE_SNIPPETS.preflightOpenClaw,
  },
  {
    id: "path-mise",
    label: "PATH / mise / nvm",
    description: "If `which neotoma` fails after install, fix your shell manager activation.",
    filePath: "~/.zshenv or ~/.zshrc",
    snippet: SITE_CODE_SNIPPETS.preflightPathMise,
  },
];

export function PermissionsPreflight(): React.ReactElement {
  const [activeId, setActiveId] = useState<PreflightHarness>("claude-code");
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0]!;
  const [copied, markCopied] = useCopyFeedback(`preflight-${activeId}`, 0);

  const onCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(active.snippet);
    if (!ok) return;
    markCopied();
    sendFunnelPreflightCopy(active.id);
  }, [active.id, active.snippet, markCopied]);

  return (
    <section
      id="permissions-preflight"
      aria-labelledby="permissions-preflight-heading"
      className="mb-6 rounded-lg border border-border bg-card/50 p-4"
    >
      <header className="mb-3 flex flex-col gap-1">
        <h2
          id="permissions-preflight-heading"
          className="text-[15px] font-semibold tracking-[-0.01em]"
        >
          Permissions pre-flight (copy once, before the agent runs)
        </h2>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Paste this snippet into the right file for your agent harness so the
          rest of onboarding only needs two approvals: <code className="rounded bg-muted px-1 py-0.5">neotoma *</code>{" "}
          and one <code className="rounded bg-muted px-1 py-0.5">npm install -g neotoma</code>.
          Without this, directory-scoped harnesses will prompt for every
          individual command.
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
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
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
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {active.description}
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
              Target: <code className="rounded bg-muted px-1 py-0.5">{active.filePath}</code>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={copied ? "Copied" : "Copy snippet"}
            onClick={onCopy}
            className="shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="ml-1.5 text-[12px]">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
        <pre className="max-h-72 overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words">
          <code>{active.snippet}</code>
        </pre>
      </div>
    </section>
  );
}

export default PermissionsPreflight;
