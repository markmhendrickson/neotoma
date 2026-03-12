import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BookmarkX,
  Calendar,
  Check,
  ClipboardList,
  Copy,
  Database,
  EyeOff,
  FileCheck,
  FileStack,
  FileText,
  Fingerprint,
  GitBranch,
  Hand,
  History,
  Lightbulb,
  Link2,
  Lock,
  Merge,
  Network,
  Plug,
  RefreshCw,
  Repeat,
  RotateCcw,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  Unlink,
  UserPlus,
  ZapOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SeoHead } from "../SeoHead";
import { SectionDivider } from "../ui/section_divider";
import type { FailureModeItem, IcpProfile } from "../../site/site_data";

const FAILURE_MODE_ICONS: Record<string, LucideIcon> = {
  Activity,
  BookmarkX,
  Copy,
  EyeOff,
  FileText,
  GitBranch,
  Hand,
  History,
  // `LinkOff` is not exported by lucide-react; keep backward compatibility
  // with existing site data by mapping the legacy key to `Unlink`.
  LinkOff: Unlink,
  Lock,
  RefreshCw,
  Repeat,
  RotateCcw,
  Scale,
  ShieldAlert,
  Unlink,
  ZapOff,
};

const SOLUTION_ICONS: Record<string, LucideIcon> = {
  Calendar,
  Check,
  ClipboardList,
  Database,
  FileCheck,
  FileStack,
  Fingerprint,
  GitBranch,
  History,
  Link2,
  Merge,
  Network,
  Plug,
  RefreshCw,
  Repeat,
  RotateCcw,
  Scale,
  Server,
  Shield,
  Sparkles,
  UserPlus,
  ZapOff,
};

/** AI need list item: plain string or label with optional doc link. When linkTerm is set, only that term is linked, not the full line. */
export type AiNeedItem = string | { label: string; href?: string; linkTerm?: string };

export interface IcpDetailSection {
  heading: string;
  /** Lucide icon name for grid display (e.g. "Share2", "Database"). */
  icon?: string;
  body: React.ReactNode;
  /** Optional doc path to link the solution card. */
  href?: string;
}

export interface IcpOutcomeScenario {
  left: string;
  fail: string;
  succeed: string;
}

export interface IcpOutcomeCard {
  category: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  scenario: IcpOutcomeScenario;
}

interface IcpDetailPageProps {
  profile: IcpProfile;
  aiNeeds: AiNeedItem[];
  keyDifferences?: {
    comparedTo: string;
    /** Optional path to link the compared-to ICP name (e.g. "/ai-infrastructure-engineers"). */
    comparedToHref?: string;
    points: string[];
  };
  deepPainPoints: IcpDetailSection[];
  outcomes?: IcpOutcomeCard[];
  solutions: IcpDetailSection[];
  dataTypeDetails: Array<{ type: string; description: string }>;
  closingStatement: string;
}

function OutcomeFailIllustration({ human, fail }: { human: string; fail: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-gradient-to-b from-white via-slate-50 to-rose-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-rose-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative overflow-hidden rounded-lg border border-rose-500/30 bg-white/95 dark:border-rose-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-rose-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-rose-800/90 dark:border-rose-400/20 dark:text-rose-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">without state layer</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="w-fit max-w-[90%]">
              <div className="rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-left font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">
                {human}
              </div>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-rose-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-rose-900 dark:border-rose-400/55 dark:text-rose-100">
              {fail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeSuccessIllustration({
  human,
  succeed,
}: {
  human: string;
  succeed: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-emerald-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">with state layer</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="w-fit max-w-[90%]">
              <div className="rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-left font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">
                {human}
              </div>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-emerald-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100">
              {succeed}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IcpDetailPage({
  profile,
  aiNeeds,
  keyDifferences,
  deepPainPoints,
  outcomes,
  solutions,
  dataTypeDetails,
  closingStatement,
}: IcpDetailPageProps) {
  return (
    <>
      <SeoHead routePath={`/${profile.slug}`} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-2">
            {profile.name}
          </h1>
          <p className="text-[17px] leading-7 text-muted-foreground mb-10">
            {profile.tagline}
          </p>

          {/* Problems */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-400" aria-hidden />
              Problems
            </h2>
            <div className="space-y-3">
              {profile.painPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-2.5 text-[14px] leading-6"
                >
                  <span className="text-rose-400 shrink-0 leading-none mt-[0.2em]" aria-hidden>×</span>
                  <span className="text-foreground">{point}</span>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Failure modes without a memory guarantee
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {profile.failureModes.map((mode: FailureModeItem) => {
                  const Icon = FAILURE_MODE_ICONS[mode.icon] ?? AlertTriangle;
                  return (
                    <div
                      key={mode.label}
                      className="flex items-start gap-3 rounded-lg border border-rose-500/15 bg-rose-500/5 px-4 py-2.5 text-[13px] text-rose-700 dark:text-rose-300"
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 mt-[0.2em] text-rose-500 dark:text-rose-400"
                        aria-hidden
                      />
                      <span>{mode.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {deepPainPoints.length > 0 && (
              <div className="mt-8 space-y-6">
                {deepPainPoints.map((section) => (
                  <div key={section.heading}>
                    <h3 className="text-[16px] font-medium mb-2">{section.heading}</h3>
                    <div className="text-[14px] leading-7 text-muted-foreground">
                      {section.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <SectionDivider />

          {/* AI Needs */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <Lightbulb className="h-4.5 w-4.5 text-amber-500" aria-hidden />
              AI needs
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-4">
              What you need from your AI tools — and what current tools don't provide.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              {aiNeeds.map((need) => {
                const label = typeof need === "string" ? need : need.label;
                const href = typeof need === "string" ? undefined : need.href;
                const linkTerm = typeof need === "string" ? undefined : need.linkTerm;
                const linkClass = "text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";
                const termIndex = linkTerm != null ? label.indexOf(linkTerm) : -1;
                const linkSingleTerm = href && linkTerm != null && termIndex !== -1;
                return (
                  <li key={label} className="text-[14px] leading-6 text-foreground">
                    {linkSingleTerm ? (
                      <>
                        {label.slice(0, termIndex)}
                        <Link to={href} className={linkClass}>
                          {linkTerm}
                        </Link>
                        {label.slice(termIndex + linkTerm.length)}
                      </>
                    ) : href ? (
                      <Link to={href} className={linkClass}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <SectionDivider />

          {/* Solutions with Neotoma */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <Shield className="h-4.5 w-4.5 text-emerald-500" aria-hidden />
              How Neotoma solves this
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-6">
              {profile.solutionSummary}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
              {solutions.map((sol) => {
                const Icon = sol.icon ? SOLUTION_ICONS[sol.icon] ?? Check : Check;
                const cardClass =
                  "flex items-start gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 min-h-0";
                const content = (
                  <>
                    <Icon
                      className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground mb-1">
                        {sol.heading}
                      </p>
                      <div className="text-[13px] leading-6 text-muted-foreground">
                        {sol.body}
                      </div>
                    </div>
                  </>
                );
                return sol.href ? (
                  <Link
                    key={sol.heading}
                    to={sol.href}
                    className={`${cardClass} text-foreground no-underline hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-colors`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={sol.heading} className={cardClass}>
                    {content}
                  </div>
                );
              })}
            </div>
          </section>

          <SectionDivider />

          {/* Outcomes — before/after illustrations */}
          {outcomes && outcomes.length > 0 && (
            <section className="mb-12">
              <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-2 flex items-center gap-2">
                <Scale className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
                Same question, different outcome
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground mb-6">
                Without a state layer, agents return stale or wrong data. With Neotoma, every
                response reads from versioned, schema-bound state.
              </p>
              <div className="grid grid-cols-1 gap-12">
                {outcomes.map(({ category, Icon, title, description, scenario }) => (
                  <div key={category} className="space-y-5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {category}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <OutcomeFailIllustration human={scenario.left} fail={scenario.fail} />
                      <OutcomeSuccessIllustration
                        human={scenario.left}
                        succeed={scenario.succeed}
                      />
                    </div>
                    <div className="space-y-1 px-0.5">
                      <p className="text-[14px] font-medium leading-5 text-foreground">{title}</p>
                      <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {outcomes && outcomes.length > 0 && <SectionDivider />}
          {keyDifferences && keyDifferences.points.length > 0 && (
            <section className="mb-12">
              <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
                <Scale className="h-4.5 w-4.5 text-indigo-500" aria-hidden />
                Key differences
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground mb-4">
                How your needs differ from{" "}
                {keyDifferences.comparedToHref ? (
                  <Link
                    to={keyDifferences.comparedToHref}
                    className="text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    {keyDifferences.comparedTo}
                  </Link>
                ) : (
                  keyDifferences.comparedTo
                )}
                :
              </p>
              <ul className="list-disc pl-5 space-y-2">
                {keyDifferences.points.map((point) => (
                  <li key={point} className="text-[14px] leading-6 text-foreground">{point}</li>
                ))}
              </ul>
            </section>
          )}

          {keyDifferences && keyDifferences.points.length > 0 && <SectionDivider />}

          {/* Data Types */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <Database className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
              Data types for better remembrance
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-4">
              The entity types you'll store most often.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 items-stretch">
              {dataTypeDetails.map((dt) => (
                <div
                  key={dt.type}
                  className="rounded-lg border border-border bg-card px-4 py-3 min-h-0"
                >
                  <p className="text-[13px] font-mono font-medium text-foreground mb-0.5">
                    {dt.type}
                  </p>
                  <p className="text-[12px] leading-5 text-muted-foreground">{dt.description}</p>
                </div>
              ))}
            </div>
          </section>

          <SectionDivider />

          {/* Closing */}
          <section className="mb-8 rounded-lg border border-border bg-muted/30 px-6 py-5">
            <p className="text-[15px] leading-7 text-foreground">{closingStatement}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/install"
                className="inline-flex items-center rounded-md border border-foreground bg-foreground px-4 py-2 text-[14px] font-medium text-background no-underline hover:bg-foreground/90 transition-colors"
              >
                Install in 5 minutes
              </Link>
              <Link
                to="/architecture"
                className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                View architecture →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
