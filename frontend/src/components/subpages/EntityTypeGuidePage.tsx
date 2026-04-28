import { Link, useParams, Navigate } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { DetailPage } from "../DetailPage";
import { TrackedProductLink } from "../TrackedProductNav";
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  CODE_BLOCK_CARD_SHELL_CLASS,
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  EVALUATE_PROMPT_PILL_CLASS,
} from "../code_block_copy_button_classes";

interface EntityTypeGuide {
  slug: string;
  label: string;
  singularLabel: string;
  intro: string;
  verticalHref: string;
  verticalLabel: string;
  storeFields: { field: string; value: string }[];
  mcpStoreExample: string;
  cliStoreExample: string;
  apiStoreExample: string;
  retrieveCliExample: string;
  retrieveMcpExample: string;
  relatedQueries: string[];
}

const ENTITY_TYPE_GUIDES: EntityTypeGuide[] = [
  {
    slug: "contacts",
    label: "Contacts",
    singularLabel: "contact",
    intro:
      "People, companies, roles, and the relationships between them. Contacts are a common entity type in Neotoma - they anchor relationships, tasks, transactions, and decisions to real-world identities.",
    verticalHref: "/crm",
    verticalLabel: "CRM",
    storeFields: [
      { field: "name", value: '"Sarah Chen"' },
      { field: "email", value: '"sarah@example.com"' },
      { field: "company", value: '"Acme Corp"' },
      { field: "title", value: '"VP Engineering"' },
      { field: "relationship", value: '"client"' },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "contact",
      name: "Sarah Chen",
      email: "sarah@example.com",
      company: "Acme Corp",
      title: "VP Engineering",
      relationship: "client"
    }
  ],
  idempotency_key: "contact-sarah-chen-1710268800"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "contact",
  "name": "Sarah Chen",
  "email": "sarah@example.com",
  "company": "Acme Corp",
  "title": "VP Engineering",
  "relationship": "client"
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "contact",
      "name": "Sarah Chen",
      "email": "sarah@example.com",
      "company": "Acme Corp",
      "title": "VP Engineering",
      "relationship": "client"
    }]
  }'`,
    retrieveCliExample: `# List all contacts
neotoma entities list --type contact

# Search by name or identifier
neotoma entities search --query "Sarah Chen" --entity-type contact

# Inspect full history for one contact
neotoma observations list --entity-id <entity_id>

# See related entities (tasks, transactions, etc.)
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Find by identifier
retrieve_entity_by_identifier({
  identifier: "Sarah Chen",
  entity_type: "contact"
})

// List contacts with filters
retrieve_entities({
  entity_type: "contact",
  limit: 20
})

// Expand relationships
retrieve_related_entities({
  entity_id: "<entity_id>",
  relationship_types: ["REFERS_TO", "PART_OF"]
})`,
    relatedQueries: [
      "Who did I last meet with at Acme Corp?",
      "Show all contacts linked to the Q4 proposal",
      "What changed about Sarah's record since January?",
    ],
  },
  {
    slug: "tasks",
    label: "Tasks",
    singularLabel: "task",
    intro:
      "Obligations, deadlines, habits, and goals - tracked across sessions. Tasks in Neotoma are versioned: status changes, reassignments, and deadline shifts are recorded as observations, not overwrites.",
    verticalHref: "/personal-data",
    verticalLabel: "Personal data",
    storeFields: [
      { field: "title", value: '"Review API rollout plan"' },
      { field: "status", value: '"open"' },
      { field: "priority", value: '"high"' },
      { field: "date_due", value: '"2026-04-15"' },
      { field: "assignee", value: '"Sarah Chen"' },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "task",
      title: "Review API rollout plan",
      status: "open",
      priority: "high",
      date_due: "2026-04-15",
      assignee: "Sarah Chen"
    }
  ],
  idempotency_key: "task-review-api-rollout-1710268800"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "task",
  "title": "Review API rollout plan",
  "status": "open",
  "priority": "high",
  "date_due": "2026-04-15",
  "assignee": "Sarah Chen"
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "task",
      "title": "Review API rollout plan",
      "status": "open",
      "priority": "high",
      "date_due": "2026-04-15",
      "assignee": "Sarah Chen"
    }]
  }'`,
    retrieveCliExample: `# List open tasks
neotoma entities list --type task

# Search by keyword
neotoma entities search --query "API rollout" --entity-type task

# See how a task changed over time
neotoma observations list --entity-id <entity_id>

# Find who a task is linked to
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Find by title
retrieve_entity_by_identifier({
  identifier: "Review API rollout plan",
  entity_type: "task"
})

// List recent tasks
retrieve_entities({
  entity_type: "task",
  limit: 20
})

// Check observation history
list_observations({
  entity_id: "<entity_id>"
})`,
    relatedQueries: [
      "What tasks are due this week?",
      "Show the history of status changes for the API rollout task",
      "Which tasks are assigned to Sarah?",
    ],
  },
  {
    slug: "transactions",
    label: "Transactions",
    singularLabel: "transaction",
    intro:
      "Payments, receipts, invoices, and ledger entries - versioned, not overwritten. Financial records in Neotoma maintain full provenance: every correction, reconciliation, and status change is a new observation.",
    verticalHref: "/financial-ops",
    verticalLabel: "Financial ops",
    storeFields: [
      { field: "description", value: '"Monthly hosting - AWS"' },
      { field: "amount", value: "-284.50" },
      { field: "currency", value: '"USD"' },
      { field: "date_transacted", value: '"2026-03-01"' },
      { field: "category", value: '"infrastructure"' },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "transaction",
      description: "Monthly hosting - AWS",
      amount: -284.50,
      currency: "USD",
      date_transacted: "2026-03-01",
      category: "infrastructure",
      account: "business-checking"
    }
  ],
  idempotency_key: "txn-aws-march-2026"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "transaction",
  "description": "Monthly hosting - AWS",
  "amount": -284.50,
  "currency": "USD",
  "date_transacted": "2026-03-01",
  "category": "infrastructure",
  "account": "business-checking"
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "transaction",
      "description": "Monthly hosting - AWS",
      "amount": -284.50,
      "currency": "USD",
      "date_transacted": "2026-03-01",
      "category": "infrastructure",
      "account": "business-checking"
    }]
  }'`,
    retrieveCliExample: `# List recent transactions
neotoma entities list --type transaction

# Search by description
neotoma entities search --query "AWS" --entity-type transaction

# Trace corrections and reconciliation history
neotoma observations list --entity-id <entity_id>

# Find linked invoices or receipts
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Search by keyword
retrieve_entity_by_identifier({
  identifier: "Monthly hosting - AWS",
  entity_type: "transaction"
})

// List transactions
retrieve_entities({
  entity_type: "transaction",
  limit: 50
})

// Timeline view
list_timeline_events({
  entity_type: "transaction",
  start_date: "2026-03-01",
  end_date: "2026-03-31"
})`,
    relatedQueries: [
      "How much did we spend on infrastructure in March?",
      "Show all corrections to the AWS hosting charge",
      "Which transactions are linked to the Acme Corp account?",
    ],
  },
  {
    slug: "contracts",
    label: "Contracts",
    singularLabel: "contract",
    intro:
      "Agreements, clauses, and amendments - reconstructable on any date. Contracts in Neotoma capture the full lifecycle: initial terms, amendments, renewals, and terminations, each timestamped and attributed.",
    verticalHref: "/contracts",
    verticalLabel: "Contracts",
    storeFields: [
      { field: "title", value: '"Acme Corp - SaaS License Agreement"' },
      { field: "parties", value: '["Acme Corp"]' },
      { field: "status", value: '"active"' },
      { field: "date_effective", value: '"2026-01-15"' },
      { field: "value", value: "48000" },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "contract",
      title: "Acme Corp - SaaS License Agreement",
      parties: ["Acme Corp"],
      status: "active",
      date_effective: "2026-01-15",
      date_expiry: "2027-01-15",
      value: 48000,
      currency: "USD"
    }
  ],
  idempotency_key: "contract-acme-saas-2026"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "contract",
  "title": "Acme Corp - SaaS License Agreement",
  "parties": ["Acme Corp"],
  "status": "active",
  "date_effective": "2026-01-15",
  "date_expiry": "2027-01-15",
  "value": 48000,
  "currency": "USD"
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "contract",
      "title": "Acme Corp - SaaS License Agreement",
      "parties": ["Acme Corp"],
      "status": "active",
      "date_effective": "2026-01-15",
      "date_expiry": "2027-01-15",
      "value": 48000,
      "currency": "USD"
    }]
  }'`,
    retrieveCliExample: `# List all contracts
neotoma entities list --type contract

# Search by counterparty
neotoma entities search --query "Acme Corp" --entity-type contract

# View amendment and renewal history
neotoma observations list --entity-id <entity_id>

# Find linked clauses or amendments
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Find by identifier
retrieve_entity_by_identifier({
  identifier: "Acme Corp - SaaS License Agreement",
  entity_type: "contract"
})

// List active contracts
retrieve_entities({
  entity_type: "contract",
  limit: 20
})

// Reconstruct state at a past date
retrieve_entity_by_identifier({
  identifier: "Acme Corp - SaaS License Agreement",
  entity_type: "contract",
  as_of: "2026-06-01"
})`,
    relatedQueries: [
      "What were the terms of the Acme contract when we signed?",
      "Which contracts renew in the next 90 days?",
      "Show all amendments to the SaaS license agreement",
    ],
  },
  {
    slug: "decisions",
    label: "Decisions",
    singularLabel: "decision",
    intro:
      "Choices, rationale, and the audit trail that proves why. Decisions in Neotoma link to the inputs and context that produced them - so when the same question comes up later, you can trace the original reasoning.",
    verticalHref: "/compliance",
    verticalLabel: "Compliance",
    storeFields: [
      { field: "title", value: '"Use PostgreSQL for the data layer"' },
      { field: "status", value: '"accepted"' },
      { field: "rationale", value: '"Need JSONB, row-level security, mature tooling"' },
      { field: "decided_by", value: '"agent:cursor-session-0a3f"' },
      { field: "alternatives_considered", value: '["SQLite", "DynamoDB"]' },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "decision",
      title: "Use PostgreSQL for the data layer",
      status: "accepted",
      rationale: "Need JSONB, row-level security, mature tooling",
      decided_by: "agent:cursor-session-0a3f",
      alternatives_considered: ["SQLite", "DynamoDB"],
      decided_at: "2026-03-15T14:30:00Z"
    }
  ],
  idempotency_key: "decision-pg-datastore-1710268800"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "decision",
  "title": "Use PostgreSQL for the data layer",
  "status": "accepted",
  "rationale": "Need JSONB, row-level security, mature tooling",
  "decided_by": "agent:cursor-session-0a3f",
  "alternatives_considered": ["SQLite", "DynamoDB"],
  "decided_at": "2026-03-15T14:30:00Z"
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "decision",
      "title": "Use PostgreSQL for the data layer",
      "status": "accepted",
      "rationale": "Need JSONB, row-level security, mature tooling",
      "decided_by": "agent:cursor-session-0a3f",
      "alternatives_considered": ["SQLite", "DynamoDB"],
      "decided_at": "2026-03-15T14:30:00Z"
    }]
  }'`,
    retrieveCliExample: `# List all decisions
neotoma entities list --type decision

# Search by title or keyword
neotoma entities search --query "PostgreSQL" --entity-type decision

# Full provenance: who decided, when, and what changed
neotoma observations list --entity-id <entity_id>

# See what entities influenced this decision
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Find by title
retrieve_entity_by_identifier({
  identifier: "Use PostgreSQL for the data layer",
  entity_type: "decision"
})

// List recent decisions
retrieve_entities({
  entity_type: "decision",
  limit: 20
})

// Trace provenance
list_observations({
  entity_id: "<entity_id>"
})`,
    relatedQueries: [
      "Why did we choose PostgreSQL over SQLite?",
      "What decisions were made in the last sprint?",
      "Show the full rationale chain for the API design decision",
    ],
  },
  {
    slug: "events",
    label: "Events",
    singularLabel: "event",
    intro:
      "Meetings, milestones, and the outcomes attached to them. Events in Neotoma tie together participants, decisions, and follow-up actions - so the context from a meeting persists beyond the session where it happened.",
    verticalHref: "/personal-data",
    verticalLabel: "Personal data",
    storeFields: [
      { field: "title", value: '"Q4 Planning - Engineering"' },
      { field: "event_type", value: '"meeting"' },
      { field: "date_start", value: '"2026-03-28T10:00:00Z"' },
      { field: "attendees", value: '["Sarah Chen", "Alex Rivera"]' },
      { field: "outcome", value: '"Agreed on PostgreSQL migration timeline"' },
    ],
    mcpStoreExample: `store_structured({
  entities: [
    {
      entity_type: "event",
      title: "Q4 Planning - Engineering",
      event_type: "meeting",
      date_start: "2026-03-28T10:00:00Z",
      attendees: ["Sarah Chen", "Alex Rivera"],
      outcome: "Agreed on PostgreSQL migration timeline",
      follow_ups: ["Draft migration RFC", "Set up staging env"]
    }
  ],
  idempotency_key: "event-q4-planning-eng-20260328"
})`,
    cliStoreExample: `neotoma store --json='[{
  "entity_type": "event",
  "title": "Q4 Planning - Engineering",
  "event_type": "meeting",
  "date_start": "2026-03-28T10:00:00Z",
  "attendees": ["Sarah Chen", "Alex Rivera"],
  "outcome": "Agreed on PostgreSQL migration timeline",
  "follow_ups": ["Draft migration RFC", "Set up staging env"]
}]'`,
    apiStoreExample: `curl -X POST http://localhost:3080/api/store \\
  -H "Content-Type: application/json" \\
  -d '{
    "entities": [{
      "entity_type": "event",
      "title": "Q4 Planning - Engineering",
      "event_type": "meeting",
      "date_start": "2026-03-28T10:00:00Z",
      "attendees": ["Sarah Chen", "Alex Rivera"],
      "outcome": "Agreed on PostgreSQL migration timeline",
      "follow_ups": ["Draft migration RFC", "Set up staging env"]
    }]
  }'`,
    retrieveCliExample: `# List recent events
neotoma entities list --type event

# Search by title
neotoma entities search --query "Q4 Planning" --entity-type event

# See how meeting notes evolved
neotoma observations list --entity-id <entity_id>

# Find linked participants and follow-up tasks
neotoma relationships list --entity-id <entity_id>`,
    retrieveMcpExample: `// Find by title
retrieve_entity_by_identifier({
  identifier: "Q4 Planning - Engineering",
  entity_type: "event"
})

// List events in a date range
list_timeline_events({
  entity_type: "event",
  start_date: "2026-03-01",
  end_date: "2026-03-31"
})

// Expand related entities
retrieve_related_entities({
  entity_id: "<entity_id>",
  relationship_types: ["REFERS_TO"]
})`,
    relatedQueries: [
      "What was decided in the Q4 planning meeting?",
      "Show all meetings with Sarah this month",
      "Which follow-ups came out of the engineering sync?",
    ],
  },
];

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mb-4">
      <div className={CODE_BLOCK_CARD_SHELL_CLASS}>
        <div className="mb-3 flex flex-col gap-3">
          <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
            <div className={EVALUATE_PROMPT_PILL_CLASS}>
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
              {label}
            </div>
            <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>
              Equivalent {label} example for this entity type.
            </div>
          </div>
        </div>
        <div
          className={`${CODE_BLOCK_CARD_INNER_CLASS} p-4 font-mono text-[13px] leading-6 overflow-x-auto whitespace-pre`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3"
    >
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

function EntityTypeGuideContent({ guide }: { guide: EntityTypeGuide }) {
  return (
    <DetailPage title={guide.label}>
      <p className="text-[15px] leading-7 text-muted-foreground mb-6">
        {guide.intro}
      </p>

      <SectionHeading id="store">Store</SectionHeading>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Store a {guide.singularLabel} with any fields that describe it.
        Neotoma auto-discovers the schema from the first observation -
        no migration required.
      </p>

      <CodeBlock label="MCP">{guide.mcpStoreExample}</CodeBlock>
      <CodeBlock label="CLI">{guide.cliStoreExample}</CodeBlock>
      <CodeBlock label="REST API">{guide.apiStoreExample}</CodeBlock>

      <p className="text-[15px] leading-7 text-muted-foreground mt-4 mb-2">
        Common fields for{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-[13px]">
          {guide.singularLabel}
        </code>:
      </p>
      <div className="rounded-lg border border-border overflow-hidden mb-6">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2 font-medium text-foreground">
                Field
              </th>
              <th className="text-left px-4 py-2 font-medium text-foreground">
                Example
              </th>
            </tr>
          </thead>
          <tbody>
            {guide.storeFields.map((f) => (
              <tr key={f.field} className="border-t border-border">
                <td className="px-4 py-2">
                  <code className="text-[13px]">{f.field}</code>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <code className="text-[13px]">{f.value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[14px] leading-6 text-muted-foreground">
        Fields are flexible - add any property your workflow needs.
        The schema evolves automatically via{" "}
        <Link
          to="/schema-management"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          progressive schema enforcement
        </Link>.
      </p>

      <SectionHeading id="retrieve">Retrieve</SectionHeading>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Query {guide.label.toLowerCase()} by type, search by keyword, inspect
        version history, and traverse relationships.
      </p>

      <CodeBlock label="CLI">{guide.retrieveCliExample}</CodeBlock>
      <CodeBlock label="MCP">{guide.retrieveMcpExample}</CodeBlock>

      <SectionHeading id="example-queries">
        What your agent can answer
      </SectionHeading>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        With {guide.label.toLowerCase()} stored in Neotoma, your agent can
        answer questions like:
      </p>
      <ul className="space-y-2 mb-6">
        {guide.relatedQueries.map((q) => (
          <li
            key={q}
            className="text-[15px] leading-7 text-muted-foreground pl-4 border-l-2 border-border"
          >
            &ldquo;{q}&rdquo;
          </li>
        ))}
      </ul>

      <SectionHeading id="guarantees">
        What Neotoma guarantees
      </SectionHeading>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        Every {guide.singularLabel} stored in Neotoma gets the same set of
        integrity guarantees:
      </p>
      <ul className="list-none space-y-2 mb-6">
        {[
          ["Versioned history", "Every change creates a new version. Previous states are always accessible."],
          ["Deterministic state", "Same observations always produce the same entity snapshot."],
          ["Auditable provenance", "Every field traces back to the observation that set it."],
          ["Schema validation", "Fields conform to the discovered or defined schema."],
        ].map(([title, desc]) => (
          <li key={title} className="text-[15px] leading-7">
            <span className="font-medium text-foreground">{title}</span>
            <span className="text-muted-foreground"> - {desc}</span>
          </li>
        ))}
      </ul>
      <p className="text-[14px] leading-6 text-muted-foreground">
        See all{" "}
        <Link
          to="/memory-guarantees"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          memory guarantees
        </Link>{" "}
        compared across memory models.
      </p>

      <SectionHeading id="next-steps">Next steps</SectionHeading>
      <ul className="list-none space-y-2">
        <li>
          <TrackedProductLink
            to="/install"
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.entityTypeGuideInstall}
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            Install Neotoma
          </TrackedProductLink>{" "}
          <span className="text-muted-foreground text-[14px]">
            - get started in 5 minutes
          </span>
        </li>
        <li>
          <Link
            to="/walkthrough"
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            Walkthrough
          </Link>{" "}
          <span className="text-muted-foreground text-[14px]">
            - full multi-session example
          </span>
        </li>
        <li>
          <Link
            to={guide.verticalHref}
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            {guide.verticalLabel} use case
          </Link>{" "}
          <span className="text-muted-foreground text-[14px]">
            - see how {guide.label.toLowerCase()} fit into a broader workflow
          </span>
        </li>
      </ul>
    </DetailPage>
  );
}

export function EntityTypeGuideRouter() {
  const { slug } = useParams<{ slug: string }>();
  const guide = ENTITY_TYPE_GUIDES.find((g) => g.slug === slug);
  if (!guide) return <Navigate to="/docs" replace />;
  return <EntityTypeGuideContent guide={guide} />;
}

export const ENTITY_TYPE_GUIDE_SLUGS = ENTITY_TYPE_GUIDES.map((g) => g.slug);
