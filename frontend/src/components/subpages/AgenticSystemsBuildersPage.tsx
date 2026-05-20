import { Brain, Users, GitBranch, Fingerprint, Scale } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";
import { MdxSitePage } from "./MdxSitePage";

const profile = ICP_PROFILES.find((p) => p.slug === "building-pipelines")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Cross-session memory",
    Icon: Brain,
    title: "Agent starts from zero every session",
    description:
      "The agent built up context over a multi-turn workflow, then the session ended. Next session, everything was gone - no accumulated facts, no continuity.",
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
      "A research agent and a writing agent both updated the same record. One silently overwrote the other, and the final output mixed stale and current data.",
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
      "A pipeline produced an incorrect recommendation. Without provenance, there was no way to determine which step introduced the error or what data it was based on.",
    scenario: {
      left: "Why did the pipeline recommend vendor B?",
      fail: "Recommendation based on available data.",
      succeed: "Based on observation #3021 (cost matrix v3) at step 2 of 5.",
    },
  },
  {
    category: "Entity resolution",
    Icon: Fingerprint,
    title: "Duplicate records, divergent state",
    description:
      "Multiple sessions created separate records for the same person. Downstream agents reasoned over duplicates with conflicting details.",
    scenario: {
      left: "Get all open tasks for client 'J. Martinez'.",
      fail: "Found 2 tasks for 'Jose Martinez', 1 for 'J. Martinez'.",
      succeed: "3 open tasks for Jose Martinez (canonical ID: ent_8f2a).",
    },
  },
];

export function AgenticSystemsBuildersPageBody() {
  return (
    <IcpDetailPage
      mdxShell
      profile={profile}
      openingHook={
        <p>
          You wire together multi-step agent pipelines. They work in demos. In
          production, entities drift, memory regresses, and when something goes
          wrong you can't trace why. Half your effort goes toward compensating
          for a memory layer that doesn't hold its shape. Neotoma puts you on
          solid ground.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Memory that persists across sessions and agents", href: "/memory-models#deterministic-memory", linkTerm: "Memory that persists" },
        { label: "Same input, same output - no silent changes between runs", href: "/deterministic-state-evolution", linkTerm: "Same input, same output" },
        { label: "Every agent output traces back to the facts it was based on", href: "/auditable-change-log", linkTerm: "Every agent output traces back" },
        { label: "Entity resolution so agents reason over canonical records, not duplicates", href: "/architecture", linkTerm: "Entity resolution" },
        { label: "Audit trail for debugging and compliance across pipeline steps", href: "/auditable-change-log", linkTerm: "Audit trail" },
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
                LangChain, CrewAI, and custom frameworks each ship their own memory. None
                are portable across tools. None version state. None provide provenance. Switching
                frameworks means starting over.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[14px] font-medium text-foreground mb-1">Retrieval / vector search</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                Retrieval finds relevant context at query time by similarity. It doesn't
                persist canonical records, track provenance, or guarantee the same result
                twice. Retrieval and a persistent memory layer solve different problems.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[14px] font-medium text-foreground mb-1">Provider-hosted memory</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                ChatGPT memory, Claude memory: conversation-scoped, provider-bound, non-auditable.
                No cross-tool access, no correction mechanism, no trail.
              </p>
            </div>
          </div>
          <div className="mt-6 text-[14px] leading-7 text-muted-foreground">
            <p>
              Retrieval and persistent memory are different paradigms. Retrieval
              optimizes for flexible, on-demand access. Persistent memory
              optimizes for consistency and verifiability. If your agents need to
              reason over canonical records across sessions - not just find
              relevant context within one - you need a persistent layer
              underneath retrieval.
            </p>
          </div>
        </>
      }
      deepPainPoints={[
        {
          heading: "Agents forget between sessions",
          body: (
            <p>
              Conversation-scoped memory resets every session. Agents can't
              accumulate facts, track how records evolve, or reference decisions
              from prior runs. Each session starts from scratch.
            </p>
          ),
        },
        {
          heading: "No way to trace why the agent said what it said",
          body: (
            <p>
              When an agent produces an output, there's no link back to the data
              that informed it. Debugging, evaluation, and compliance all require
              knowing <em>why</em> - and most memory systems can't answer that.
            </p>
          ),
        },
        {
          heading: "State changes silently across pipeline steps",
          body: (
            <p>
              In multi-step pipelines, one agent's write can silently overwrite
              another's. Without versioned state, pipelines produce results that
              can't be replayed or compared.
            </p>
          ),
        },
        {
          heading: "Data in memory services you can't audit",
          body: (
            <p>
              Agent workflows route data through external memory APIs with no
              visibility into storage, access controls, or retention. When
              someone asks "where is my data?", most agent setups can't answer.
            </p>
          ),
        },
        {
          heading: "Memory locked to one framework",
          body: (
            <p>
              LangChain memory doesn't port to CrewAI. CrewAI state doesn't port
              to custom orchestration. Every framework ships its own memory with
              its own API and no interoperability.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Persistent, versioned memory",
          icon: "Fingerprint",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Every state change is versioned. Same inputs always produce the
              same output. No silent overwrites - pipelines can be replayed and
              compared.
            </p>
          ),
        },
        {
          heading: "Full provenance and audit trail",
          icon: "Link2",
          href: "/auditable-change-log",
          body: (
            <p>
              Every record and relationship links back to where it came from.
              Ask "where did this come from?" and get a traceable chain from
              output to source.
            </p>
          ),
        },
        {
          heading: "Open source, no lock-in",
          icon: "Server",
          href: "/mcp",
          body: (
            <p>
              MIT-licensed. No vendor lock-in, no proprietary memory format.
              Your data is yours - stored locally, accessible from any
              MCP-compatible tool, portable across frameworks.
            </p>
          ),
        },
        {
          heading: "Entity resolution across sessions",
          icon: "Merge",
          href: "/architecture",
          body: (
            <p>
              Agents accumulate facts across sessions without creating
              duplicates. Canonical IDs, typed relationships, and timelines
              survive restarts, handoffs, and pipeline re-runs.
            </p>
          ),
        },
      ]}
      whatChanges={
        <>
          <p>
            You stop compensating for memory and start building on top of it.
            New features compound instead of regressing. You add a capability
            and it works across sessions because the state it depends on
            persists.
          </p>
          <p>
            The records graph gets richer as usage grows, not messier -
            constraints and resolution rules handle what used to be manual
            cleanup. Your roadmap shifts from memory regression fixes to new
            capabilities.
          </p>
          <p>
            When something goes wrong, you trace it to a specific record in
            thirty seconds. You start trusting your own system enough to build
            ambitiously on it.
          </p>
        </>
      }
      dataTypeDetails={[
        { type: "agent_session", description: "Session state and accumulated facts across agent runs" },
        { type: "action", description: "Agent actions with inputs, outputs, and provenance links" },
        { type: "pipeline", description: "Multi-step workflows with step-level audit" },
        { type: "evaluation", description: "Eval results, benchmarks, and regression tracking" },
        { type: "audit_event", description: "Immutable log of state transitions and corrections" },
        { type: "tool_config", description: "Agent tool configurations and runtime parameters" },
        { type: "entity_graph", description: "Resolved records with typed relationships and temporal evolution" },
        { type: "runbook", description: "Operational procedures and agent behavioral rules" },
      ]}
      scopeNote={
        <p>
          For single-session, stateless tasks (one-shot summarization, code
          generation, document Q&A), retrieval is sufficient. Neotoma is for
          agents that accumulate facts across sessions, resolve entities, track
          commitments, and need to explain their reasoning after the fact.
        </p>
      }
      credibilityBridge="Built because retrieval kept re-guessing entities that should have been resolved once and persisted."
      blogPostLink={{
        label: "Why agent memory needs more than RAG",
        href: "https://markmhendrickson.com/posts/why-agent-memory-needs-more-than-rag",
      }}
      closingStatement="The tax is prompt workarounds, dedup hacks, and memory regressions. Neotoma removes that tax and gives you a persistent, provenance-backed substrate to build on."
    />
  );
}

export function AgenticSystemsBuildersPage() {
  return <MdxSitePage canonicalPath="/building-pipelines" detailTitle={profile.shortName} />;
}
