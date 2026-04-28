import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const sectionHeading = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
const paragraph = "text-[15px] leading-7 mb-4";
const listClass = "list-none pl-0 space-y-2 mb-6";
const listItem = "text-[15px] leading-7 text-muted-foreground";
const inlineLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function AgentInstructionsRetrievalPage() {
  return (
    <DetailPage title="Agent instructions: Retrieval, provenance, and tasks">
      <p className={paragraph}>
        <Link to="/agent-instructions" className={inlineLink}>← Agent instructions</Link>
      </p>

      <h2 className={sectionHeading}>Retrieval</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Query shape.</strong>{" "}
          <code>retrieve_entity_by_identifier</code> for concrete identifiers (names, emails,
          ids, exact titles); <code>retrieve_entities</code> scoped by entity_type with an
          explicit limit or time window for plural/category queries (&quot;last N
          transactions&quot;, &quot;recent tasks&quot;).
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Guardrails.</strong> Start with small, targeted
          queries. Avoid broad scans unless necessary. Use retrieved facts when relevant; if
          bounded retrieval finds nothing, proceed normally without inventing memory-backed
          claims.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Publication-recency.</strong> For
          &quot;recently published&quot; questions, sort by publication timestamp
          (<code>published_date</code> / <code>published_at</code>) descending, not by
          observation recency. Use a sufficient page size and dedupe by{" "}
          <code>entity_id</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Entity-type cardinality.</strong> For
          &quot;how many entities per type&quot; questions, answer from{" "}
          <code>getStats</code> / <code>GET /stats</code> →{" "}
          <code>entities_by_type</code> first. <code>list_entity_types</code> reports schema
          field width, not row counts; never substitute one for the other.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Bounded completeness.</strong> For list/count
          answers from entity graphs, check likely equivalent containers/identifiers and
          relationship variants, dedupe by <code>entity_id</code>, and report the reconciled
          total (or note remaining ambiguity).
        </li>
      </ul>

      <h2 className={sectionHeading}>Provenance</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Source provenance is required.</strong> Every
          entity carries traceable source data. For file-derived data, use the combined store
          path (entities + <code>file_path</code> or{" "}
          <code>file_content+mime_type</code>) and include <code>source_file</code>. For API
          or tool-sourced data, set <code>data_source</code> (tool, endpoint, date) and store
          the raw payload as <code>api_response_data</code>. FORBIDDEN: storing entities with
          no traceable source unless the data is purely user-stated in chat.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Three-layer analysis.</strong> When analyzing a
          named entity from source material, persist all three layers in the same turn: (1)
          the raw source artifact, (2) the named entity updated with sourced facts, (3) a
          synthesized note/report capturing derived conclusions. Link with{" "}
          <code>REFERS_TO</code> or <code>EMBEDS</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Reuse pre-existing sources.</strong> If a raw
          source already exists in Neotoma, retrieve it and link the current
          conversation-derived entities to it in the same turn, do not rely on an earlier
          store remaining discoverable without a relationship.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Source content retrieval.</strong> Files stored
          via the combined path are downloadable at <code>GET /sources/:id/content</code>;
          observations carry <code>source_id</code> for linkage. UIs should expose this
          endpoint so users can inspect the original artifact.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Unstructured payload retention.</strong>{" "}
          User-provided files, paths, @-references, attachments, uploads, and pasted blobs
          MUST be persisted in the same turn via the unstructured path with the attachment
          recipe. Host-only copies (Desktop, Downloads, repo folders) are not sufficient
          retention.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Synthesized deliverables.</strong> Reviews,
          reports, plans, audits, comparative analyses, legal/competitive/market/technical
          research are stored as a structured entity (e.g.{" "}
          <code>legal_research</code>, <code>competitive_analysis</code>,{" "}
          <code>technical_research</code>, <code>report</code>) with title, subject,
          conclusion, key_findings, sources, caveats, and research_date. Do not respond with
          findings without storing them in the same turn.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Analysis durability.</strong> When asked for
          analysis or a briefing, do not rely only on chat message rows, persist a
          structured note/report/research entity rich enough to reconstruct the answer, then
          link it to the analyzed entity and source.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Agent-authored deliverables.</strong> When the
          agent creates or materially edits a markdown, text, JSON, CSV, or similar file
          that is the substantive deliverable, store the file via the combined path, persist
          a structured entity describing it, and link the file asset, deliverable entity,
          and originating message. Repo-only or working-tree copies are not durable.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Session-derived artifacts.</strong> Any entity
          created from the current conversation in a separate store call MUST be linked back
          via <code>REFERS_TO</code> in the same turn (from the prompting user message or
          from the new entity to the conversation). Multi-file loops must not end the turn
          until every new entity is linked.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Per-turn linkage invariant.</strong> Every
          non-bookkeeping entity touched in a turn MUST carry a <code>REFERS_TO</code> edge
          from either the user message (creates/updates) or the assistant message
          (reply-cited).
        </li>
      </ul>

      <h2 className={sectionHeading}>Tasks and commitments</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Base rule.</strong> Create a task when the user
          expresses intent, obligation, or future action (&quot;I need to&quot;, &quot;remind
          me&quot;, deadlines). Set <code>due_date</code> when available and link to the
          relevant person or entity.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Outreach and reply-drafting.</strong> When you
          produce or refine outbound text that commits the user to a future step with a
          named counterparty (&quot;I'll reach out when…&quot;, &quot;I'll send X after Y&quot;,
          &quot;I'll loop back once…&quot;), create a task and link it to the counterparty
          contact via <code>REFERS_TO</code>. Reuse the contact after retrieval; create if
          missing. Closers without a concrete follow-up do not require a task.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Scheduling cues.</strong> When email, chat,
          screenshot, or pasted text implies arranging a future meeting or call (&quot;pencil
          in&quot;, &quot;another for [month]&quot;, &quot;sync again&quot;, &quot;catch up
          later&quot;), create a task in the same extraction/store turn. Set{" "}
          <code>due_date</code> when a month or date is inferable; link the task to the
          relevant contact.
        </li>
      </ul>
    </DetailPage>
  );
}
