import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { DetailPage } from "../DetailPage";
import { TrackedProductLink } from "../TrackedProductNav";
import { SectionDivider } from "../ui/section_divider";

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3">
      {children}
      <a
        href={`#${id}`}
        className="ml-2 inline-flex items-center text-muted-foreground no-underline border-none opacity-40 group-hover:opacity-70 hover:!opacity-100 hover:text-foreground transition"
        aria-label="Link to section"
      >
        #
      </a>
    </h2>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="rounded-lg border code-block-palette p-4 md:p-5 font-mono text-[13px] leading-6 overflow-x-auto mb-6 whitespace-pre">
      {children}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[13px] font-medium shrink-0 mr-2">
      {n}
    </span>
  );
}

function ToolBadge({ tool }: { tool: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[12px] font-medium text-muted-foreground tracking-wide uppercase mr-1">
      {tool}
    </span>
  );
}

/** Example user message that would lead the agent to run the following MCP/CLI operation. */
function ChatPrelude({ children }: { children: string }) {
  return (
    <figure className="mb-3">
      <figcaption className="text-[12px] font-medium text-foreground tracking-wide uppercase mb-1.5">
        Chat that triggers this
      </figcaption>
      <blockquote className="border-l-2 border-emerald-500/45 pl-4 py-1 text-[14px] leading-6 text-muted-foreground">
        &ldquo;{children}&rdquo;
      </blockquote>
    </figure>
  );
}

export function DeveloperWalkthroughPage() {
  return (
    <DetailPage title="Developer walkthrough">
      <section className="mb-6">
        <p className="text-[15px] leading-7 font-medium text-foreground mb-4">
          You use Claude, Cursor, and ChatGPT throughout the day. By the third tool switch, you're
          re-explaining who your contacts are, what you decided last session, and which tasks are
          still open. This walkthrough shows what changes when a shared state layer sits behind
          all of them, and how that same system pays off across operating, building, and debugging.
        </p>
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          In day-to-day use, your{" "}
          <strong className="font-medium text-foreground">AI agent</strong> issues these MCP tool
          calls (or the equivalent{" "}
          <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
            CLI
          </Link>{" "}
          commands) as part of the conversation-you are not expected to paste raw payloads
          yourself. Scripts, integrations, and power users can also call the same operations
          directly via CLI or{" "}
          <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
            REST API
          </Link>
          .
        </p>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Every example below shows MCP{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[13px]">store</code> and{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[13px]">retrieve</code>{" "}
          (except the audit, which uses CLI). Each is preceded by the kind of chat message that
          typically leads the agent to run it.
        </p>
      </section>

      <section className="grid gap-3 mb-6 md:grid-cols-3">
        <div className="rounded-lg border p-4 md:p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2">
            Operating
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground">
            Sessions 1 and 3 show the user-facing outcome: context survives tool switches, and
            later updates become the new state instead of another re-prompting burden.
          </p>
        </div>
        <div className="rounded-lg border p-4 md:p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2">
            Building
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground">
            The MCP and CLI payloads are the implementation surface. This is how agents, scripts,
            and integrations all talk to the same state layer.
          </p>
        </div>
        <div className="rounded-lg border p-4 md:p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2">
            Debugging
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground">
            The audit trail is what makes the system inspectable later: you can trace what changed,
            when it changed, and which tool authored it.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Session 1 */}
      <SectionHeading id="session-1">Operating: A conversation produces durable state</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={1} />
        <ToolBadge tool="Operating" />
        <ToolBadge tool="Cursor" />
        You're planning a freelance project with your agent. The conversation mentions a client,
        a rate, and a task. Instead of losing this when the session ends, the agent stores it.
      </p>

      <ChatPrelude>
        We&apos;re doing a freelance data-pipeline project with Sarah Chen at Lattice Health.
        She&apos;s VP Eng, the rate is $180/hr, and I need to send her the SOW by tomorrow.
      </ChatPrelude>
      <p className="text-[13px] font-mono text-muted-foreground mb-2">MCP store call</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "contact",
      name: "Sarah Chen",
      company: "Lattice Health",
      role: "VP Engineering",
      context: "Freelance data-pipeline project"
    },
    {
      entity_type: "task",
      title: "Send SOW to Sarah Chen",
      status: "pending",
      due_date: "2025-04-02",
      rate: "$180/hr"
    }
  ],
  relationships: [
    {
      relationship_type: "REFERS_TO",
      source_index: 1,
      target_index: 0
    }
  ],
  idempotency_key: "cursor-session-sarah-sow-1710268800"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response</p>
      <CodeBlock>{`{
  entities: [
    {
      entity_id: "ent_a7c3f1e209b4d8...",
      entity_type: "contact",
      observation_id: "obs_91a0e3cf..."
    },
    {
      entity_id: "ent_d42b8e5f17c6a3...",
      entity_type: "task",
      observation_id: "obs_5f28c4d1..."
    }
  ]
}`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        The contact and task are now versioned entities with provenance - who stored them,
        when, and from which session. The task links to the contact it references. This is the
        data your agent would normally lose at the end of the context window.
      </p>

      <SectionDivider />

      {/* Session 2 */}
      <SectionHeading id="session-2">Building: The same state layer works in another tool</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={2} />
        <ToolBadge tool="Building" />
        <ToolBadge tool="Claude" />
        Next morning, you open Claude to draft the SOW. Instead of re-explaining who Sarah is
        and what the project covers, the agent retrieves what it already knows. The important
        implementation detail is that Claude is using the same store and retrieve contract as the
        earlier Cursor session.
      </p>

      <ChatPrelude>
        Draft an SOW for Sarah Chen at Lattice Health for the same freelance data-pipeline
        project. Use the details we already have on her and the engagement.
      </ChatPrelude>
      <p className="text-[13px] font-mono text-muted-foreground mb-2">MCP retrieve call</p>
      <CodeBlock>{`retrieve_entity_by_identifier({
  identifier: "Sarah Chen"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response</p>
      <CodeBlock>{`{
  entity_id: "ent_a7c3f1e209b4d8...",
  entity_type: "contact",
  snapshot: {
    name: "Sarah Chen",
    company: "Lattice Health",
    role: "VP Engineering",
    context: "Freelance data-pipeline project"
  },
  observation_count: 1,
  last_observation_at: "2025-03-31T14:22:00Z"
}`}</CodeBlock>

      <p className="text-[15px] leading-7 mb-3">
        The agent drafts the SOW and records the completed task with a note on what was sent.
      </p>

      <ChatPrelude>
        I sent the SOW: 40 hours, $180/hr, starting April 7. Mark the &apos;send SOW to
        Sarah&apos; task done and note what went out.
      </ChatPrelude>
      <p className="text-[13px] font-mono text-muted-foreground mb-2">Update the task</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "task",
      title: "Send SOW to Sarah Chen",
      status: "completed",
      completed_at: "2025-04-01T09:15:00Z",
      note: "SOW sent via email - 40hr engagement, $180/hr, starts Apr 7"
    }
  ],
  idempotency_key: "claude-session-sow-sent-1710355200"
})`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        The task entity now has two observations: the original from Cursor (pending) and the
        update from Claude (completed). Both are preserved. No re-prompting was needed - Claude
        had the same state Cursor stored.
      </p>

      <SectionDivider />

      {/* Session 3 */}
      <SectionHeading id="session-3">Operating: Shared state stays current across later tool switches</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={3} />
        <ToolBadge tool="Operating" />
        <ToolBadge tool="ChatGPT" />
        A week later, Sarah emails to say the project scope changed. You discuss it in ChatGPT.
        The agent stores the updated contact, but Neotoma doesn't silently overwrite the previous
        version - it appends a new observation.
      </p>

      <ChatPrelude>
        Sarah wants to expand scope to include a monitoring dashboard, and the rate is now
        $195/hr.
      </ChatPrelude>
      <p className="text-[13px] font-mono text-muted-foreground mb-2">Updated store</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "contact",
      name: "Sarah Chen",
      company: "Lattice Health",
      role: "VP Engineering",
      context: "Scope expanded: data pipeline + monitoring dashboard",
      rate: "$195/hr"
    }
  ],
  idempotency_key: "chatgpt-session-sarah-scope-1711046400"
})`}</CodeBlock>

      <p className="text-[15px] leading-7 mb-3">
        Later, back in Cursor, you ask: "What's the latest on the Lattice Health project?"
        The agent retrieves the current snapshot and sees the full history.
      </p>

      <ChatPrelude>
        What&apos;s the latest on the Lattice Health project with Sarah Chen? Show the
        current details and what changed.
      </ChatPrelude>
      <p className="text-[13px] font-mono text-muted-foreground mb-2">Retrieve with history</p>
      <CodeBlock>{`retrieve_entity_by_identifier({
  identifier: "Sarah Chen"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response</p>
      <CodeBlock>{`{
  entity_id: "ent_a7c3f1e209b4d8...",
  entity_type: "contact",
  snapshot: {
    name: "Sarah Chen",
    company: "Lattice Health",
    role: "VP Engineering",
    context: "Scope expanded: data pipeline + monitoring dashboard",
    rate: "$195/hr"
  },
  observation_count: 2,
  last_observation_at: "2025-04-07T11:30:00Z"
}`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        The snapshot reflects the latest state. The original observation is preserved, so you
        can trace what changed - the scope expanded from "data pipeline" to
        "data pipeline + monitoring dashboard" and the rate went from $180 to $195.
      </p>

      <SectionDivider />

      {/* Audit */}
      <SectionHeading id="audit">Debugging: Trace who changed what and when</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={4} />
        <ToolBadge tool="Debugging" />
        When something looks wrong - or you just want to know the history - inspect the full
        observation trail.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground mb-3">
        You or your agent can run this from a terminal when you want a raw log-most of the time
        the agent surfaces the same history inside chat.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">CLI inspect</p>
      <CodeBlock>{`$ neotoma observations list --entity-id ent_a7c3f1e209b4d8...

OBSERVATION_ID                  CREATED_AT              SOURCE
obs_91a0e3cf...                 2025-03-31T14:22:00Z    agent:cursor-session-4f2a
  context: Freelance data-pipeline project
  rate: (not set)

obs_c8e6b2f4...                 2025-04-07T11:30:00Z    agent:chatgpt-session-7d1b
  context: Scope expanded: data pipeline + monitoring dashboard
  rate: $195/hr`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        Every field traces to a source, a timestamp, and the tool that authored it. Across three
        tools and multiple sessions, you have one consistent record with a full trail.
      </p>

      <SectionDivider />

      {/* What you stop doing */}
      <SectionHeading id="what-changes">What changes</SectionHeading>
      <div className="space-y-4 mb-6">
        <div className="rounded-lg border p-4 md:p-5">
          <p className="text-[14px] font-medium text-foreground mb-2">Before: you are the sync layer</p>
          <ul className="list-none pl-0 space-y-1.5 text-[14px] text-muted-foreground leading-6">
            <li className="flex items-start gap-2">
              <span className="text-red-400 shrink-0 mt-0.5" aria-hidden="true">&times;</span>
              Re-explain contacts, rates, and project context every session
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 shrink-0 mt-0.5" aria-hidden="true">&times;</span>
              Copy-paste between Claude, Cursor, and ChatGPT to keep them in sync
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 shrink-0 mt-0.5" aria-hidden="true">&times;</span>
              Discover a fact silently changed and have no way to trace why
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 shrink-0 mt-0.5" aria-hidden="true">&times;</span>
              Maintain markdown notes as a manual workaround for agent amnesia
            </li>
          </ul>
        </div>
        <div className="rounded-lg border p-4 md:p-5">
          <p className="text-[14px] font-medium text-foreground mb-2">After: a shared state layer handles it</p>
          <ul className="list-none pl-0 space-y-1.5 text-[14px] text-muted-foreground leading-6">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 shrink-0 mt-0.5" aria-hidden="true">&rarr;</span>
              Contacts, tasks, and decisions persist across tools and sessions
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 shrink-0 mt-0.5" aria-hidden="true">&rarr;</span>
              Any tool retrieves the same state - no re-prompting
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 shrink-0 mt-0.5" aria-hidden="true">&rarr;</span>
              Changes append versioned observations - nothing is silently overwritten
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 shrink-0 mt-0.5" aria-hidden="true">&rarr;</span>
              Every field traces to a source, timestamp, and authoring tool
            </li>
          </ul>
        </div>
      </div>

      <SectionDivider />

      {/* What this demonstrates */}
      <SectionHeading id="guarantees">Guarantees in action</SectionHeading>
      <ul className="list-none pl-0 space-y-3 mb-6">
        {[
          { label: "Cross-tool continuity", desc: "Cursor, Claude, and ChatGPT share the same state layer. Store once, retrieve anywhere." },
          { label: "Cross-session persistence", desc: "Context survives session boundaries. No context window means no re-prompting." },
          { label: "No silent mutation", desc: "Every change appends a versioned observation. You always know what the previous state was." },
          { label: "Full provenance", desc: "Every observation records who authored it, when, and from which tool and session." },
          { label: "Relationship graph", desc: "Entities link to each other. Tasks connect to the contacts and decisions they reference." },
          { label: "Replayable history", desc: "The observation log reconstructs any past state. Debug by replaying, not by guessing." },
        ].map((item) => (
          <li key={item.label} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0 font-medium" aria-hidden="true">
              &rarr;
            </span>
            <span>
              <strong>{item.label}.</strong>{" "}
              <span className="text-muted-foreground">{item.desc}</span>
            </span>
          </li>
        ))}
      </ul>

      <SectionDivider />

      {/* Go deeper */}
      <SectionHeading id="go-deeper">Go deeper</SectionHeading>
      <ul className="list-none pl-0 space-y-2 text-[15px] leading-7">
        <li>
          <TrackedProductLink
            to="/install"
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.developerWalkthroughInstall}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Install
          </TrackedProductLink>
          {" \u2014 get started in under a minute"}
        </li>
        <li>
          <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
            Architecture
          </Link>
          {" \u2014 state flow, guarantees, and how data enters Neotoma"}
        </li>
        <li>
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP reference
          </Link>
          {" \u2014 full action catalog for agents"}
        </li>
        <li>
          <Link to="/memory-guarantees" className="text-foreground underline underline-offset-2 hover:no-underline">
            Memory guarantees
          </Link>
          {" \u2014 the six guarantees every operation upholds"}
        </li>
        <li>
          <Link to="/types/contacts" className="text-foreground underline underline-offset-2 hover:no-underline">
            Entity types
          </Link>
          {" \u2014 contacts, tasks, transactions, and more"}
        </li>
      </ul>
    </DetailPage>
  );
}
