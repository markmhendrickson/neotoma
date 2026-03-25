import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
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

export function DeveloperWalkthroughPage() {
  return (
    <DetailPage title="Developer walkthrough">
      <section className="mb-6">
        <p className="text-[15px] leading-7 font-medium text-foreground mb-4">
          A multi-session coding agent that remembers project decisions, acts on them across
          sessions, resolves conflicts with versioned history, and produces an auditable trail.
        </p>
        <p className="text-[15px] leading-7 text-muted-foreground">
          This walkthrough uses MCP{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[13px]">store</code> calls.
          The same operations are available via{" "}
          <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
            CLI
          </Link>{" "}
          and{" "}
          <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
            REST API
          </Link>.
        </p>
      </section>

      <SectionDivider />

      {/* Session 1 */}
      <SectionHeading id="session-1">Session 1: Store a decision</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={1} />
        A coding agent decides on PostgreSQL for the data layer.
        It stores the decision as a typed entity via MCP.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">MCP store call</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "architectural_decision",
      title: "Use PostgreSQL for the data layer",
      status: "accepted",
      rationale: "Need JSONB support, row-level security, and mature tooling",
      decided_by: "agent:cursor-session-0a3f"
    }
  ],
  idempotency_key: "decision-pg-datastore-1710268800"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response</p>
      <CodeBlock>{`{
  entities: [
    {
      entity_id: "ent_84f2a1bc09e3d7...",
      entity_type: "architectural_decision",
      observation_id: "obs_3a91c0ef..."
    }
  ]
}`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        The decision is now a versioned entity with provenance: who stored it, when, and from
        which session. The structured path runs without an LLM or interpretation. The agent
        authored the data; Neotoma validated and recorded it.
      </p>

      <SectionDivider />

      {/* Session 2 */}
      <SectionHeading id="session-2">Session 2: Retrieve and act</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={2} />
        New session, new context window. The agent retrieves stored decisions before acting.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">MCP retrieve call</p>
      <CodeBlock>{`retrieve_entities({
  entity_type: "architectural_decision",
  query: "data layer"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response</p>
      <CodeBlock>{`{
  entities: [
    {
      entity_id: "ent_84f2a1bc09e3d7...",
      entity_type: "architectural_decision",
      snapshot: {
        title: "Use PostgreSQL for the data layer",
        status: "accepted",
        rationale: "Need JSONB support, row-level security, and mature tooling",
        decided_by: "agent:cursor-session-0a3f"
      }
    }
  ]
}`}</CodeBlock>

      <p className="text-[15px] leading-7 mb-3">
        The agent generates a migration based on the decision, then stores the action with a
        relationship back to the decision.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Store the action</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "task",
      title: "Create initial PostgreSQL migration",
      status: "completed",
      output: "migrations/001_create_tables.sql"
    }
  ],
  relationships: [
    {
      relationship_type: "REFERS_TO",
      source_index: 0,
      target_entity_id: "ent_84f2a1bc09e3d7..."
    }
  ],
  idempotency_key: "task-pg-migration-1710355200"
})`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        Two entities are now linked in the memory graph: the decision and the task it produced.
        Both have independent provenance and version history.
      </p>

      <SectionDivider />

      {/* Session 3 */}
      <SectionHeading id="session-3">Session 3: Conflict and resolution</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={3} />
        A different tool (or the user) stores a contradicting decision.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Contradicting store</p>
      <CodeBlock>{`store({
  entities: [
    {
      entity_type: "architectural_decision",
      title: "Use PostgreSQL for the data layer",
      status: "superseded",
      rationale: "Switching to SQLite for local-first deployment",
      decided_by: "user:mark"
    }
  ],
  idempotency_key: "decision-sqlite-switch-1710441600"
})`}</CodeBlock>

      <p className="text-[15px] leading-7 mb-3">
        Neotoma does not silently overwrite. A new observation is appended to the same entity.
        Both versions exist with full provenance. The agent retrieves and sees the history.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Retrieve with history</p>
      <CodeBlock>{`retrieve_entity_by_identifier({
  identifier: "Use PostgreSQL for the data layer"
})`}</CodeBlock>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">Response (versioned snapshot)</p>
      <CodeBlock>{`{
  entity_id: "ent_84f2a1bc09e3d7...",
  entity_type: "architectural_decision",
  snapshot: {
    title: "Use PostgreSQL for the data layer",
    status: "superseded",
    rationale: "Switching to SQLite for local-first deployment",
    decided_by: "user:mark"
  },
  observation_count: 2,
  last_observation_at: "2025-03-14T16:00:00Z"
}`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        The snapshot reflects the latest state. The previous observation is preserved, so the
        agent (or a human) can inspect the full trail to understand what changed and why.
      </p>

      <SectionDivider />

      {/* Audit */}
      <SectionHeading id="audit">Audit: Inspect the trail</SectionHeading>
      <p className="text-[15px] leading-7 mb-3">
        <StepNumber n={4} />
        Inspect the full observation history for the entity via CLI.
      </p>

      <p className="text-[13px] font-mono text-muted-foreground mb-2">CLI inspect</p>
      <CodeBlock>{`$ neotoma observations list --entity-id ent_84f2a1bc09e3d7...

OBSERVATION_ID                  CREATED_AT              SOURCE
obs_3a91c0ef...                 2025-03-13T00:00:00Z    agent:cursor-session-0a3f
  status: accepted
  rationale: Need JSONB support, row-level security, and mature tooling

obs_7b44e2d1...                 2025-03-14T16:00:00Z    user:mark
  status: superseded
  rationale: Switching to SQLite for local-first deployment`}</CodeBlock>

      <p className="text-[14px] leading-6 text-muted-foreground mb-2">
        Every field traces to a source, timestamp, and author. You can answer
        &ldquo;who changed this, when, and why&rdquo; for any entity at any point in time.
      </p>

      <SectionDivider />

      {/* What this demonstrates */}
      <SectionHeading id="what-this-demonstrates">What this demonstrates</SectionHeading>
      <ul className="list-none pl-0 space-y-3 mb-6">
        {[
          { label: "Cross-session continuity", desc: "State persists across context windows. No re-prompting." },
          { label: "Structured storage", desc: "Agent authors typed entities via the structured path. No hidden LLM in the pipeline." },
          { label: "Relationship graph", desc: "Entities link to each other. Decisions connect to the tasks they produce." },
          { label: "No silent mutation", desc: "Conflicting facts append observations. Nothing is overwritten." },
          { label: "Full provenance", desc: "Every observation records who, when, and from what source." },
          { label: "Replayable history", desc: "The observation log reconstructs any past state." },
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
          <Link to="/architecture#how-data-enters" className="text-foreground underline underline-offset-2 hover:no-underline">
            How data enters Neotoma
          </Link>
          {" \u2014 structured vs unstructured storage paths"}
        </li>
        <li>
          <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
            Architecture
          </Link>
          {" \u2014 state flow, guarantees, and core principles"}
        </li>
        <li>
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP reference
          </Link>
          {" \u2014 full action catalog for agents"}
        </li>
        <li>
          <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
            CLI reference
          </Link>
          {" \u2014 commands and flags"}
        </li>
        <li>
          <Link to="/install" className="text-foreground underline underline-offset-2 hover:no-underline">
            Install
          </Link>
          {" \u2014 get started in under a minute"}
        </li>
      </ul>
    </DetailPage>
  );
}
