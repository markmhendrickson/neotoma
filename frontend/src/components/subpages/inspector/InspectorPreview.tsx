import React from "react";

/**
 * Static HTML mockups of Inspector UI for the documentation site.
 *
 * Inspector itself is a SPA that lives at /inspector on the Neotoma server.
 * These previews are intentionally non-interactive recreations using Tailwind
 * + the site's design tokens, they illustrate layout, density, and key
 * affordances without bundling the live Inspector into the marketing site.
 */

interface InspectorPreviewProps {
  /** Path shown in the fake address bar (e.g. "/entities"). */
  path: string;
  /** Caption displayed below the preview frame. */
  caption?: React.ReactNode;
  /** The mockup body. */
  children: React.ReactNode;
  /** Optional class on the inner content area. */
  bodyClassName?: string;
}

export function InspectorPreview({
  path,
  caption,
  children,
  bodyClassName = "",
}: InspectorPreviewProps) {
  return (
    <figure className="my-6">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <span
            className="h-2.5 w-2.5 rounded-full bg-rose-400/70"
            aria-hidden
          />
          <span
            className="h-2.5 w-2.5 rounded-full bg-amber-400/70"
            aria-hidden
          />
          <span
            className="h-2.5 w-2.5 rounded-full bg-emerald-400/70"
            aria-hidden
          />
          <div className="ml-2 flex-1 min-w-0">
            <div className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[12px] font-mono text-muted-foreground truncate">
              <span className="text-muted-foreground/70">
                inspector.neotoma.io
              </span>
              <span className="text-foreground">{path}</span>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Inspector
          </span>
        </div>
        <div className={`bg-background ${bodyClassName}`}>{children}</div>
      </div>
      {caption ? (
        <figcaption className="mt-2 text-[13px] leading-6 text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * A minimal Inspector sidebar mockup used inside several previews.
 * The `active` prop highlights the route the current preview represents.
 */
export function InspectorSidebarMock({
  active,
}: {
  active:
    | "dashboard"
    | "conversations"
    | "turns"
    | "compliance"
    | "activity"
    | "feedback"
    | "entities"
    | "observations"
    | "sources"
    | "relationships"
    | "graph"
    | "schemas"
    | "timeline"
    | "interpretations"
    | "agents"
    | "grants"
    | "settings";
}) {
  const groups: { items: { key: string; label: string }[] }[] = [
    {
      items: [
        { key: "dashboard", label: "Dashboard" },
        { key: "conversations", label: "Conversations" },
        { key: "turns", label: "Turns" },
        { key: "compliance", label: "Compliance" },
        { key: "activity", label: "Activity" },
        { key: "feedback", label: "Feedback" },
      ],
    },
    {
      items: [
        { key: "entities", label: "Entities" },
        { key: "observations", label: "Observations" },
        { key: "sources", label: "Sources" },
        { key: "relationships", label: "Relationships" },
        { key: "graph", label: "Graph Explorer" },
      ],
    },
    {
      items: [
        { key: "schemas", label: "Schemas" },
        { key: "timeline", label: "Timeline" },
        { key: "interpretations", label: "Interpretations" },
        { key: "agents", label: "Agents" },
        { key: "grants", label: "Agent grants" },
      ],
    },
    {
      items: [{ key: "settings", label: "Settings" }],
    },
  ];

  return (
    <aside className="hidden md:flex w-[180px] shrink-0 flex-col border-r border-border bg-muted/40 p-3 gap-2 text-[12px]">
      <div className="flex items-center gap-2 px-1 pb-2 border-b border-border/60 mb-1">
        <span className="h-4 w-4 rounded-sm bg-foreground/80" aria-hidden />
        <span className="font-semibold text-foreground">Neotoma</span>
      </div>
      {groups.map((group, i) => (
        <div key={i} className={i > 0 ? "pt-2 border-t border-border/40" : ""}>
          {group.items.map((item) => {
            const isActive = item.key === active;
            return (
              <div
                key={item.key}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  isActive
                    ? "bg-foreground/10 text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-sm ${
                    isActive ? "bg-foreground/60" : "bg-muted-foreground/40"
                  }`}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/** Header strip used in pages that show a title + filter row. */
export function InspectorPageHeaderMock({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-foreground truncate">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[12px] text-muted-foreground truncate">
            {subtitle}
          </div>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** Generic stat card. */
export function MockStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/** Pill / badge mockup. */
export function MockPill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?:
    | "default"
    | "info"
    | "success"
    | "warning"
    | "danger"
    | "muted"
    | "violet";
}) {
  const tones: Record<string, string> = {
    default: "border-border bg-muted/40 text-foreground",
    info: "border-sky-300/60 bg-sky-50 text-sky-900 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/60",
    success:
      "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60",
    warning:
      "border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/60",
    danger:
      "border-rose-300/60 bg-rose-50 text-rose-900 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/60",
    muted: "border-border bg-muted/40 text-muted-foreground",
    violet:
      "border-violet-300/60 bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/60",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
