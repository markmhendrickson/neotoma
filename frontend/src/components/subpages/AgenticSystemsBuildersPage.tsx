import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "agentic-systems-builders")!;

export function AgenticSystemsBuildersPage() {
  return (
    <IcpDetailPage
      profile={profile}
      aiNeeds={[
        "Cross-session, cross-agent state that persists beyond token windows",
        "Deterministic memory: same input, same output — no silent mutation",
        "Full provenance linking every agent output to its source facts",
        "Structured entity resolution so agents reason over canonical data, not duplicates",
        "Audit trail for eval, debugging, and compliance across pipeline steps",
      ]}
      keyDifferences={{
        comparedTo: "AI infrastructure engineers",
        points: [
          "Primary layer: application workflows and shipped agent products, not platform internals",
          "Adoption motion: integrate quickly via MCP into frameworks, then expand as more agents ship",
          "Decision buyer: individual builders or product engineering teams with shorter cycles",
          "Success metric: reliable cross-session execution, fewer memory regressions, and faster debugging in shipped workflows",
        ],
      }}
      deepPainPoints={[
        {
          heading: "Agents forget between sessions",
          body: (
            <p>
              Token-based and conversation-only memory resets every session. Agents can't accumulate
              facts, track entity evolution, or reference decisions from prior runs. Each session
              starts from scratch or depends on brittle prompt injection.
            </p>
          ),
        },
        {
          heading: "No provenance means no trust",
          body: (
            <p>
              When an agent produces an output, there's no way to trace it back to the source data
              that informed it. Debugging, evaluation, and compliance all require knowing <em>why</em>{" "}
              the agent said what it said — and most memory systems can't answer that.
            </p>
          ),
        },
        {
          heading: "State mutates silently across pipeline steps",
          body: (
            <p>
              In multi-step orchestration, one agent's write can silently overwrite another's. Without
              versioned, hash-based state evolution, pipelines produce non-reproducible results that
              can't be replayed or audited.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Deterministic, versioned memory substrate",
          body: (
            <p>
              Every state transition is content-addressed and versioned. Same input always produces
              the same output. No silent mutation — agents and pipelines can be replayed and audited.
            </p>
          ),
        },
        {
          heading: "Full provenance and audit trail",
          body: (
            <p>
              Every entity, relationship, and fact links back to the observation that created it.
              Query "where did this come from?" and get a traceable chain from output to source.
            </p>
          ),
        },
        {
          heading: "MCP-native integration",
          body: (
            <p>
              Neotoma exposes structured memory via MCP — the same protocol your agents already speak.
              One memory layer for CrewAI, LangGraph, custom frameworks, and any MCP-compatible tool.
            </p>
          ),
        },
        {
          heading: "Cross-session entity resolution",
          body: (
            <p>
              Agents accumulate facts across sessions without duplication. Entity resolution ensures
              canonical IDs, typed relationships, and timelines that survive agent restarts, handoffs,
              and pipeline re-runs.
            </p>
          ),
        },
      ]}
      dataTypeDetails={[
        { type: "agent_session", description: "Session state, context windows, and accumulated facts across agent runs" },
        { type: "action", description: "Agent actions with inputs, outputs, and provenance links" },
        { type: "pipeline", description: "Multi-step orchestration workflows with step-level audit" },
        { type: "evaluation", description: "Eval results, benchmarks, and regression tracking" },
        { type: "audit_event", description: "Immutable log of state transitions and entity mutations" },
        { type: "tool_config", description: "Agent tool configurations, MCP server bindings, and runtime parameters" },
        { type: "entity_graph", description: "Resolved entities with typed relationships and temporal evolution" },
        { type: "runbook", description: "Operational procedures and agent behavioral rules" },
      ]}
      closingStatement="Agents need more than token-based memory. Neotoma provides the deterministic, provenance-backed memory substrate that agent frameworks and orchestration pipelines require for reliable, auditable operation."
    />
  );
}
