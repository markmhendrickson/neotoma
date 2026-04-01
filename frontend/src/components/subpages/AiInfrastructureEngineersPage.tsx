import { GitBranch, Eye, ShieldCheck, RotateCcw } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "debugging-infrastructure")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Reproducibility",
    Icon: GitBranch,
    title: "Same pipeline, different results",
    description:
      "Two runs of the same pipeline with identical inputs returned different state. Without versioned state, there was no way to detect or explain the drift.",
    scenario: {
      left: "Replay yesterday's ingestion pipeline.",
      fail: "Pipeline completed. 3 entity conflicts unresolved.",
      succeed: "Pipeline replayed deterministically. State matches v47.",
    },
  },
  {
    category: "Visibility",
    Icon: Eye,
    title: "Invisible overwrite, broken downstream",
    description:
      "An upstream agent silently overwrote a shared record. Downstream consumers read stale data and produced incorrect output. The change was invisible.",
    scenario: {
      left: "What changed on entity acme-config since deploy?",
      fail: "No changes detected.",
      succeed: "2 mutations: field 'rate_limit' updated at 14:32, 'region' at 14:38.",
    },
  },
  {
    category: "Compliance & audit",
    Icon: ShieldCheck,
    title: "Missing provenance, failed audit",
    description:
      "An evaluation needed to trace an agent's output to its source data. Without an immutable log, the trail had to be reconstructed manually from scattered logs.",
    scenario: {
      left: "Trace output of eval run 2841 to source.",
      fail: "Source data unavailable. Log retention expired.",
      succeed: "Output traces to observations #4091, #4092. Full chain available.",
    },
  },
  {
    category: "State reconstruction",
    Icon: RotateCcw,
    title: "Can't reconstruct state after failure",
    description:
      "A production agent crashed mid-run. In-memory state was lost. Without an append-only log, there was no way to reconstruct what the agent knew at the time of failure.",
    scenario: {
      left: "Reconstruct agent state at 03:12 UTC crash.",
      fail: "State unavailable. Last checkpoint: 22:00 UTC.",
      succeed: "State reconstructed from 847 observations. Timeline to 03:12 ready.",
    },
  },
];

export function AiInfrastructureEngineersPage() {
  return (
    <IcpDetailPage
      profile={profile}
      openingHook={
        <p>
          You're in this mode when something breaks and you need to understand
          why. Your observability stack watches everything except the thing that
          matters: what the agent believed and why. Debugging means
          reconstructing truth from scattered logs and hoping to reproduce the
          issue. Neotoma gives you replayable state so debugging takes minutes,
          not days.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Same inputs always produce the same state - no silent drift", href: "/deterministic-state-evolution", linkTerm: "Same inputs always produce the same state" },
        { label: "Full provenance chain from agent outputs back to source data", href: "/auditable-change-log", linkTerm: "Full provenance chain" },
        { label: "Replayable timelines for debugging production failures", href: "/replayable-timeline", linkTerm: "Replayable timelines" },
        { label: "Validation at write time so bad data is rejected before it spreads", href: "/schema-constraints", linkTerm: "Validation at write time" },
        { label: "Append-only log for complete state reconstruction after failure", href: "/reproducible-state-reconstruction", linkTerm: "Append-only log" },
      ]}
      keyDifferences={{
        comparedTo: "Building pipelines",
        comparedToHref: "/building-pipelines",
        points: [
          "Focus: infrastructure and platform layer - below application agents, above compute",
          "Adoption motion: evaluate guarantees first, then standardize across teams",
          "Success metric: reproducible runs and auditability, not just better agent outputs",
        ],
      }}
      deepPainPoints={[
        {
          heading: "Agent runs aren't reproducible",
          body: (
            <p>
              Two runs with identical inputs produce different results. State
              changes between sessions are invisible - no versioned history to
              compare, no log to replay. Debugging means reading logs and
              guessing.
            </p>
          ),
        },
        {
          heading: "State changes are invisible",
          body: (
            <p>
              Values overwrite in place. When a record changes, the previous
              value is gone. No diff, no provenance, no way to know which agent
              or pipeline step introduced the change.
            </p>
          ),
        },
        {
          heading: "No audit trail for compliance or evaluation",
          body: (
            <p>
              Evaluation needs to compare outputs against known-good state.
              Compliance needs to trace decisions to source data. Without an
              immutable log, neither is possible without manual reconstruction.
            </p>
          ),
        },
        {
          heading: "Memory locked to one vendor's runtime",
          body: (
            <p>
              Each agent runtime ships its own memory: none portable, none
              interoperable. Switching frameworks means rebuilding state
              management from scratch.
            </p>
          ),
        },
        {
          heading: "No data residency guarantees",
          body: (
            <p>
              Agent state flows through third-party APIs with no contractual
              guarantee about where it's stored or who can access it. For teams
              with compliance obligations, opaque provider memory is a gap that
              manual audits cannot close.
            </p>
          ),
        },
      ]}
      problemsToSolutionsTransition={
        <p>
          If you can't replay an agent run, you can't debug it. If you can't
          debug it, you can't iterate. Neotoma makes agent state inspectable,
          diffable, and replayable - so your debugging cycle is minutes, not
          days.
        </p>
      }
      solutions={[
        {
          heading: "Deterministic state",
          icon: "Repeat",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Every state change is versioned. Same inputs always produce the
              same state - no ordering sensitivity, no silent drift. Agent runs
              become reproducible by construction.
            </p>
          ),
        },
        {
          heading: "Append-only log",
          icon: "FileStack",
          href: "/reproducible-state-reconstruction",
          body: (
            <p>
              Records are immutable. Corrections add new data; they never
              overwrite. The full state can be reconstructed from the log at any
              point in time.
            </p>
          ),
        },
        {
          heading: "Full provenance and replayable timeline",
          icon: "History",
          href: "/replayable-timeline",
          body: (
            <p>
              Every record links back to where it came from. Replay the timeline
              to any historical state. Diff versions to see what changed and
              when.
            </p>
          ),
        },
        {
          heading: "Validation at write time",
          icon: "Shield",
          href: "/schema-constraints",
          body: (
            <p>
              Records enforce validation rules at write time. Bad data is
              rejected before it enters the memory graph - preventing
              garbage-in-garbage-out across runtimes.
            </p>
          ),
        },
      ]}
      whatChanges={
        <>
          <p>
            You stop writing glue. Checkpoint logic, state serialization, custom
            diffing, retry handlers - the guarantees you've been hand-rolling
            become primitives you build on.
          </p>
          <p>
            When something fails, you query the timeline instead of
            reconstructing it from logs. Post-mortems take thirty minutes because
            provenance answers "what changed and when" directly.
          </p>
          <p>
            The job shifts from reactive firefighting to proactive platform
            design.
          </p>
        </>
      }
      dataTypeDetails={[
        { type: "agent_session", description: "Session state with versioned context and accumulated facts" },
        { type: "action", description: "Agent actions with inputs, outputs, timestamps, and provenance" },
        { type: "pipeline", description: "Multi-step workflows with step-level state tracking" },
        { type: "evaluation", description: "Eval results, benchmarks, and regression tracking" },
        { type: "audit_event", description: "Immutable log of state transitions and corrections" },
        { type: "tool_config", description: "Agent tool configurations and runtime parameters" },
        { type: "entity_graph", description: "Resolved records with typed relationships and temporal evolution" },
        { type: "runbook", description: "Operational procedures and agent behavioral rules with version history" },
      ]}
      scopeNote={
        <p>
          If your agents are stateless request-response (no accumulated context,
          no record tracking), standard logging and tracing are sufficient.
          Neotoma is for when agents accumulate state across sessions and
          pipeline steps, and you need that state to be reproducible, traceable,
          and auditable.
        </p>
      }
      credibilityBridge="Built because I hit every failure mode on this page while running a twelve-server agent stack against a production monorepo."
      blogPostLink={{
        label: "Building structural barriers that incumbents can't copy",
        href: "https://markmhendrickson.com/posts/building-structural-barriers",
      }}
      closingStatement="The tax is writing glue: checkpoint logic, custom diffing, state serialization. Neotoma removes that tax and gives you primitives to build on instead."
    />
  );
}
