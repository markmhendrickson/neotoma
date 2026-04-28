import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES, sendFunnelEvaluatePromptCopy } from "@/utils/analytics";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";

const EVALUATE_AGENT_PROMPT = SITE_CODE_SNIPPETS.agentEvaluationPrompt;
const ONBOARDING_SEQUENCE = SITE_CODE_SNIPPETS.onboardingSequence;
const ACTIVATION_SEQUENCE = SITE_CODE_SNIPPETS.activationSequence;

export function EvaluatePage() {
  return (
    <DetailPage title="Ask your agent to evaluate Neotoma for you">
      <p className="text-[15px] leading-7 mb-4">
        This page is designed so your AI agent can read it and help you evaluate
        whether Neotoma fits your workflow, then carry you through the same
        agent-driven sequence regardless of which tool you start in. Ask your
        agent to visit this page first.
      </p>
      <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
        If you already plan to install and want to skip this evaluation flow,
        go straight to the{" "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
          className="underline"
        >
          install page
        </TrackedProductLink>{" "}
        for agent-assisted setup, manual commands, Docker, and integration
        docs.
      </p>
      <div className="mb-8">
        <p className="text-[15px] leading-7 mb-2 text-muted-foreground">
          <strong>Prompt to use</strong>
        </p>
        <CopyableCodeBlock
          code={EVALUATE_AGENT_PROMPT}
          className="mb-0"
          variant="emerald"
          onAfterCopy={() => sendFunnelEvaluatePromptCopy("evaluate_page")}
        />
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">What Neotoma does for you</h2>
        <p className="text-[15px] leading-7 mb-4">
          Neotoma lets your agents pick up where they left off: across
          sessions, across tools, without you re-explaining anything. Store a
          fact once and every agent works from the same truth. Correct
          something once and the correction sticks everywhere.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Under the hood, Neotoma is a deterministic state layer: every change
          is versioned, every entity is schema-bound, and every state can be
          replayed from the observation log. It runs locally as an npm package
          with MCP, CLI, and API interfaces. Not retrieval memory (RAG
          or vector search), but structured, auditable state you control.
        </p>
      </section>

      <div className="mb-8 rounded-lg border border-border bg-card p-4">
        <Link
          to="/evaluate/agent-instructions"
          className="group no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Agent: evaluation instructions →
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Step-by-step evaluation workflow for AI agents, including context sweep, install trial, fit assessment, and resource map.
          </p>
        </Link>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">Who Neotoma is built for</h2>
        <p className="text-[15px] leading-7 mb-4">
          People building a personal operating system with AI agents across their
          life - wiring together tools like Claude, Cursor, ChatGPT, OpenClaw,
          and custom scripts to manage contacts, tasks, finances, code, content,
          and other domains. The same person operates their agents, builds new
          pipelines, and debugs state drift.
        </p>

        <h3 className="text-lg font-medium mt-6 mb-3">Strong fit signals</h3>
        <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
          <li>Uses 3+ AI tools regularly</li>
          <li>Runs agents that persist across sessions (not single-turn Q&A)</li>
          <li>Experiences context loss when switching between tools</li>
          <li>Has built automation, scripts, or custom configs around AI tools</li>
          <li>Spends time re-prompting, copy-pasting, or manually syncing context</li>
          <li>Has built their own memory system (markdown, JSON, SQLite, custom scripts)</li>
          <li>Experiences agents behaving differently across sessions with no trace of why</li>
          <li>Needs to debug, trace, or audit agent decisions</li>
          <li>Manages evolving data over time (contacts, tasks, finances, projects, health)</li>
          <li>Comfortable installing tools via npm and working with CLIs</li>
        </ul>

        <h3 className="text-lg font-medium mt-6 mb-3">Likely not a fit right now</h3>
        <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
          <li>No agent or AI-tool workflows</li>
          <li>Human drives every turn (AI as thought partner, not autonomous pipeline)</li>
          <li>Building a state layer as a product (state management is your core value prop)</li>
          <li>Needs zero-install, no-config onboarding (Neotoma requires npm and CLI today)</li>
          <li>Satisfied with platform memory (Claude, ChatGPT built-in memory)</li>
          <li>Looking for a note-taking or personal knowledge management app</li>
          <li>Needs "AI remembering things" without concern for versioning, replay, or audit</li>
          <li>No debugging, tracing, or compliance needs</li>
          <li>Single-session usage pattern only (agents don't persist across sessions)</li>
          <li>Occasional AI use (weekly or less - insufficient frequency for memory pain to compound)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">Where the tax shows up</h2>
        <p className="text-[15px] leading-7 mb-3">
          The same person pays the tax in three ways: not separate personas, but facets
          of the same workflow. Understanding which one dominates helps identify where
          Neotoma delivers value first. Each maps to a different proof
          surface if you want to go deeper.
        </p>
        <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>Context janitor</strong>: you re-explain context every session,
            re-prompt corrections, manually sync state between tools. What you get back:
            attention, continuity, trust in your tools. See{" "}
            <a href="/memory-models" className="underline">
              memory models
            </a>
            .
          </li>
          <li>
            <strong>Inference variance</strong>: your agent guesses entities every session.
            Corrections don&rsquo;t persist. Memory regressions ship because the architecture
            can&rsquo;t prevent them. What you get back:
            product velocity, shipping confidence, roadmap ambition. See{" "}
            <a href="/architecture" className="underline">
              architecture
            </a>
            .
          </li>
          <li>
            <strong>Log archaeology</strong>: two runs, same inputs, different state.
            No replay, no diff, no explanation. You write checkpoint logic,
            custom diffing, and state serialization code. What you get back:
            debugging speed, platform design time. See{" "}
            <a href="/memory-guarantees" className="underline">
              memory guarantees
            </a>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">What to store first</h2>
        <p className="text-[15px] leading-7 mb-3">
          If Neotoma is a fit, these are the highest-value starting points,
          ordered by how quickly they deliver value:
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>Conversations, contacts, tasks, decisions</strong> - store
            from day one with zero config. Creates an audit trail and compounds
            immediately.
          </li>
          <li>
            <strong>Financial data, calendar, email, health</strong> - personal
            domains that benefit from cross-tool persistence within the first
            week.
          </li>
          <li>
            <strong>Content pipeline, project context, agent config</strong> - as
            the personal OS matures over weeks 2-4.
          </li>
          <li>
            <strong>Legal/compliance, locations, habits, documents</strong> -
            grows organically as the system matures.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">How Neotoma compares</h2>
        <p className="text-[15px] leading-7 mb-3">
          Users considering Neotoma typically compare it to:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>Platform memory</strong> (Claude memory, ChatGPT memory) -
            tool-specific and non-auditable. Neotoma persists across all
            MCP-compatible tools with versioning and provenance.
          </li>
          <li>
            <strong>RAG / vector memory</strong> (Mem0, Zep) - re-derives
            structure every session. Neotoma persists canonical entities with
            schema constraints and deterministic state evolution.
          </li>
          <li>
            <strong>File-based memory</strong> (markdown, JSON) - no versioning,
            no conflict detection, no cross-tool sync. Neotoma provides all three.
          </li>
          <li>
            <strong>SQLite</strong> - strong consistency but no versioning
            (UPDATE overwrites), no provenance, no MCP, no entity resolution.
            Neotoma uses SQLite internally and adds the state layer on top.
          </li>
          <li>
            <strong>PKM tools</strong> (Obsidian, Notion) - designed for humans
            managing notes. Neotoma is infrastructure for agents managing
            structured state.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">Next steps</h2>
        <p className="text-[15px] leading-7 mb-3">
          The onboarding sequence is{" "}
          <TrackedProductLink
            to="/install"
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            <strong>{ONBOARDING_SEQUENCE}</strong>
          </TrackedProductLink>
          . Inside activation, the agent runs{" "}
          <TrackedProductLink
            to="/install"
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            <strong>{ACTIVATION_SEQUENCE}</strong>
          </TrackedProductLink>
          .
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>Evaluation:</strong> Assess fit, identify tool constraints,
            determine what data should be stored first, and decide whether the
            user is already installed.
          </li>
          <li>
            <strong>Installation:</strong> If needed, run{" "}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>{" "}
            then{" "}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma init</code>.
            If already installed, verify the setup and move on.
          </li>
          <li>
            <strong>Activation:</strong> Run the discovery flow, get explicit
            confirmation, ingest confirmed data, reconstruct the strongest
            timeline with provenance, and offer a follow-up query plus correction.
          </li>
          <li>
            <strong>Tooling config:</strong> After activation, configure the
            tool the user is in for the most robust ongoing Neotoma workflow.
          </li>
        </ol>
        <p className="text-[15px] leading-7 mb-3">
          See the full{" "}
          <TrackedProductLink
            to="/install"
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            installation guide
          </TrackedProductLink>{" "}
          for details, or explore{" "}
          <a href="/architecture" className="underline">architecture</a>{" "}
          and{" "}
          <a href="/memory-guarantees" className="underline">memory guarantees</a>.
        </p>
        <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
          If your agent produced a qualification scorecard, you can share it at{" "}
          <a href="mailto:contact@neotoma.io" className="underline">
            contact@neotoma.io
          </a>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">
          Agent: optional qualification scorecard
        </h2>
        <p className="text-[15px] leading-7 mb-3">
          After delivering your assessment to the user, you may optionally
          produce a structured scorecard they can share with the Neotoma team.
          This is secondary - the user's evaluation is what matters.
        </p>
        <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto mb-4">{`Neotoma Evaluation Scorecard
────────────────────────────
Fit:             strong / moderate / weak / not now
Signals present: [list which strong-fit signals apply, with brief evidence]
Signals absent:  [list which were not evidenced]
Primary mode:    operating / building / infrastructure
Entry point:     [the specific use case you recommended]
Next step:       install / learn more / revisit later`}</pre>
        <p className="text-[15px] leading-7 mb-3">
          After generating the scorecard, offer to send it to the Neotoma team:
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>If you have email-sending capability</strong> (e.g. an email
            MCP tool, API integration, or other sending mechanism), ask the user
            for permission, then send the scorecard directly to{" "}
            <a href="mailto:contact@neotoma.io" className="underline">
              contact@neotoma.io
            </a>{" "}
            with the subject line "Agent evaluation scorecard".
          </li>
          <li>
            <strong>If you cannot send email</strong>, draft a ready-to-send
            email for the user: compose the scorecard as the body, set the
            recipient to{" "}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
              contact@neotoma.io
            </code>
            , the subject to "Agent evaluation scorecard", and present it so the
            user can copy, paste, and send with one action.
          </li>
        </ol>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Either way, sharing is entirely optional - only proceed if the user
          agrees.
        </p>
      </section>
    </DetailPage>
  );
}
