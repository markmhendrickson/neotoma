interface TerminalInstallIllustrationProps {
  className?: string;
}

const STEPS = [
  {
    role: "system" as const,
    text: "Install Neotoma globally with npm.",
    detail: "npm install -g neotoma",
  },
  {
    role: "agent" as const,
    text: "Installed neotoma. Running init now.",
    detail: "neotoma init",
  },
  {
    role: "agent" as const,
    text: "Init complete. MCP configured for Cursor.",
    detail: "wrote ~/.cursor/mcp.json",
  },
  {
    role: "agent" as const,
    text: "Scanning context for candidate data.",
    detail: "git config · package.json · session",
  },
  {
    role: "agent" as const,
    text: "Found 4 entities across 2 tiers. Preview ready.",
    detail: "2 contacts · 1 task · 1 project",
  },
  {
    role: "system" as const,
    text: "Approve all.",
  },
  {
    role: "agent" as const,
    text: "Stored approved entities. Onboarding complete.",
    detail: "4 entities · 6 observations · linked",
  },
];

export function TerminalInstallIllustration({ className }: TerminalInstallIllustrationProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-20 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative flex flex-col overflow-hidden rounded-lg border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90">
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-500/25 px-3 py-2 text-[10px] uppercase tracking-wide text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-2 w-2 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span>agent session</span>
        </div>
        <div className="px-2 py-2 space-y-1.5">
          {STEPS.map((step, index) => (
            <div
              key={index}
              className={`flex ${step.role === "system" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`font-mono text-[11px] leading-4 ${
                  step.role === "system"
                    ? "max-w-[90%] rounded-md border border-slate-300 bg-slate-200 px-2.5 py-1.5 text-right text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200"
                    : "w-full border-l-2 border-emerald-500/45 px-2 py-1 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100"
                }`}
              >
                <p>{step.text}</p>
                {step.detail && (
                  <p className="mt-0.5 text-[9px] text-current/50">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="flex h-6 items-center rounded border border-emerald-400/40 bg-slate-100/80 px-2 font-mono text-[10px] text-emerald-600/70 dark:border-emerald-400/25 dark:bg-slate-900/80 dark:text-emerald-300/60">
            <span className="mr-1 text-emerald-500/60 dark:text-emerald-400/50">&gt;</span>
            <span>ready</span>
            <span className="ml-0.5 inline-block w-[1px] animate-pulse text-emerald-600 dark:text-emerald-300">|</span>
          </div>
        </div>
      </div>
    </div>
  );
}
