import { GitBranch, Eye, ShieldCheck, RotateCcw } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "ai-infrastructure-engineers")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Pipeline reproducibility",
    Icon: GitBranch,
    title: "Same pipeline, different results",
    description:
      "Two runs of the same pipeline with identical inputs returned different entity states. Without content-addressed versioning, there was no way to detect or prevent the drift.",
    scenario: {
      left: "Replay yesterday's ingestion pipeline.",
      fail: "Pipeline completed. 3 entity conflicts unresolved.",
      succeed: "Pipeline replayed deterministically. State matches v47.",
    },
  },
  {
    category: "State mutation visibility",
    Icon: Eye,
    title: "Invisible overwrite, broken downstream",
    description:
      "An upstream agent silently overwrote a shared entity. Downstream consumers read stale state and produced incorrect outputs. The mutation was invisible to observability tooling.",
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
      "An evaluation harness needed to trace an agent's output to its source data. Without an immutable observation log, the audit trail had to be reconstructed manually from logs.",
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
      "A production agent crashed mid-run. The in-memory state was lost. Without an append-only observation log, the team had no way to reconstruct what the agent knew at the time of failure.",
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
          Your observability stack watches everything except the thing that actually matters:
          what the agent believed and why. When a production agent fails, your debugging process
          is reconstructing what happened from scattered logs, guessing at state transitions,
          and hoping you can reproduce the issue.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Deterministic state evolution: same observations always produce the same entity state", href: "/deterministic-state-evolution", linkTerm: "Deterministic state evolution" },
        { label: "Full provenance chain from agent outputs back to source data", href: "/auditable-change-log", linkTerm: "Full provenance chain" },
        { label: "Replayable timelines for debugging production agent failures", href: "/replayable-timeline", linkTerm: "Replayable timelines" },
        { label: "Schema constraints that reject malformed data at write time, not after the fact", href: "/schema-constraints", linkTerm: "Schema constraints" },
        { label: "Append-only observation log for complete state reconstruction after failure", href: "/reproducible-state-reconstruction", linkTerm: "Append-only observation log" },
      ]}
      keyDifferences={{
        comparedTo: "Agent system builders",
        comparedToHref: "/agentic-systems-builders",
        points: [
          "Primary layer: infrastructure/platform (runtimes, orchestration, observability), not application workflows",
          "Adoption motion: evaluate guarantees first, then standardize across teams",
          "Decision buyer: platform or reliability leads with infrastructure budget and longer review cycles",
          "Success metric: reproducible runs and auditability at the platform level, not just better agent outputs",
        ],
      }}
      deepPainPoints={[
        {
          heading: "Agent runs are not reproducible",
          body: (
            <p>
              Two runs of the same agent with identical inputs produce different results. State
              mutations between sessions are invisible; there is no versioned history to compare,
              no observation log to replay. Debugging means reading logs and guessing.
            </p>
          ),
        },
        {
          heading: "State mutations are invisible",
          body: (
            <p>
              Ad-hoc state management overwrites values in place. When an entity changes, the
              previous value is gone. There is no diff, no provenance, no way to know which
              agent or pipeline step introduced the change.
            </p>
          ),
        },
        {
          heading: "No audit trail for compliance or evaluation",
          body: (
            <p>
              Evaluation harnesses need to compare agent outputs against known-good state.
              Compliance requires tracing decisions to source data. Without an immutable
              observation log, neither is possible without rebuilding the audit trail manually.
            </p>
          ),
        },
        {
          heading: "State layer locked to one vendor's runtime",
          body: (
            <p>
              Each agent runtime provides its own memory abstraction: none portable, none
              interoperable. Migrating to a new orchestration framework means rebuilding state
              management from scratch. There is no standard state layer that works across vendors.
            </p>
          ),
        },
        {
          heading: "No data residency guarantees for agent state",
          body: (
            <p>
              Agent state flows through third-party APIs with no contractual guarantee about where
              it's stored, who can access it, or whether it's used for model training. For teams
              with SOC 2, HIPAA, or GDPR obligations, opaque provider memory is a compliance gap
              that manual audits cannot close.
            </p>
          ),
        },
      ]}
      problemsToSolutionsTransition={
        <p>
          Your application teams ship in tight cycles. Your state layer should too. If you can't
          replay an agent run, you can't debug it. If you can't debug it, you can't iterate.
          Neotoma makes agent state inspectable, diffable, and replayable, so your debugging
          cycle is minutes, not days of log archaeology.
        </p>
      }
      solutions={[
        {
          heading: "Deterministic state evolution",
          icon: "Repeat",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Every state transition is content-addressed and versioned. Same observations always
              produce the same entity state: no ordering sensitivity, no silent drift. Agent
              runs become reproducible by construction.
            </p>
          ),
        },
        {
          heading: "Append-only observation log",
          icon: "FileStack",
          href: "/reproducible-state-reconstruction",
          body: (
            <p>
              Observations are immutable. Corrections add new data; they never overwrite.
              The full state can be reconstructed from the observation log at any point in time.
            </p>
          ),
        },
        {
          heading: "Full provenance and replayable timeline",
          icon: "History",
          href: "/replayable-timeline",
          body: (
            <p>
              Every entity, relationship, and fact links back to the observation that created it.
              Replay the timeline to any historical state. Diff versions to understand what
              changed and when.
            </p>
          ),
        },
        {
          heading: "Schema-first validation",
          icon: "Shield",
          href: "/schema-constraints",
          body: (
            <p>
              Entity types enforce schema constraints at write time. Malformed or invalid data
              is rejected before it enters the memory graph, preventing garbage-in-garbage-out
              failures across agent runtimes and orchestration layers.
            </p>
          ),
        },
      ]}
      whatChanges={
        <>
          <p>
            You stop writing glue. Checkpoint logic, state serialization, custom diffing, retry
            handlers. The guarantees you've been hand-rolling become primitives. You declare
            invariants instead of building safety nets.
          </p>
          <p>
            When something fails, you query the timeline instead of reconstructing it from logs.
            Post-mortems take thirty minutes because provenance answers "what changed and when"
            directly. Your team stops treating agent state as a black box and starts treating it
            like any other part of the stack they can reason about.
          </p>
          <p>
            The job shifts from reactive firefighting to proactive platform design.
          </p>
        </>
      }
      dataTypeDetails={[
        { type: "agent_session", description: "Session state with versioned context windows and accumulated facts" },
        { type: "action", description: "Agent actions with inputs, outputs, timestamps, and provenance" },
        { type: "pipeline", description: "Multi-step orchestration workflows with step-level state tracking" },
        { type: "evaluation", description: "Eval results, benchmarks, and regression tracking tied to entity state" },
        { type: "audit_event", description: "Immutable log of state transitions, entity mutations, and corrections" },
        { type: "tool_config", description: "Agent tool configurations, MCP server bindings, and runtime parameters" },
        { type: "entity_graph", description: "Resolved entities with typed relationships and temporal evolution" },
        { type: "runbook", description: "Operational procedures and agent behavioral rules with version history" },
      ]}
      scopeNote={
        <p>
          If your agents are stateless request-response (no accumulated context, no entity
          tracking), standard logging and tracing are sufficient. Neotoma is for when agents
          accumulate state across sessions and pipeline steps, and you need that state to be
          reproducible, traceable, and auditable.
        </p>
      }
      credibilityBridge="Built because I hit every failure mode on this page while running a twelve-server agentic stack against a production monorepo."
      blogPostLink={{
        label: "Building structural barriers that incumbents can't copy",
        href: "https://markmhendrickson.com/posts/building-structural-barriers",
      }}
      closingStatement="You need guarantees, not features. Neotoma removes the tax your team pays hand-rolling state management and gives you deterministic primitives to build on instead."
    />
  );
}
