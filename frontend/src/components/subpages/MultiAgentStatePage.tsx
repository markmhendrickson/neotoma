import {
  AlertTriangle,
  Check,
  GitBranch,
  Layers,
  Network,
  Radio,
  Server,
  Shield,
  Workflow,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "../SeoHead";
import { sendCtaClick } from "@/utils/analytics";

interface FailureMode {
  title: string;
  description: string;
  withoutIntegrity: string;
  withIntegrity: string;
  Icon: typeof Zap;
}

const FAILURE_MODES: FailureMode[] = [
  {
    title: "Contradiction amplification",
    description:
      "Two agents store conflicting facts about the same entity from different interactions. A third agent takes action on whichever fact the retrieval layer surfaces, with no basis for adjudicating between them.",
    withoutIntegrity:
      "No forensic path. The retrieval layer returns one version; the contradiction is invisible until downstream consequences surface.",
    withIntegrity:
      "Append-only observation log with timestamps and source attribution. Both facts are preserved. The reducer surfaces the conflict deterministically.",
    Icon: Zap,
  },
  {
    title: "Silent overwrite cascades",
    description:
      "Agent A updates a record. Agent B, operating on a stale read, writes its own update that implicitly reverts Agent A's change. Neither agent throws an error.",
    withoutIntegrity:
      "In a mutable database, this is nearly undetectable. The overwrite looks like a normal write. Previous state is gone.",
    withIntegrity:
      "In an append-only log with hash-linked observations, implicit overwrites are structurally impossible. Every write is a new observation, not a mutation.",
    Icon: GitBranch,
  },
  {
    title: "Trust boundary collapse",
    description:
      "Shared state implicitly means each agent trusts the other's writes. But agents have different capabilities, prompt contexts, and error profiles.",
    withoutIntegrity:
      "A financial analysis agent and a support chatbot have equal write authority over the same entity state. No schema constraint distinguishes them.",
    withIntegrity:
      "Schema-constrained writes enforce what each agent can write. Observations carry writer identity and context. The reducer applies priority rules.",
    Icon: Shield,
  },
];

interface Topology {
  label: string;
  timeframe: string;
  description: string;
  writeRisk: "low" | "medium" | "high" | "critical";
  example: string;
  Icon: typeof Server;
}

const TOPOLOGIES: Topology[] = [
  {
    label: "Hub-and-spoke",
    timeframe: "Current dominant pattern",
    description:
      "One primary agent faces the user and delegates subtasks to specialized agents. Shared state is the primary agent's context window. Subordinate agents are stateless tool calls.",
    writeRisk: "low",
    example:
      "Cursor delegates to code, research, and analysis sub-agents. The hub manages all state.",
    Icon: Server,
  },
  {
    label: "Pipeline agents",
    timeframe: "Now \u2013 12 months",
    description:
      "Sequential handoffs where each agent processes and enriches a work item. Each agent reads state written by the previous agent and appends its own.",
    writeRisk: "medium",
    example:
      "Lead qualification \u2192 company research \u2192 outreach drafting \u2192 meeting scheduling. A bad write at step 2 calibrates every downstream agent wrong.",
    Icon: Workflow,
  },
  {
    label: "Event-driven with shared context",
    timeframe: "12 \u2013 24 months",
    description:
      "Multiple agents subscribe to events from a shared environment, maintain their own perspectives, and write observations back to a common store. No orchestrator.",
    writeRisk: "high",
    example:
      "CRM agents, support agents, and billing agents all react to customer events independently. Concurrent writes from different interpretive frameworks, no coordinator to catch contradictions.",
    Icon: Radio,
  },
  {
    label: "Persistent autonomous agents",
    timeframe: "18 \u2013 36 months",
    description:
      "Agents running continuously, maintaining evolving world models, periodically synchronizing with other agents or a shared truth store. Context windows cannot serve as memory.",
    writeRisk: "critical",
    example:
      "Always-on monitoring agents maintaining state across days or weeks, synchronizing findings with planning agents that act on the accumulated picture.",
    Icon: Network,
  },
];

function riskColor(risk: Topology["writeRisk"]) {
  switch (risk) {
    case "low":
      return "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.03]";
    case "medium":
      return "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/[0.03]";
    case "high":
      return "text-orange-600 dark:text-orange-400 border-orange-500/20 bg-orange-500/[0.03]";
    case "critical":
      return "text-rose-600 dark:text-rose-400 border-rose-500/20 bg-rose-500/[0.03]";
  }
}

function riskLabel(risk: Topology["writeRisk"]) {
  switch (risk) {
    case "low":
      return "Low write risk";
    case "medium":
      return "Medium write risk";
    case "high":
      return "High write risk";
    case "critical":
      return "Critical write risk";
  }
}

export function MultiAgentStatePage() {
  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-6 py-20 md:px-12 lg:px-16">
          {/* Hero */}
          <section className="space-y-6 pb-20 border-b border-border">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium text-muted-foreground">
                Multi-Agent State
              </span>
            </div>
            <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight max-w-3xl">
              When agents share state,{" "}
              <span className="text-muted-foreground">
                write integrity stops being optional
              </span>
            </h1>
            <p className="text-[17px] leading-8 text-muted-foreground max-w-2xl">
              A single agent writing to a single memory store degrades
              gracefully: bad writes erode quality over time. When multiple
              agents write to shared state, one bad observation propagates at
              machine speed, triggering downstream actions before any human can
              intervene. The failure mode shifts from gradual drift to cascade
              failure.
            </p>
          </section>

          {/* Why single-agent masks the problem */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                The masking effect
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Single-agent systems hide write-integrity failures
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              With one agent writing to one memory store, write corruption
              degrades quality slowly. The agent summarizes an observation
              slightly wrong, overwrites an entity attribute, or stores
              contradictory facts. The system still works{"\u2014"}it just gets
              less reliable over time. The memory layer never gets blamed because
              the failure looks like an LLM problem.
            </p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
                  aria-hidden
                />
                <p className="text-[14px] leading-6 text-muted-foreground min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    Retrieval pain is legible; write corruption is not.
                  </span>{" "}
                  Developers notice when the agent forgets or retrieves the
                  wrong thing. They do not notice when the agent acts
                  confidently on state that was corrupted at write time{"\u2014"}
                  until downstream consequences surface.
                </p>
              </div>
            </div>
          </section>

          {/* Three failure modes */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-rose-600 dark:text-rose-400">
                Failure modes
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                What breaks when agents share state
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              When Agent A writes observations that Agent B reads and acts on, a
              fundamentally different failure topology emerges. These are not
              edge cases{"\u2014"}they are structural properties of any
              multi-writer system without integrity guarantees.
            </p>
            <div className="space-y-4">
              {FAILURE_MODES.map(
                ({
                  title,
                  description,
                  withoutIntegrity,
                  withIntegrity,
                  Icon,
                }) => (
                  <div
                    key={title}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
                      <Icon className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="text-[15px] font-medium text-foreground">
                        {title}
                      </span>
                    </div>
                    <p className="px-5 pt-4 pb-2 text-[14px] leading-6 text-muted-foreground">
                      {description}
                    </p>
                    <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border border-t border-border">
                      <div className="p-5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-rose-500" />
                          <span className="text-[11px] font-mono uppercase tracking-wide text-rose-600 dark:text-rose-400">
                            Without write integrity
                          </span>
                        </div>
                        <p className="text-[13px] leading-6 text-muted-foreground">
                          {withoutIntegrity}
                        </p>
                      </div>
                      <div className="p-5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span className="text-[11px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            With write integrity
                          </span>
                        </div>
                        <p className="text-[13px] leading-6 text-muted-foreground">
                          {withIntegrity}
                        </p>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>

          {/* Cascade scenario */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Cascade example
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                How one bad write triggers a chain reaction
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              A SaaS company runs three agents sharing state about customer
              accounts: inbound support, account health scoring, and
              renewal/upsell recommendations.
            </p>
            <div className="space-y-3">
              {[
                {
                  step: 1,
                  agent: "Support agent",
                  action:
                    'Processes a frustrated customer and stores: "customer expressed dissatisfaction with pricing, considering alternatives."',
                  problem:
                    "The customer was frustrated with a billing error, not pricing. The LLM-mediated extraction compressed the interaction into a misleading summary.",
                },
                {
                  step: 2,
                  agent: "Health-scoring agent",
                  action:
                    'Reads the support observation, downgrades the account, stores: "high churn risk, recommend retention intervention."',
                  problem:
                    "Acted on unfaithful source data. The downgrade is a correct inference from wrong premises.",
                },
                {
                  step: 3,
                  agent: "Renewal agent",
                  action:
                    "Reads the downgraded score, generates and sends a discount offer\u2014within minutes, no human in the loop.",
                  problem:
                    "Retrieval worked at every step. The failure was in the write. Nothing in the system could trace the chain from bad observation to wrong action.",
                },
              ].map(({ step, agent, action, problem }) => (
                <div
                  key={step}
                  className="rounded-lg border border-border bg-card p-5 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-mono text-muted-foreground">
                      {step}
                    </span>
                    <div className="space-y-1">
                      <p className="text-[15px] font-medium text-foreground leading-snug">
                        {agent}
                      </p>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {action}
                      </p>
                      <p className="text-[13px] leading-6 text-rose-600 dark:text-rose-400">
                        {problem}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <p className="text-[15px] font-medium text-foreground">
                What write integrity changes
              </p>
              <ul className="list-none pl-0 space-y-2.5">
                {[
                  "Every observation links to its source interaction, not a summarized derivative",
                  "The health-scoring agent sees the raw observation with provenance, not a flat fact",
                  "Contradiction between billing-error and pricing-dissatisfaction surfaces as a conflict, not a silent overwrite",
                  "The full causal chain from observation to action is traversable after the fact",
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
            </div>
          </section>

          {/* Topology progression */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Multi-agent topologies
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                How multi-agent systems emerge{" "}
                <span className="text-muted-foreground">
                  (and where database decisions lock in)
                </span>
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Most multi-agent systems are not designed as multi-agent
              systems. They accrete: one agent for support, another for ops,
              then someone connects them. Database choices made at topology 1
              are baked in by topology 3. Migrating from mutable to
              append-only state is a rearchitecture, not a library swap.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {TOPOLOGIES.map(
                ({
                  label,
                  timeframe,
                  description,
                  writeRisk,
                  example,
                  Icon,
                }) => (
                  <div
                    key={label}
                    className={`rounded-lg border p-5 space-y-3 ${riskColor(writeRisk)}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-[14px] font-medium text-foreground">
                          {label}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono uppercase tracking-wide">
                        {riskLabel(writeRisk)}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {timeframe}
                    </p>
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      {description}
                    </p>
                    <p className="text-[12px] leading-5 text-muted-foreground/80 italic">
                      {example}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>

          {/* Integration surface */}
          <section className="py-20 border-b border-border space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                Integration model
              </p>
              <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                Between your agents and your database{" "}
                <span className="text-muted-foreground">
                  (not instead of it)
                </span>
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              Your existing database remains the system of record for business
              data: customer records, transactions, product catalog.
              Agent-generated state{"\u2014"}observations, inferences, entity
              resolutions, decisions{"\u2014"}lives in a purpose-built write-integrity
              layer.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  Human-written business data
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "Customer records, product catalog, pricing",
                    "Transactions, invoices, financial ledger",
                    "Configuration, feature flags, system settings",
                    "Content, documents, media assets",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
                    >
                      <span className="text-[13px] text-muted-foreground/60 mt-0.5 shrink-0">
                        {"\u2192"}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] leading-6 text-muted-foreground pt-2 border-t border-border">
                  Stays in your existing Postgres, MySQL, or managed database.
                  Mutable CRUD is appropriate here.
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-6 space-y-4">
                <p className="text-[15px] font-medium text-foreground">
                  Agent-written observational state
                </p>
                <ul className="list-none pl-0 space-y-2.5">
                  {[
                    "Observations from agent interactions",
                    "Inferences, extractions, entity resolutions",
                    "Decisions with provenance chains",
                    "Cross-agent entity state and conflict resolution",
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
                  Belongs in a write-integrity layer: append-only,
                  schema-constrained, provenance-tracked, deterministically
                  reducible.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="pt-20 text-center space-y-8">
            <div className="space-y-4 max-w-xl mx-auto">
              <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em]">
                Every observation is traceable from day one
              </h2>
              <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground">
                Teams that adopt write integrity early gain a compounding
                advantage: every agent write is auditable and consistent from
                the start. Teams that retrofit have a gap in their audit
                history{"\u2014"}everything before the migration is a black box.
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
                to="/build-vs-buy"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Build vs buy assessment
              </Link>
              <Link
                to="/architecture"
                className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Read the architecture
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
