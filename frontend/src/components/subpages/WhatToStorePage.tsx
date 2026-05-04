import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

const tierRowClass = "border-b border-border last:border-b-0";
const tierLabelClass =
  "py-2 pr-4 text-[14px] font-medium text-foreground align-top whitespace-nowrap";
const tierExampleClass = "py-2 text-[14px] leading-6 text-muted-foreground";

function TierTable({
  rows,
}: {
  rows: { category: string; examples: string }[];
}) {
  return (
    <table className="w-full text-left mb-2">
      <thead>
        <tr className="border-b border-border">
          <th className="pb-1 text-[13px] font-medium text-muted-foreground">Category</th>
          <th className="pb-1 text-[13px] font-medium text-muted-foreground">Examples</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category} className={tierRowClass}>
            <td className={tierLabelClass}>{r.category}</td>
            <td className={tierExampleClass}>{r.examples}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WhatToStorePage() {
  return (
    <DetailPage title="What to store first">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma stores any structured fact that benefits from deterministic state evolution,
        versioning, and provenance. The deciding question is not &ldquo;is this personal
        data?&rdquo; but <strong>does this fact benefit from being versioned, auditable, and
        reproducible?</strong>
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        If an agent or user would later need to recall a fact, verify when it changed, trace why a
        decision was made, or reconstruct state at a point in time: it belongs in Neotoma.
      </p>

      <IntegrationSection title="Agents store for you" sectionKey="agent-driven" dividerBefore={false}>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          You do not need to decide what to store or call any APIs yourself. When Neotoma runs
          with an agent in{" "}
          <Link to="/neotoma-with-cursor" className="text-foreground underline underline-offset-2 hover:no-underline">
            Cursor
          </Link>
          ,{" "}
          <Link to="/neotoma-with-claude" className="text-foreground underline underline-offset-2 hover:no-underline">
            Claude
          </Link>
          ,{" "}
          <Link to="/neotoma-with-chatgpt" className="text-foreground underline underline-offset-2 hover:no-underline">
            ChatGPT
          </Link>
          , or any{" "}
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP-compatible client
          </Link>
          , the agent proactively extracts and stores entities from every conversation turn:
          people mentioned, tasks committed to, decisions made, and facts stated.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          The agent follows{" "}
          <Link to="/agent-instructions/store-recipes" className="text-foreground underline underline-offset-2 hover:no-underline">
            store recipes
          </Link>{" "}
          that define how to persist conversations, extract entities from attachments, link
          related records, and preserve provenance without manual intervention. It
          applies the decision heuristic below on your behalf: if a fact has recall, audit,
          or relationship value, the agent stores it automatically.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          You can always store data manually via the{" "}
          <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
            CLI
          </Link>
          ,{" "}
          <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
            REST API
          </Link>
          , or{" "}
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP tools
          </Link>
          , correct what was stored, or tell your agent to stop storing specific categories.
          The default is proactive storage with human oversight, not the other way
          around.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Any entity type, any shape" sectionKey="flexible-schemas">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Neotoma does not require you to define a schema before storing data. Store any entity with
          a descriptive <code>entity_type</code> and whatever fields the data implies. The{" "}
          <Link to="/schemas/registry" className="text-foreground underline underline-offset-2 hover:no-underline">
            schema registry
          </Link>{" "}
          infers and evolves schemas automatically as new fields appear.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Common types like <code>contact</code>, <code>task</code>, <code>transaction</code>,
          and <code>event</code> ship with sensible defaults, but you can create any type by
          storing an entity with a new <code>entity_type</code>. Fields added later trigger{" "}
          <Link to="/schemas/versioning" className="text-foreground underline underline-offset-2 hover:no-underline">
            additive schema evolution
          </Link>{" "}
          , minor version bumps that never break existing data.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Unknown fields are preserved in a <code>raw_fragments</code> layer so nothing is
          silently dropped. As schemas mature, those fragments are promoted into the validated
          schema automatically. See{" "}
          <Link to="/schemas" className="text-foreground underline underline-offset-2 hover:no-underline">
            schemas overview
          </Link>
          ,{" "}
          <Link to="/schemas/merge-policies" className="text-foreground underline underline-offset-2 hover:no-underline">
            merge policies
          </Link>
          , and{" "}
          <Link to="/schemas/storage-layers" className="text-foreground underline underline-offset-2 hover:no-underline">
            storage layers
          </Link>{" "}
          for the full picture.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Tier 1 - High-value facts" sectionKey="tier-1">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Store these proactively from the first session.
        </p>
        <TierTable
          rows={[
            { category: "People and relationships", examples: "Contacts, companies, organizations, role connections" },
            { category: "Commitments and tasks", examples: "Obligations, action items, deadlines, promises made" },
            { category: "Events and decisions", examples: "Meetings, milestones, choices with rationale" },
            { category: "Financial facts", examples: "Transactions, invoices, receipts, contracts, payments owed" },
          ]}
        />
      </IntegrationSection>

      <IntegrationSection title="Tier 2 - Contextual facts" sectionKey="tier-2">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Store when encountered in conversation, documents, or external tools.
        </p>
        <TierTable
          rows={[
            { category: "Preferences and standards", examples: "User preferences, conventions, style guides, stated constraints" },
            { category: "Project context", examples: "Codebase entities, architectural decisions, release metadata, config" },
            { category: "Documents and artifacts", examples: "Uploaded files with extracted structure, reports, specifications" },
          ]}
        />
      </IntegrationSection>

      <IntegrationSection title="Tier 3 - Derived context" sectionKey="tier-3">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Store when the derived record carries future recall, audit, or relationship value.
        </p>
        <TierTable
          rows={[
            { category: "Conversations", examples: "Agent interactions with provenance (persisted per-turn)" },
            { category: "Session state", examples: "Active environment, running tools, current working context" },
            { category: "External data", examples: "Records pulled from email, calendar, web, APIs, other MCPs" },
          ]}
        />
      </IntegrationSection>

      <IntegrationSection title="Before-and-after examples" sectionKey="examples">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">Contacts from a conversation</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">Before:</span> You mention &ldquo;Clayton
              from Acme&rdquo; in a chat. Next session, the agent has no idea who Clayton is.
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">After:</span> Agent stores a{" "}
              <code>contact</code> entity with name, company, and a REFERS_TO link to the
              conversation. Next session, Clayton&rsquo;s full context is retrieved instantly.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">Task from a commitment</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">Before:</span> &ldquo;I need to follow up
              with Sarah by Friday.&rdquo; The commitment exists only in that session.
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">After:</span> Agent stores a{" "}
              <code>task</code> entity with title, due date, and REFERS_TO Sarah&rsquo;s contact.
              Task persists across sessions and tools.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">Decision with rationale</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">Before:</span> You decide on PostgreSQL
              over MySQL. Three weeks later, no one remembers why.
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">After:</span> Agent stores a{" "}
              <code>decision_note</code> with rationale and context. The reasoning is versioned and
              traceable.
            </p>
          </div>
        </div>
      </IntegrationSection>

      <IntegrationSection title="Decision heuristic" sectionKey="heuristic">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          When deciding whether to store something, apply this test. If any answer is yes, store it.
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Recallability</span>: Would an agent or
            user need this fact again in a future session?
          </li>
          <li>
            <span className="font-medium text-foreground">Auditability</span>: Would someone need
            to know when this was recorded or how it changed?
          </li>
          <li>
            <span className="font-medium text-foreground">Reproducibility</span>: Would
            reconstructing past state require this fact?
          </li>
          <li>
            <span className="font-medium text-foreground">Relationship value</span>: Does this
            connect to other entities (people, tasks, events)?
          </li>
        </ol>
      </IntegrationSection>

      <IntegrationSection title="What NOT to store" sectionKey="not-store">
        <TierTable
          rows={[
            { category: "Ephemeral output", examples: "No future recall value; no benefit from versioning" },
            { category: "Duplicate records", examples: "Already in Neotoma; check before storing" },
            { category: "Inferred or predicted data", examples: "Neotoma stores facts, not guesses" },
            { category: "Unapproved data", examples: "Explicit user control required" },
            { category: "Credentials and secrets", examples: "Belong in secret managers, not state layers" },
          ]}
        />
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground mt-8">
        Ready to start?{" "}
        <Link to="/install" className="text-foreground underline underline-offset-2 hover:no-underline">
          Install Neotoma
        </Link>
        , then{" "}
        <Link to="/walkthrough" className="text-foreground underline underline-offset-2 hover:no-underline">
          follow the walkthrough
        </Link>{" "}
        to see storage in action. See{" "}
        <Link to="/backup" className="text-foreground underline underline-offset-2 hover:no-underline">
          backup and restore
        </Link>{" "}
        to protect your data.
      </p>
    </DetailPage>
  );
}
