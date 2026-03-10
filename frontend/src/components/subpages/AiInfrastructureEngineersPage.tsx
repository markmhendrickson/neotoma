import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "ai-infrastructure-engineers")!;

export function AiInfrastructureEngineersPage() {
  return (
    <IcpDetailPage
      profile={profile}
      aiNeeds={[
        "Deterministic state evolution: same observations always produce the same entity state",
        "Full provenance chain from agent outputs back to source data",
        "Replayable timelines for debugging production agent failures",
        "Schema constraints that reject malformed data at write time, not after the fact",
        "Append-only observation log for complete state reconstruction after failure",
      ]}
      keyDifferences={{
        comparedTo: "Agent system builders",
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
              mutations between sessions are invisible — there is no versioned history to compare,
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
      ]}
      solutions={[
        {
          heading: "Deterministic state evolution",
          body: (
            <p>
              Every state transition is content-addressed and versioned. Same observations always
              produce the same entity state — no ordering sensitivity, no silent drift. Agent
              runs become reproducible by construction.
            </p>
          ),
        },
        {
          heading: "Append-only observation log",
          body: (
            <p>
              Observations are immutable. Corrections add new data — they never overwrite.
              The full state can be reconstructed from the observation log at any point in time.
            </p>
          ),
        },
        {
          heading: "Full provenance and replayable timeline",
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
          body: (
            <p>
              Entity types enforce schema constraints at write time. Malformed or invalid data
              is rejected before it enters the memory graph — preventing garbage-in-garbage-out
              failures across agent runtimes and orchestration layers.
            </p>
          ),
        },
      ]}
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
      closingStatement="Infrastructure engineers need guarantees, not features. Neotoma provides deterministic state evolution, append-only observations, and full provenance — the invariants missing from ad-hoc agent state management."
    />
  );
}
