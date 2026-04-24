import {
  Activity,
  Box,
  Clock,
  Cpu,
  Eye,
  FileText,
  Github,
  LayoutDashboard,
  Link2,
  ListFilter,
  Network,
  Search,
  Settings,
  Table2,
  User,
  Users,
} from "lucide-react";
import { sendCtaClick } from "@/utils/analytics";

/** Source repo for the local Neotoma Inspector UI (`inspector` git submodule). */
const NEOTOMA_INSPECTOR_REPO_URL = "https://github.com/markmhendrickson/neotoma-inspector";

const INSPECTOR_DASHBOARD_METRICS = [
  { label: "Entities", value: "23,633", Icon: Box },
  { label: "Observations", value: "30,692", Icon: Eye },
  { label: "Sources", value: "5,563", Icon: FileText },
  { label: "Relationships", value: "5,290", Icon: Link2 },
  { label: "Events", value: "35,751", Icon: Clock },
  { label: "Interpretations", value: "235", Icon: Cpu },
] as const;

const INSPECTOR_CHART_TYPES = [
  { label: "task", hPx: 52 },
  { label: "agent_message", hPx: 40 },
  { label: "contact", hPx: 34 },
  { label: "conversation", hPx: 28 },
  { label: "generic", hPx: 22 },
  { label: "post", hPx: 18 },
  { label: "transaction", hPx: 14 },
] as const;

const INSPECTOR_SIDEBAR_PRIMARY: {
  label: string;
  Icon: typeof LayoutDashboard;
  active?: boolean;
}[] = [
  { label: "Dashboard", Icon: LayoutDashboard, active: true },
  { label: "Entities", Icon: Search },
  { label: "Observations", Icon: Eye },
  { label: "Sources", Icon: FileText },
  { label: "Relationships", Icon: Link2 },
  { label: "Graph Explorer", Icon: Network },
];

const INSPECTOR_SIDEBAR_SECONDARY: { label: string; Icon: typeof Table2 }[] = [
  { label: "Schemas", Icon: Table2 },
  { label: "Recent Activity", Icon: Activity },
  { label: "Timeline", Icon: Clock },
  { label: "Interpretations", Icon: Cpu },
];

export type InspectorPreviewVariant = "demo-teaser" | "sandbox";

export type InspectorPreviewIllustrationProps = {
  variant: InspectorPreviewVariant;
  /** Public sandbox host (no protocol), e.g. sandbox.neotoma.io */
  sandboxHost?: string;
  className?: string;
};

/**
 * Static HTML/CSS mock of the Neotoma Inspector shell — same visual language as the homepage
 * product demo. `demo-teaser` dims the mock and shows the hosted-sandbox “coming soon” card;
 * `sandbox` renders a clear, live-style preview for the sandbox marketing page.
 */
export function InspectorPreviewIllustration({
  variant,
  sandboxHost = "sandbox.neotoma.io",
  className = "",
}: InspectorPreviewIllustrationProps) {
  const isSandbox = variant === "sandbox";
  const mcpLine = isSandbox ? `https://${sandboxHost}/mcp` : "http://127.0.0.1:3180/mcp";

  return (
    <div
      className={`cursor-default overflow-hidden rounded-xl border border-slate-200 bg-white text-foreground shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:shadow-none ${className}`}
      role="img"
      aria-label={
        isSandbox
          ? "Decorative preview of the Neotoma Inspector on the public sandbox"
          : "Decorative preview of the Neotoma Inspector app with a coming-soon hosted sandbox notice"
      }
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-900 text-[10px] font-bold text-white dark:bg-violet-800"
            aria-hidden
          >
            N
          </div>
          <span className="text-[12px] font-semibold tracking-tight">Neotoma</span>
        </div>
        <div className="flex items-center gap-3">
          {isSandbox ? (
            <span className="hidden items-center gap-1.5 text-[11px] font-medium text-amber-700 sm:inline-flex dark:text-amber-400">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              Public sandbox
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 text-[11px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              Connected
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {isSandbox ? (
              <Users className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            )}
            <span className="hidden sm:inline">{isSandbox ? "Shared dataset" : "Local user"}</span>
          </span>
        </div>
      </div>

      <div className="flex min-h-[280px] sm:min-h-[320px]">
        <aside className="hidden w-[152px] shrink-0 border-r border-slate-200 bg-slate-50/90 p-2 sm:block dark:border-slate-800 dark:bg-slate-900/50">
          <nav className="space-y-0.5 pt-0.5" aria-label="Inspector preview navigation">
            {INSPECTOR_SIDEBAR_PRIMARY.map(({ label, Icon, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium ${
                  active
                    ? "bg-white text-foreground shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ))}
            <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            {INSPECTOR_SIDEBAR_SECONDARY.map(({ label, Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ))}
            <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
              <Settings className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              Settings
            </div>
          </nav>
        </aside>

        <div className="relative min-w-0 flex-1 bg-white p-3 dark:bg-slate-950">
          <div
            className={`pointer-events-none select-none ${isSandbox ? "opacity-95 sm:opacity-100" : "opacity-50 sm:opacity-[0.55]"}`}
          >
            <h2 className="text-[16px] font-semibold tracking-tight">Dashboard</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Last updated 4/9/2026, 12:39:53 PM
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {INSPECTOR_DASHBOARD_METRICS.map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                  </div>
                  <p className="mt-2 text-[15px] font-semibold tabular-nums tracking-tight">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-stretch">
              <div className="min-h-[128px] flex-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Entities by Type</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground dark:border-slate-700 dark:bg-slate-800/80">
                    <ListFilter className="h-3 w-3" aria-hidden />
                    10 of 358 types
                  </span>
                </div>
                <div className="flex h-[92px] items-end justify-between gap-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {INSPECTOR_CHART_TYPES.map(({ label, hPx }) => (
                    <div
                      key={label}
                      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    >
                      <div
                        className="w-full max-w-[16px] rounded-t-sm bg-slate-800 dark:bg-slate-600"
                        style={{ height: `${hPx}px` }}
                      />
                      <span className="max-w-[3.25rem] truncate text-center text-[7px] font-mono leading-tight text-muted-foreground sm:max-w-none sm:-rotate-45 sm:whitespace-nowrap sm:text-[8px]">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[42%]">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-[11px] font-semibold">Health</p>
                  <p className="mt-2 text-[10px] leading-relaxed">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">API:</span>{" "}
                    <span className="text-emerald-600 dark:text-emerald-400">Healthy</span>
                  </p>
                  {isSandbox ? (
                    <p className="text-[10px] text-muted-foreground">HTTPS · shared instance</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Port: 3180</p>
                  )}
                  <p className="truncate font-mono text-[9px] text-muted-foreground">{mcpLine}</p>
                  <div className="mt-2 inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-foreground dark:border-slate-700 dark:bg-slate-950">
                    Check Snapshot Health
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-[11px] font-semibold">Recent Activity</p>
                  <ul className="mt-2 space-y-1.5 text-[9px] text-muted-foreground">
                    <li className="truncate">8m · Data Source · ent_42bf…</li>
                    <li className="truncate">1h · Observation · sarah-chen</li>
                    <li className="truncate">2h · Relationship · PART_OF</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {!isSandbox ? (
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex w-full flex-col items-center justify-start bg-white/55 px-3 pt-4 pb-3 backdrop-blur-[2px] dark:bg-slate-950/55 sm:inset-0 sm:justify-center sm:bg-white/50 sm:pt-0 sm:pb-0 sm:backdrop-blur-[1.5px] dark:sm:bg-slate-950/50">
              <div className="pointer-events-auto max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                  Coming soon
                </div>
                <p className="text-[18px] font-semibold leading-snug text-foreground sm:text-[21px]">
                  Hosted sandbox with seed data
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Browse entities, explore the relationship graph, inspect version history, and diff
                  state changes — all in the browser, no install required.
                </p>
                <div className="pt-0.5">
                  <a
                    href={NEOTOMA_INSPECTOR_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-analytics-no-outbound
                    onClick={() => sendCtaClick("demo_inspector_github")}
                    className="inline-flex w-full cursor-pointer justify-center items-center gap-1.5 rounded-md border border-violet-700 bg-violet-700 px-3 py-1.5 text-[13px] font-medium text-white no-underline shadow-sm shadow-violet-700/30 hover:border-violet-600 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:border-violet-500 dark:bg-violet-600 dark:text-white dark:shadow-violet-950/50 dark:hover:border-violet-400 dark:hover:bg-violet-500 dark:hover:text-white dark:focus-visible:ring-violet-400 dark:focus-visible:ring-offset-slate-950 transition-colors sm:w-auto"
                  >
                    <Github className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Open Inspector on GitHub
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
