import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  GitMerge,
  Hammer,
  KeyRound,
  Layers,
  Network,
  Scale,
  Shield,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "../SeoHead";
import { sendCtaClick, type CtaName } from "@/utils/analytics";

interface ComplexityRow {
  capability: string;
  buildDesc: string;
  neotomaDesc: string;
  Icon: typeof Clock;
}

const COMPLEXITY_ROWS: ComplexityRow[] = [
  {
    capability: "Temporal state reconstruction",
    buildDesc:
      "Query logs by timestamp, correlate across tables, hope the join covers every relevant mutation. Correctness depends on schema discipline you maintain yourself.",
    neotomaDesc:
      "Temporal snapshot query: what was the state of this entity at time T? Returns the exact fields, provenance, and version in one call.",
    Icon: Clock,
  },
  {
    capability: "Multi-writer conflict detection",
    buildDesc:
      "Add optimistic locking or conflict columns per table. Handle edge cases when two agents update overlapping fields in the same window. Scale conflict logic as agent count grows.",
    neotomaDesc:
      "Append-only observations from any number of writers. Deterministic reducer merges by priority, recency, or custom policy. Conflicts are visible, not silent.",
    Icon: GitMerge,
  },
  {
    capability: "Delegation and provenance chains",
    buildDesc:
      "Model delegation as foreign keys across session, agent, and decision tables. Write custom traversal queries for each hop. Maintain referential integrity as the schema evolves.",
    neotomaDesc:
      "Delegation chain is a first-class entity with observations per hop. Traverse from acting agent back to human origin via relationship queries.",
    Icon: Network,
  },
  {
    capability: "Policy version binding",
    buildDesc:
      "Store policy version ID alongside each decision. When policies change, manually correlate old decisions to old versions. Build rebase logic if auditors need counterfactual analysis.",
    neotomaDesc:
      "Each observation records the policy version, role bindings, and scope that produced it. Historical queries return the decision bound to the policy that governed it.",
    Icon: Shield,
  },
  {
    capability: "Cross-system entity correlation",
    buildDesc:
      "Map entity IDs across systems with custom sync pipelines. Deduplicate on ingest. Rebuild if upstream schemas change. Handle divergent update frequencies between sources.",
    neotomaDesc:
      "Schema-first extraction with hash-based entity IDs. Multiple sources create observations on the same entity. Reducer produces one canonical snapshot with full provenance.",
    Icon: Layers,
  },
];

interface AssessmentItem {
  question: string;
  detail: string;
}

const ASSESSMENT_ITEMS: AssessmentItem[] = [
  {
    question: "Multiple agents write to the same entities",
    detail:
      "Two or more agents update the same vendor, contract, case, or authorization record. That means changing state the business depends on, not just appending logs.",
  },
  {
    question: 'You need to answer "what was known at time T?"',
    detail:
      "Regulators, auditors, or incident responders ask what the system believed about an entity on a specific date: not the current state, but what it was then.",
  },
  {
    question: "Policies or rules change while agents hold active sessions",
    detail:
      "Authorization policies, scoring models, or business rules update mid-flight. Agents started under one version may now be operating under different constraints.",
  },
  {
    question: "Authority passes through more than one delegation hop",
    detail:
      "A user grants scope to an orchestrator, which delegates to a downstream agent, which acts. Reconstructing the chain from action back to human origin requires traversing multiple relationships.",
  },
  {
    question: "Decisions need post-hoc explanation with full inputs",
    detail:
      "When asked why a decision was made, the answer must include the specific data, policy version, agent context, and conflicting inputs at the time. A summary or current-state lookup is not enough.",
  },
];

interface VerticalExample {
  href: string;
  label: string;
  entity: string;
  easyBuild: string;
  hardBuild: string;
  accent: string;
  accentBorder: string;
  accentBg: string;
}

const VERTICAL_EXAMPLES: VerticalExample[] = [
  {
    href: "/agent-auth",
    label: "Agent Authorization",
    entity: "auth_decision",
    easyBuild: "Log allow/deny per request with timestamp and agent ID",
    hardBuild:
      "Reconstruct the policy version, delegation chain, consent grants, and scope constraints that produced a decision on March 12",
    accent: "text-blue-600 dark:text-blue-400",
    accentBorder: "border-blue-500/20",
    accentBg: "bg-blue-500/5",
  },
  {
    href: "/compliance",
    label: "Vendor Risk",
    entity: "vendor_risk_profile",
    easyBuild: "Store current risk score with updated_at timestamp",
    hardBuild:
      "Explain to a regulator what the system believed about a vendor when it approved them, including which agent assessed what and how conflicting signals were resolved",
    accent: "text-amber-600 dark:text-amber-400",
    accentBorder: "border-amber-500/20",
    accentBg: "bg-amber-500/5",
  },
  {
    href: "/contracts",
    label: "Contract Lifecycle",
    entity: "contract",
    easyBuild: "Track current terms with a version number column",
    hardBuild:
      "Diff any two points in a contract's history, trace which agent introduced which clause change, and reconstruct the obligations that were active on the signing date",
    accent: "text-indigo-600 dark:text-indigo-400",
    accentBorder: "border-indigo-500/20",
    accentBg: "bg-indigo-500/5",
  },
  {
    href: "/financial-ops",
    label: "Financial Ops",
    entity: "reconciliation",
    easyBuild: "Append ledger entries with transaction IDs",
    hardBuild:
      "Prove that a specific liability existed in the books on the audit date, trace every mutation that touched it, and show the reconciliation state at close",
    accent: "text-teal-600 dark:text-teal-400",
    accentBorder: "border-teal-500/20",
    accentBg: "bg-teal-500/5",
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
              When to build your own state layer{" "}
              <span className="text-muted-foreground">(and when not to)</span>
            </h1>
            <p className="text-[17px] leading-8 text-muted-foreground max-w-2xl">
              Building an audit trail is straightforward. Building a temporal state
              system that composes versioned entities, multi-writer conflict
              detection, and provenance chains into queryable state, then maintaining
              that system, is a different problem. This page helps you figure out
              which problem you have.
            </p>
          </section>

          {/* ── What's easy ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                What&apos;s straightforward
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                The part you should build yourself
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              If your requirements stop here, build it. A Postgres table, some
              append-only writes, and good indexing will serve you well. Neotoma
              is not the right tool for problems that don&apos;t need temporal state
              guarantees.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Decision logs",
                  desc: "Record allow/deny, agent ID, timestamp, and basic metadata for each decision your system makes.",
                  Icon: Database,
                },
                {
                  title: "Append-only event tables",
                  desc: "INSERT INTO events with structured payload. Immutable rows, auto-incrementing IDs, created_at timestamps.",
                  Icon: Code2,
                },
                {
                  title: "Basic provenance",
                  desc: "Store who did what and when. Agent name, action type, target entity, timestamp. Standard schema.",
                  Icon: CheckCircle2,
                },
                {
                  title: "Single-system audit trails",
                  desc: "One auth service, one policy engine, one writer. Query by entity and time range. Export for auditors.",
                  Icon: Hammer,
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

          {/* ── Five capabilities ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Where complexity compounds
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                The devil is in the details
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              On a whiteboard, the shape of the problem looks obvious: record each
              decision, who made it, and when. Storing one auth decision is a
              database insert. Temporal query correctness across policy versions,
              consent lifecycle reconstruction, delegation chain traversal, and
              multi-writer merge semantics are each simple in isolation. Combined
              under production load with evolving schemas, these are the details
              that consume engineering quarters.
            </p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-5">
              <div className="flex items-start gap-3">
                <KeyRound
                  className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
                  aria-hidden
                />
                <p className="text-[14px] leading-6 text-muted-foreground min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    A familiar pattern:
                  </span>{" "}
                  OAuth looks like &ldquo;redirect and get a token.&rdquo; The real
                  work is refresh flows, PKCE, token revocation, multi-tenant
                  consent, and scope narrowing. Identity providers exist because
                  those details are hard enough to justify a purpose-built system.
                  The same logic applies to versioned state for agent decisions.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {COMPLEXITY_ROWS.map(({ capability, buildDesc, neotomaDesc, Icon }) => (
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
                        <Wrench className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                          Build it
                        </span>
                      </div>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {buildDesc}
                      </p>
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[11px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          Neotoma
                        </span>
                      </div>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {neotomaDesc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Assessment ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Self-assessment
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                How many of these describe your system?
              </h2>
            </div>
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
                  Build it. A well-designed event table and query layer will
                  serve your current needs. Revisit when your agent surface area
                  grows.
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
                  You&apos;re approaching the threshold. What you build now will
                  need rearchitecting as complexity grows. Evaluate whether the
                  maintenance cost is worth carrying.
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
                  You need a purpose-built state integrity layer. The
                  engineering cost of building and maintaining temporal state,
                  conflict detection, and provenance at this complexity level is
                  significant, and it&apos;s not your core product.
                </p>
              </div>
            </div>
          </section>

          {/* ── Vertical examples ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                By domain
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Where the line falls across verticals
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                The pattern is consistent: logging individual events is
                straightforward. Composing them into queryable temporal state is
                where the complexity lives.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {VERTICAL_EXAMPLES.map(
                ({
                  href,
                  label,
                  entity,
                  easyBuild,
                  hardBuild,
                  accent,
                  accentBorder,
                  accentBg,
                }) => (
                  <Link
                    key={href}
                    to={href}
                    className="group rounded-lg border border-border bg-card p-5 space-y-4 no-underline transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${accentBorder} ${accentBg}`}
                      >
                        <span
                          className={`text-[10px] font-mono ${accent}`}
                        >
                          {entity}
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </div>
                    <p className={`text-[14px] font-medium ${accent}`}>
                      {label}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        <p className="text-[13px] leading-5 text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            Easy to build:
                          </span>{" "}
                          {easyBuild}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        <p className="text-[13px] leading-5 text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            Hard to maintain:
                          </span>{" "}
                          {hardBuild}
                        </p>
                      </div>
                    </div>
                  </Link>
                ),
              )}
            </div>
            <div className="flex justify-center">
              <Link
                to="/verticals"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                See all verticals
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* ── The real question ── */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                The real question
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Building V1 is easy.{" "}
                <span className="text-muted-foreground">
                  Living with the details is the cost.
                </span>
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  Building V1 is easy
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "A decisions table with timestamp, agent, and outcome columns",
                    "An events table with append-only inserts",
                    "A query that filters by entity and time range",
                    "A nightly export for auditors",
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
                  This takes a few days. It solves the immediate need. If this is
                  all you need, genuinely, build it.
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  Maintaining it is the cost
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "Schema migrations as entity types evolve and new fields appear",
                    "Conflict handling as the second and third writer agents come online",
                    "Temporal query correctness as policy versions stack up",
                    "Cross-system correlation as data flows from multiple sources",
                    "Reducer logic when auditors want deterministic reconstruction",
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
                  This is ongoing engineering alongside your core product. The
                  question is whether temporal state infrastructure is where your
                  team should spend its maintenance budget.
                </p>
              </div>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="pt-20 text-center space-y-8">
            <div className="space-y-4 max-w-xl mx-auto">
              <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em]">
                Past the threshold?
              </h2>
              <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground">
                Neotoma is an open-source, deterministic state layer designed for
                exactly the complexity described above. Install it in five
                minutes and see what versioned entity state looks like for your
                domain.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link
                to="/install"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-foreground bg-foreground px-6 py-2.5 text-[14px] font-medium text-background no-underline hover:opacity-90 transition-opacity"
                onClick={() =>
                  sendCtaClick("build_vs_buy_install_neotoma" as CtaName)
                }
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
                to="/verticals"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Explore verticals
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-muted-foreground">
              {["Open-source", "MIT-licensed", "5-minute install", "Fully reversible"].map(
                (label) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{label}</span>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
