import { Brain, Users, GitBranch, Fingerprint, Scale } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "agentic-systems-builders")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Cross-session memory",
    Icon: Brain,
    title: "Agent starts from zero every session",
    description:
      "The agent accumulated context across a multi-turn workflow, then the session ended. Next session, everything was gone — no accumulated facts, no entity history, no continuity.",
    scenario: {
      left: "Continue the onboarding workflow for Acme Corp.",
      fail: "No onboarding workflow found. Starting fresh.",
      succeed: "Resuming step 4 of 7. Last update: 2 hours ago.",
    },
  },
  {
    category: "Multi-agent coordination",
    Icon: Users,
    title: "Two agents, conflicting state",
    description:
      "A research agent and a writing agent both updated the same entity. Without versioned writes, one silently overwrote the other — and the final output mixed stale and current data.",
    scenario: {
      left: "What's the latest company summary for Apex?",
      fail: "Apex: 12 employees, Series A. (stale from research agent)",
      succeed: "Apex: 45 employees, Series B. Merged from 2 agent sources.",
    },
  },
  {
    category: "Pipeline debugging",
    Icon: GitBranch,
    title: "Can't trace output back to source",
    description:
      "An orchestration pipeline produced an incorrect recommendation. Without provenance links, the team couldn't determine which step introduced the error or what data it was based on.",
    scenario: {
      left: "Why did the pipeline recommend vendor B?",
      fail: "Recommendation based on available data.",
      succeed: "Based on observation #3021 (cost matrix v3) at step 2 of 5.",
    },
  },
  {
    category: "Entity resolution",
    Icon: Fingerprint,
    title: "Duplicate entities, divergent state",
    description:
      "Multiple agent sessions created separate records for the same real-world entity. Without canonical resolution, downstream agents reasoned over duplicates with conflicting attributes.",
    scenario: {
      left: "Get all open tasks for client 'J. Martinez'.",
      fail: "Found 2 tasks for 'Jose Martinez', 1 for 'J. Martinez'.",
      succeed: "3 open tasks for Jose Martinez (canonical ID: ent_8f2a).",
    },
  },
];

export function AgenticSystemsBuildersPage() {
  return (
    <IcpDetailPage
      profile={profile}
      openingHook={
        <p>
          You ship agents that work in demos. In production, entity resolution drifts, memory
          regresses, and when something goes wrong you can't trace why. Half your engineering
          effort goes toward compensating for a memory layer that doesn't hold its shape.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Cross-session, cross-agent state that persists beyond token windows", href: "/memory-models#deterministic-memory", linkTerm: "Cross-session, cross-agent state" },
        { label: "Deterministic memory: same input, same output — no silent mutation", href: "/deterministic-state-evolution", linkTerm: "Deterministic memory" },
        { label: "Full provenance linking every agent output to its source facts", href: "/auditable-change-log", linkTerm: "Full provenance" },
        { label: "Structured entity resolution so agents reason over canonical data, not duplicates", href: "/architecture", linkTerm: "Structured entity resolution" },
        { label: "Audit trail for eval, debugging, and compliance across pipeline steps", href: "/auditable-change-log", linkTerm: "Audit trail" },
      ]}
      competitiveComparison={
        <>
          <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
            <Scale className="h-4.5 w-4.5 text-indigo-500" aria-hidden />
            How is this different from what you're already using?
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[14px] font-medium text-foreground mb-1">Framework-native memory</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                LangChain, CrewAI, and custom frameworks each ship their own memory abstraction. None
                are portable. None version state. None provide provenance. Switching frameworks means
                starting state management over.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[14px] font-medium text-foreground mb-1">RAG / vector retrieval</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                Retrieval finds things at query time by similarity. It doesn't persist canonical
                entities, maintain provenance, or guarantee the same result twice. Retrieval and a
                truth layer solve different problems and will coexist.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[14px] font-medium text-foreground mb-1">Provider-hosted memory</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                ChatGPT memory, Claude memory — conversation-scoped, provider-bound, non-deterministic.
                No cross-platform access, no correction mechanism, no audit trail.
              </p>
            </div>
          </div>
          <div className="mt-6 text-[14px] leading-7 text-muted-foreground">
            <p>
              Retrieval and state are different paradigms, not a feature gap. Embedding-based search
              and agentic search both optimize for flexible, on-demand access. A truth layer optimizes
              for consistency and verifiability. If your agents need to reason over canonical entities
              across sessions — not just find relevant context within one — you need a state layer
              underneath the retrieval.
            </p>
          </div>
        </>
      }
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
        {
          heading: "Client data in memory services you don't control",
          body: (
            <p>
              Agent workflows route customer data through external memory APIs with no visibility
              into storage location, access controls, or retention policies. When a client asks
              "where is my data stored?", most agent architectures can't answer.
            </p>
          ),
        },
        {
          heading: "Memory locked to one framework",
          body: (
            <p>
              LangChain memory doesn't port to CrewAI. CrewAI state doesn't port to custom
              orchestration. Every framework ships its own memory layer with its own API, its own
              storage format, and no interoperability. Switching frameworks means starting state
              management over.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Deterministic, versioned memory substrate",
          icon: "Fingerprint",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Every state transition is content-addressed and versioned. Same input always produces
              the same output. No silent mutation — agents and pipelines can be replayed and audited.
            </p>
          ),
        },
        {
          heading: "Full provenance and audit trail",
          icon: "Link2",
          href: "/auditable-change-log",
          body: (
            <p>
              Every entity, relationship, and fact links back to the observation that created it.
              Query "where did this come from?" and get a traceable chain from output to source.
            </p>
          ),
        },
        {
          heading: "MCP-native, MIT-licensed, no lock-in",
          icon: "Server",
          href: "/mcp",
          body: (
            <p>
              MIT-licensed. No token, no vendor lock-in, no proprietary memory format. Your state
              is yours — stored locally, accessible via MCP from any compatible tool, portable
              across frameworks by design.
            </p>
          ),
        },
        {
          heading: "Cross-session entity resolution",
          icon: "Merge",
          href: "/architecture",
          body: (
            <p>
              Agents accumulate facts across sessions without duplication. Entity resolution ensures
              canonical IDs, typed relationships, and timelines that survive agent restarts, handoffs,
              and pipeline re-runs.
            </p>
          ),
        },
      ]}
      whatChanges={
        <>
          <p>
            You stop compensating for memory and start building on top of it. New features compound
            instead of regressing. You add a capability and it works across sessions because the
            state it depends on persists.
          </p>
          <p>
            You ship to more users and the entity graph gets richer, not messier, because schema
            constraints and merge rules handle what used to be manual cleanup. Your roadmap shifts
            from memory regression fixes to new capabilities.
          </p>
          <p>
            A customer reports an issue and you trace it to a specific observation in thirty seconds.
            You start trusting your own system enough to build ambitiously on it.
          </p>
        </>
      }
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
      scopeNote={
        <p>
          For single-session, stateless agent tasks — one-shot summarization, code generation,
          document Q&A — retrieval is sufficient and simpler. Neotoma is for agents that
          accumulate facts across sessions, resolve entities, track commitments, and need to
          explain their reasoning after the fact.
        </p>
      }
      credibilityBridge="Built because retrieval kept re-inferring entities that should have been resolved once and persisted."
      blogPostLink={{
        label: "Why agent memory needs more than RAG",
        href: "https://markmhendrickson.com/posts/why-agent-memory-needs-more-than-rag",
      }}
      closingStatement="Your agents need more than token-based memory. Neotoma removes the tax your team pays compensating for unreliable state — and gives you a deterministic, provenance-backed substrate to build on."
    />
  );
}
