import { Fragment } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileDown,
  GitBranch,
  GitMerge,
  Layers,
  Network,
  Rss,
  Scale,
  ScrollText,
  Shield,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { SeoHead } from "../SeoHead";
import { sendCtaClick } from "@/utils/analytics";

interface GapRow {
  capability: string;
  observabilityDesc: string;
  stateIntegrityDesc: string;
  Icon: typeof Clock;
}

const GAP_ROWS: GapRow[] = [
  {
    capability: "Knowing historical state",
    observabilityDesc:
      "Query event logs by entity and timestamp. See what happened: which agents wrote, what payloads they sent, when. Reconstruct a timeline from individual events.",
    stateIntegrityDesc:
      "Reconstruct the composed entity state at any point in time: all fields, all writers merged, conflicts resolved deterministically. Not what happened, but what was true.",
    Icon: Clock,
  },
  {
    capability: "Multi-writer consistency",
    observabilityDesc:
      "Log writes from each agent independently. See that two agents updated the same entity in the same window. Alert on conflicts after they happen.",
    stateIntegrityDesc:
      "Deterministic reducer merges observations by priority, recency, or custom policy. The composed snapshot is the same regardless of query order. Conflicts are resolved, not just detected.",
    Icon: GitMerge,
  },
  {
    capability: "Provenance across hops",
    observabilityDesc:
      "Trace requests across services with correlation IDs. See the path a decision took through your system. Build dashboards showing delegation and approval patterns.",
    stateIntegrityDesc:
      "Traverse from any outcome back to its origin through a chain of delegations, approvals, or handoffs. Bind each hop to the entity state and policy version at that moment. Prove the chain is complete.",
    Icon: Network,
  },
  {
    capability: "Version-bound decisions",
    observabilityDesc:
      "Log which policy or rule version was active when a decision ran. Query by policy ID to find affected decisions. Build reports on policy coverage.",
    stateIntegrityDesc:
      "Each observation records the policy version, role bindings, and constraints that produced it. Historical queries return the decision bound to the exact context that governed it. Counterfactual queries are supported.",
    Icon: Shield,
  },
  {
    capability: "Cross-system entity identity",
    observabilityDesc:
      "Track entity IDs per system. Build sync pipelines to correlate records across sources. Deduplicate on ingest. Monitor for drift between systems.",
    stateIntegrityDesc:
      "Hash-based entity IDs resolve the same entity across systems. Multiple sources produce observations on one entity. Reducer composes one canonical snapshot with provenance from every source.",
    Icon: Layers,
  },
];

interface AssessmentItem {
  question: string;
  detail: string;
}

const ASSESSMENT_ITEMS: AssessmentItem[] = [
  {
    question: "Multiple sources write to the same entities",
    detail:
      "Chat agents, cron jobs, CLI scripts, or services all touch the same contact, task, or ledger row. Logging each write is not the same as a single deterministic snapshot everyone reads-especially when tools disagree.",
  },
  {
    question: "You need the composed state at a specific point in time",
    detail:
      "Not only which events fired, but what was true: the full derived state from every observation up to that moment. That is how you answer “what did the stack believe last Tuesday?”-for yourself, an auditor, or a postmortem-not just “what got logged.”",
  },
  {
    question: "Rules or context change while entities have active state",
    detail:
      "Prompt packs, merge policies, scoring rules, authorization gates, or contract terms change while records stay live. You need which version governed which outcome, and what the answer would have been under the prior version.",
  },
  {
    question: "Actions flow through multiple systems, tools, or delegation hops",
    detail:
      "An orchestrator, IDE agent, and background worker each contribute. Reconstructing the full chain-and proving it is complete-means traversing provenance on entities, not only correlating traces.",
  },
  {
    question: "Explanation requires the full input context, not a summary",
    detail:
      "Debugging drift, contradictions, or non-reproducible runs requires the exact entity fields, schema or policy version, writer context, and conflict resolution at that moment-not a terse log line or today’s live row.",
  },
];

interface EntityTypeExample {
  href: string;
  guideLabel: string;
  observabilityCovers: string;
  stateIntegrityGap: string;
  accent: string;
}

/** Examples aligned with primary ICP data priorities and schema-first entity types (see docs/subsystems/record_types.md). */
const ENTITY_TYPE_EXAMPLES: EntityTypeExample[] = [
  {
    href: "/types/contacts",
    guideLabel: "Contacts",
    observabilityCovers:
      "Log each upsert from chat, CRM import, or script with timestamps and source labels",
    stateIntegrityGap:
      "One canonical person or company record across tools, with deterministic merge when two agents update the same identity on the same day",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    href: "/types/tasks",
    guideLabel: "Tasks",
    observabilityCovers:
      "Append status changes to an activity feed: opened, reassigned, completed, with agent IDs",
    stateIntegrityGap:
      "Composed task state (owner, status, due date) after concurrent edits from scheduled jobs and interactive agents-same answer on every read",
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    href: "/types/transactions",
    guideLabel: "Transactions",
    observabilityCovers:
      "Record ingest events, file uploads, and reconciliation checks with correlation IDs",
    stateIntegrityGap:
      "What your agents treated as settled financial truth on a given date, with every observation that fed the snapshot traceable",
    accent: "text-teal-600 dark:text-teal-400",
  },
  {
    href: "/types/contracts",
    guideLabel: "Contracts",
    observabilityCovers:
      "Log clause edits, reviews, and signatures with versions and timestamps",
    stateIntegrityGap:
      "Reconstruct obligations and terms as they existed on signing day, including which change came from which writer and how conflicts were reduced",
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  {
    href: "/types/decisions",
    guideLabel: "Decisions",
    observabilityCovers:
      "Store decision logs and rationale snippets as unstructured events or documents",
    stateIntegrityGap:
      "Bind rationale to versioned entity state so “why we chose X” replays with the same facts the agent had then-not the notebook file as it reads today",
    accent: "text-violet-600 dark:text-violet-400",
  },
  {
    href: "/types/events",
    guideLabel: "Events",
    observabilityCovers:
      "Track calendar syncs, invites, and reschedule notifications in order",
    stateIntegrityGap:
      "Composed meeting or milestone state when agents and calendars both mutate attendees, time, or status-without last-write-wins ambiguity",
    accent: "text-amber-600 dark:text-amber-400",
  },
];

export function BuildVsBuyPage() {
  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-6 py-20 md:px-12 lg:px-16">

          {/* ── Hero ── */}
          <section className="space-y-6 pb-20 border-b border-border">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1">
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-muted-foreground">
                Build vs Buy
              </span>
            </div>
            <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight max-w-3xl">
              When to add a state integrity layer{" "}
              <span className="text-muted-foreground">
                (and when observability is enough)
              </span>
            </h1>
            <p className="text-[17px] leading-8 text-muted-foreground max-w-2xl">
              If you run agents across sessions and tools-IDE, chat, cron, CLI-you
              already pay the tax of re-prompting, manual sync, and homegrown
              markdown or JSON workarounds. Logging what ran is a solved
              problem. Knowing the{" "}
              <span className="text-foreground/90">composed, replayable state</span>{" "}
              of each entity (contacts, tasks, money facts, decisions) across
              those writers is a different problem. This page separates the two.
            </p>
          </section>

          <nav className="rounded-lg border toc-panel p-4 mb-8 mt-12">
            <p className="text-[14px] font-medium mb-2">On this page</p>
            <ul className="list-none pl-0 space-y-1 text-[14px]">
              <li><a href="#how-agent-memory-infrastructure-evolves" className="text-foreground underline hover:text-foreground">How agent memory infrastructure evolves</a></li>
              <li><a href="#what-existing-tools-cover-well" className="text-foreground underline hover:text-foreground">What existing tools cover well</a></li>
              <li><a href="#where-observability-ends-and-state-integrity-begins" className="text-foreground underline hover:text-foreground">Where observability ends and state integrity begins</a></li>
              <li><a href="#how-many-of-these-describe-your-system" className="text-foreground underline hover:text-foreground">How many of these describe your system?</a></li>
              <li><a href="#where-the-line-shows-up-in-typed-state" className="text-foreground underline hover:text-foreground">Where the line shows up in typed state</a></li>
              <li><a href="#observability-tells-you-what-happened" className="text-foreground underline hover:text-foreground">Observability tells you what happened</a></li>
              <li><a href="#between-your-agents-and-your-database" className="text-foreground underline hover:text-foreground">Between your agents and your database</a></li>
              <li><a href="#every-day-without-write-integrity" className="text-foreground underline hover:text-foreground">Every day without write integrity</a></li>
            </ul>
          </nav>

          {/* ── Where are you? ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Where are you?
              </p>
              <h2 id="how-agent-memory-infrastructure-evolves" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                How agent memory infrastructure evolves
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Most teams follow the same progression. The pain that drives
              adoption of a write-integrity layer is invisible at first and
              unavoidable later.
            </p>
            <div className="grid gap-3">
              {[
                {
                  phase: "1",
                  label: "Just use the database",
                  desc: "Memory bolted onto Postgres, Redis, or a vector store. Works for simple use cases. Nobody can answer what the agent learned, when, from what source, or whether it contradicted last week\u2019s state\u2014but the system doesn\u2019t visibly break.",
                  accent: "border-emerald-500/20 bg-emerald-500/[0.03]",
                  accentText: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  phase: "2",
                  label: "Retrieval-optimization layer",
                  desc: "Dedicated memory abstraction focused on retrieval quality: right context, right time. Solves legible pain (bad recall, bloated context). Leaves the write path unaudited\u2014LLM-mediated summaries treated as ground truth with no provenance.",
                  accent: "border-amber-500/20 bg-amber-500/[0.03]",
                  accentText: "text-amber-600 dark:text-amber-400",
                },
                {
                  phase: "3",
                  label: "The trust crisis",
                  desc: "Agents move from low-stakes assistants to high-stakes actors: money, procurement, compliance, long-running autonomy. The question shifts from \u201Cdid the agent retrieve the right thing?\u201D to \u201Ccan I prove what the agent knew, when, and whether that knowledge was legitimate?\u201D",
                  accent: "border-orange-500/20 bg-orange-500/[0.03]",
                  accentText: "text-orange-600 dark:text-orange-400",
                },
                {
                  phase: "4",
                  label: "Write integrity or retrofit",
                  desc: "Teams that adopted append-only, schema-constrained state early have a compounding advantage: every agent write is traceable from day one. Teams that retrofit have a gap in their audit history\u2014everything before the migration is a black box.",
                  accent: "border-rose-500/20 bg-rose-500/[0.03]",
                  accentText: "text-rose-600 dark:text-rose-400",
                },
              ].map(({ phase, label, desc, accent, accentText }) => (
                <div
                  key={phase}
                  className={`rounded-lg border ${accent} p-5 space-y-2`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[12px] font-mono ${accentText}`}>
                      Phase {phase}
                    </span>
                    <span className="text-[14px] font-medium text-foreground">
                      {label}
                    </span>
                  </div>
                  <p className="text-[13px] leading-6 text-muted-foreground">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-6 text-muted-foreground">
              Building multi-agent systems?{" "}
              <Link
                to="/multi-agent-state"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                See how shared state accelerates the inflection point
              </Link>
              .
            </p>
          </section>

          {/* ── What's solved ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Already solved
              </p>
              <h2 id="what-existing-tools-cover-well" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                What existing tools cover well
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Audit and observability have mature solutions. If your
              requirements stop at knowing what happened (who did what, when,
              and in what order) you do not need Neotoma. These are real,
              valuable capabilities, and they are handled.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Event logging",
                  desc: "Append-only event streams with structured payloads. Datadog, Splunk, ELK, or a Postgres table: recording what happened is a solved problem.",
                  Icon: ScrollText,
                },
                {
                  title: "Observability and alerting",
                  desc: "Real-time visibility into agent behavior: metrics, traces, anomaly detection. Mature tooling covers this across every stack.",
                  Icon: Activity,
                },
                {
                  title: "Activity feeds",
                  desc: "Show users or operators what's happening in their systems. Chronological, filterable, exportable. Standard product feature with standard solutions.",
                  Icon: Rss,
                },
                {
                  title: "Compliance exports",
                  desc: "On-demand or scheduled data exports for auditors. Query by entity and time range, package as CSV or PDF. Straightforward with any data store.",
                  Icon: FileDown,
                },
              ].map(({ title, desc, Icon }) => (
                <div
                  key={title}
                  className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[14px] font-medium text-foreground">
                      {title}
                    </span>
                  </div>
                  <p className="text-[13px] leading-6 text-muted-foreground">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── The gap ── */}
          <section className="py-20 border-b border-border space-y-8">
            <p className="text-[11px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400">
              The gap
            </p>
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex items-center gap-2 w-full text-left focus:outline-none">
                  <h2 id="where-observability-ends-and-state-integrity-begins" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                    Where observability ends and state integrity begins
                  </h2>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-8 pt-8">
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Observability shows you what happened. State integrity tells you
              what was true: the composed entity state at any moment, with
              deterministic reconstruction guarantees-what you need when agents
              must not contradict themselves across sessions and tools without
              you re-typing context every time. The second problem does not reduce
              to the first.
            </p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-5">
              <div className="flex items-start gap-3">
                <GitBranch
                  className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
                  aria-hidden
                />
                <p className="text-[14px] leading-6 text-muted-foreground min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    An analogy:
                  </span>{" "}
                  Saving files is trivial. Git exists because knowing the
                  composed state of a codebase at any commit, with blame, merge
                  history, and conflict resolution, is a qualitatively different
                  problem from saving files. The same gap exists between logging
                  what your agents did and knowing the composed state of your
                  entities at any point in time.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {GAP_ROWS.map(
                ({ capability, observabilityDesc, stateIntegrityDesc, Icon }) => (
                  <div
                    key={capability}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
                      <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="text-[15px] font-medium text-foreground">
                        {capability}
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                      <div className="p-5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-[11px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Observability covers
                          </span>
                        </div>
                        <p className="text-[13px] leading-6 text-muted-foreground">
                          {observabilityDesc}
                        </p>
                      </div>
                      <div className="p-5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] font-mono uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            State integrity adds
                          </span>
                        </div>
                        <p className="text-[13px] leading-6 text-muted-foreground">
                          {stateIntegrityDesc}
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* ── Assessment ── */}
          <section className="py-20 border-b border-border space-y-8">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Self-assessment
            </p>
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex items-center gap-2 w-full text-left focus:outline-none">
                  <h2 id="how-many-of-these-describe-your-system" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                    How many of these describe your system?
                  </h2>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-8 pt-8">
              <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                A useful diagnostic: what are you doing today to compensate for
                unreliable or missing agent state? Each item below is a structural
                signal-not a vendor checklist.
              </p>
            <div className="space-y-3">
              {ASSESSMENT_ITEMS.map(({ question, detail }, idx) => (
                <div
                  key={question}
                  className="rounded-lg border border-border bg-card p-5 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-mono text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="text-[15px] font-medium text-foreground leading-snug">
                        {question}
                      </p>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[14px] font-medium text-foreground">
                    0-1 conditions
                  </span>
                </div>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  Observability is enough. Invest in good event logging and
                  dashboards. Revisit if agents gain autonomy, you add tools, or
                  you need stronger audit and replay.
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-[14px] font-medium text-foreground">
                    2-3 conditions
                  </span>
                </div>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  You&apos;re at the boundary. You can approximate state
                  integrity on top of observability tools, but the gap widens
                  as writers, policies, and entity types multiply.
                </p>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  <span className="text-[14px] font-medium text-foreground">
                    4-5 conditions
                  </span>
                </div>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  You need a state integrity layer. The gap between what
                  observability shows you and what you need to know is
                  structural, not incremental.
                </p>
              </div>
            </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* ── Entity type examples ── */}
          <section className="py-20 border-b border-border space-y-8">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              By entity type
            </p>
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex items-center gap-2 w-full text-left focus:outline-none">
                  <h2 id="where-the-line-shows-up-in-typed-state" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                    Where the line shows up in typed state
                  </h2>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-8 pt-8">
              <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                Neotoma is schema-first: each{" "}
                <span className="text-foreground/90">entity type</span> carries
                observations that reduce to a deterministic snapshot. The same
                observability-vs-integrity split appears whether the record is a
                contact, a task, or a transaction-see the guides for store and
                retrieval patterns.
              </p>
            <div className="grid gap-4 md:grid-cols-2">
              {ENTITY_TYPE_EXAMPLES.map(
                ({
                  href,
                  guideLabel,
                  observabilityCovers,
                  stateIntegrityGap,
                  accent,
                }) => (
                  <Link
                    key={href}
                    to={href}
                    className="group rounded-lg border border-border bg-card p-5 space-y-4 no-underline transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[14px] font-medium ${accent}`}>
                        {guideLabel}
                      </p>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        <p className="text-[13px] leading-5 text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            Observability covers:
                          </span>{" "}
                          {observabilityCovers}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        <p className="text-[13px] leading-5 text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            State integrity gap:
                          </span>{" "}
                          {stateIntegrityGap}
                        </p>
                      </div>
                    </div>
                  </Link>
                ),
              )}
            </div>
            <nav
              className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-2 text-[13px] text-muted-foreground"
              aria-label="Record types"
            >
              <span className="text-[11px] font-mono uppercase tracking-widest shrink-0">
                Guides
              </span>
              {ENTITY_TYPE_EXAMPLES.map(({ href, guideLabel }, i) => (
                <Fragment key={href}>
                  {i > 0 ? (
                    <span className="select-none text-border" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <Link
                    to={href}
                    className="text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    {guideLabel}
                  </Link>
                </Fragment>
              ))}
            </nav>
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* ── The real question ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                The real question
              </p>
              <h2 id="observability-tells-you-what-happened" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Observability tells you what happened.{" "}
                <span className="text-muted-foreground">
                  State integrity proves what was true.
                </span>
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  What observability gives you
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "A complete record of every event, decision, and action in your system",
                    "Real-time dashboards and alerting on agent behavior",
                    "Searchable logs by entity, agent, time range, and event type",
                    "Exportable audit trails for compliance and incident response",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
                    >
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] leading-6 text-muted-foreground pt-2 border-t border-border">
                  If this is all you need, you&apos;re set. Existing tools and
                  straightforward engineering cover these requirements well.
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  What state integrity adds
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "Deterministic reconstruction of entity state at any historical point",
                    "Multi-writer conflict resolution with guaranteed consistency",
                    "Every decision bound to the exact policy version and context that produced it",
                    "Provenance chains traversable from outcome back to origin",
                    "Cross-system entity correlation into one canonical snapshot",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] leading-6 text-muted-foreground pt-2 border-t border-border">
                  This is the gap: not a harder version of observability, but a
                  different requirement that existing tools do not address.
                </p>
              </div>
            </div>
          </section>

          {/* ── Integration framing ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Integration model
              </p>
              <h2 id="between-your-agents-and-your-database" className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Between your agents and your database{" "}
                <span className="text-muted-foreground">
                  (not instead of it)
                </span>
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Your existing Postgres, MySQL, or managed database stays as the
              system of record for business data. Neotoma adds a layer for a
              category of data that did not exist before agents started writing
              autonomously: observations, inferences, entity resolutions, and
              decisions{"\u2014"}with append-only provenance, schema constraints,
              and deterministic reduction.
            </p>
          </section>

          {/* ── CTA ── */}
          <section className="pt-20 text-center space-y-8">
            <div className="space-y-4 max-w-xl mx-auto">
              <h2 id="every-day-without-write-integrity" className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em]">
                Every day without write integrity is a gap in your audit history
              </h2>
              <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground">
                Neotoma is an open-source state integrity layer: deterministic
                temporal reconstruction, multi-writer consistency, and
                version-bound provenance. Install in five minutes. Everything
                your agents write from that point forward is traceable,
                auditable, and consistent. Everything before is a black box.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link
                to="/install"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-foreground bg-foreground px-6 py-2.5 text-[14px] font-medium text-background no-underline hover:opacity-90 transition-opacity"
                onClick={() => sendCtaClick("install")}
              >
                Install Neotoma
              </Link>
              <Link
                to="/architecture"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Read the architecture
              </Link>
              <Link
                to="/types/contacts"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Record types
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-muted-foreground">
              {[
                "Open-source",
                "MIT-licensed",
                "5-minute install",
                "Fully reversible",
              ].map((label) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
