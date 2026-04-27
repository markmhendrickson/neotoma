import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const sectionHeading = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
const subHeading = "text-[15px] font-medium tracking-[-0.01em] mt-5 mb-2";
const paragraph = "text-[15px] leading-7 mb-4";
const listClass = "list-none pl-0 space-y-2 mb-6";
const listItem = "text-[15px] leading-7 text-muted-foreground";
const inlineLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function AgentInstructionsPage() {
  return (
    <DetailPage title="Agent instructions">
      <p className={paragraph}>
        These are the mandatory behavioral rules every agent follows when using Neotoma. They
        apply equally to <Link to="/mcp" className={inlineLink}>MCP</Link> (preferred when
        installed and running) and the <Link to="/cli" className={inlineLink}>CLI</Link>
        {" "}(used as a backup), so chat persistence, entity extraction, retrieval, attribution,
        and display behavior are identical across transports.
      </p>
      <p className={paragraph}>
        This page mirrors the canonical instruction block shipped to MCP clients at runtime.
        For the verbatim source see{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp/instructions.md"
          className={inlineLink}
        >
          docs/developer/mcp/instructions.md
        </a>
        ; the CLI-equivalent rules live in{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/cli_agent_instructions.md"
          className={inlineLink}
        >
          docs/developer/cli_agent_instructions.md
        </a>
        . The two are kept in parity by the sync rules under{" "}
        <code>.cursor/rules/developer_agent_instructions_sync_rules.mdc</code>.
      </p>

      <h2 className={sectionHeading}>Turn lifecycle</h2>
      <p className={paragraph}>
        Every turn MUST complete in this order: (1) bounded retrieval, (2) user-phase store,
        (3) other MCP calls or host tool use, (4) compose the assistant reply, (5) closing
        store of the assistant reply. Do not respond before steps 1 and 2 are complete, and do
        not end the turn before step 5 unless the user explicitly waived persistence or the
        turn produced no user-visible reply.
      </p>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Step 1, Bounded retrieval.</strong> Use{" "}
          <code>retrieve_entity_by_identifier</code> for concrete identifiers (names, emails,
          ids, exact titles) and <code>retrieve_entities</code> for category or list queries;
          reuse or link existing records when matches surface.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 2, User-phase store.</strong> Persist the
          conversation, the current user message, and any entities implied by the message in
          one <code>store_structured</code> call. If the user attached a file, include it in
          the same request and add the EMBEDS link. MUST NOT skip this for greetings or
          minimal messages.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 3, Other actions.</strong> Host IDE tools
          (read_file, apply_patch, run_terminal_cmd, grep, codebase_search, web fetch) and
          other MCP tools may run only after steps 1 and 2 are complete. Host tools are not
          exempt from store-first.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 4, Compose reply.</strong> Synthesize the
          answer using retrieval results and tool output.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 5a, Closing store.</strong> After the
          user-visible reply is finalized, call <code>store_structured</code> with a single
          <code>conversation_message</code> entity (<code>role: "assistant"</code>,{" "}
          <code>sender_kind: "assistant"</code>, exact reply text,{" "}
          <code>turn_key: "{`{conversation_id}:{turn_id}:assistant`}"</code>) and an{" "}
          <code>idempotency_key</code> of{" "}
          <code>conversation-{`{conversation_id}-{turn_id}`}-assistant-{`{suffix}`}</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 5b, Closing relationship.</strong> Add{" "}
          <code>create_relationship(PART_OF, assistant_message_id, conversation_id)</code>{" "}
          targeting the conversation already created in step 2, never a new conversation.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 5b.1, Reply-cited edges.</strong> Add{" "}
          <code>REFERS_TO</code> from the assistant message to every entity the reply
          materially cites or produces (synthesized notes/reports created this turn, existing
          entities named in the reply text). Skip when the edge already exists; chat
          bookkeeping (conversation, message) is excluded.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Step 5c, Skip rules.</strong> Skip the closing
          store only when there is no user-visible assistant reply or the user explicitly
          waived persistence. FORBIDDEN: persisting the user message without storing the
          assistant reply when you did reply.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Rapid-fire sessions.</strong> The store-first
          rule applies even during many small, fast instructions. If batching, store at
          minimum every 3-5 turns; never go an entire session without storing.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Backfill.</strong> If asked to capture missed
          earlier turns or run <code>/learn</code> after a gap, store those user messages and
          assistant replies in the same turn (verbatim preferred; concise paraphrase when the
          transcript is unavailable). Do not defer to a later session.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">MCP availability detection.</strong> Do not
          infer availability from a workspace <code>.mcp.json</code> alone. If the host
          exposes Neotoma MCP tools or another active Neotoma transport, treat Neotoma as
          available and follow store-first.
        </li>
      </ul>

      <h2 className={sectionHeading}>Store recipes</h2>
      <p className={paragraph}>
        Use only the recipes below. MUST NOT list, glob, or read MCP tool descriptor or schema
        files for chat, attachment, or entity-extraction flows. Tool parameters:{" "}
        <code>store_structured(entities, idempotency_key, relationships, file_path|file_content+mime_type, file_idempotency_key?)</code>{" "}
        and <code>create_relationship(relationship_type, source_entity_id, target_entity_id)</code>.
        Response IDs come back as <code>structured.entities[].entity_id</code> and{" "}
        <code>unstructured.asset_entity_id</code>.
      </p>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Relationship batching.</strong> When related
          entities are created in the same call, define ALL their links via the{" "}
          <code>relationships</code> array using{" "}
          <code>{`{ relationship_type, source_index, target_index }`}</code> entries. Do not
          issue one <code>create_relationship</code> call per link when batching is possible.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Turn identity.</strong> Use host conversation
          and turn ids when available. If absent, build a synthetic{" "}
          <code>conversation_id</code> (never a generic prefix like <code>cursor</code>{" "}
          alone) plus a turn index/timestamp; set{" "}
          <code>turn_key = "{`{conversation_id}:{turn_id}`}"</code> and a unique{" "}
          <code>idempotency_key</code>. Unscoped turn keys cause cross-conversation entity
          collisions.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Fallback IDs.</strong> When the host gives no
          ids at all, use{" "}
          <code>idempotency_key "conversation-chat-&lt;turn&gt;-&lt;timestamp_ms&gt;"</code>{" "}
          and <code>turn_key "chat:&lt;turn&gt;"</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">observation_source.</strong> Optional flag
          describing the kind of write, <code>sensor</code> (deterministic tool/telemetry),{" "}
          <code>workflow_state</code> (state-machine transitions),{" "}
          <code>llm_summary</code> (the default; omit it for ordinary chat),{" "}
          <code>human</code> (direct edit/acceptance), or <code>import</code> (batch/ETL).
          Used as a tie-break after <code>source_priority</code>; one value applies to every
          observation produced by the request.
        </li>
      </ul>

      <h3 className={subHeading}>User-phase (one call per user message)</h3>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Shape.</strong> entities = [
          <code>{`{ entity_type: "conversation", title? }`}</code>,{" "}
          <code>
            {`{ entity_type: "conversation_message", role: "user", sender_kind: "user", content: "<exact message>", turn_key: "{conversation_id}:{turn_id}" }`}
          </code>
          , …optional extracted entities]. Indices: 0 = conversation, 1 = message, 2+ =
          extracted. The legacy <code>agent_message</code> type is accepted as an alias and
          resolved to <code>conversation_message</code> for pre-v0.6 clients.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Relationships.</strong> Always{" "}
          <code>PART_OF</code> from message (1) to conversation (0). For every entity created
          OR updated this turn, add <code>REFERS_TO</code> from the message to that entity.
          Skip when the edge already exists.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Naming.</strong> Keep names human-readable. For{" "}
          <code>conversation_message</code>, set <code>canonical_name</code> to a concise
          summary; never use turn keys, raw ids, timestamps, or tool names as the primary
          label. For <code>conversation</code>, keep <code>title</code> topical and update
          only when the central topic materially changes.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Canonical-name scope.</strong>{" "}
          <code>canonical_name</code> is a short label, not a container for every detail. Put
          message body in <code>content</code> and extra semantics in fields like{" "}
          <code>title</code>, <code>subject</code>, <code>summary</code>,{" "}
          <code>description</code>, <code>turn_key</code>, <code>role</code>,{" "}
          <code>status</code>, etc.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Extraction.</strong> If the message implies an
          entity (purchase, task, event, person, place, etc.), append it with a descriptive{" "}
          <code>entity_type</code> and the properties the message implies, no fixed schema.
          Do not call <code>list_entity_types</code> before storing.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">idempotency_key.</strong>{" "}
          <code>conversation-{`{conversation_id}`}-{`{turn_id}`}-{`{suffix}`}</code> or, on
          fallback, <code>conversation-chat-&lt;turn&gt;-{`{suffix}`}</code>.
        </li>
      </ul>

      <h3 className={subHeading}>Attachments (one call: file + entities together)</h3>
      <ol className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Parse.</strong> PDFs go through{" "}
          <code>parse_file</code>; text/CSV/JSON/Markdown read directly; images use vision. If
          parsing yields no usable text, store the raw file only.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Extract.</strong> One snake_case field per
          fact, no invention. Use a descriptive <code>entity_type</code> matching the
          document (receipt, invoice, note, contract, person, contact, company, task, event,
          transaction, etc.).
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Store.</strong> One{" "}
          <code>store_structured</code> with [conversation, user message, …extracted
          entities], idempotency key, <code>relationships</code> with{" "}
          <code>PART_OF</code> (message→conversation) and any{" "}
          <code>REFERS_TO</code> edges, plus <code>file_path</code> (resolve to absolute) or{" "}
          <code>file_content + mime_type</code>. Optional{" "}
          <code>file_idempotency_key: "file-&lt;short-slug&gt;"</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">EMBEDS.</strong>{" "}
          <code>create_relationship(EMBEDS, user_message_id, asset_entity_id)</code> using
          the ids returned by step 3.
        </li>
      </ol>

      <h3 className={subHeading}>Screenshots and images</h3>
      <p className={paragraph}>
        Use the attachment recipe. Extract every distinct entity visible in the image (people,
        messages, dates, criteria, tasks, events, offers, transactions) before responding.
        Add <code>PART_OF</code> (message→conversation), <code>REFERS_TO</code>{" "}
        (message→each extracted entity), and <code>EMBEDS</code> (message→file entity).
      </p>

      <h3 className={subHeading}>Chat fallbacks</h3>
      <ul className={listClass}>
        <li className={listItem}>
          Overwriting between branches is acceptable; users can audit history via{" "}
          <code>list_observations</code>. For reverted turns, optionally call{" "}
          <code>create_relationship(SUPERSEDES, new_message_id, previous_message_id)</code>.
        </li>
        <li className={listItem}>
          When a client does not support inline relationships: call{" "}
          <code>store_structured</code> first, then{" "}
          <code>create_relationship(PART_OF, message_id, conversation_id)</code> and one{" "}
          <code>REFERS_TO</code> per extracted entity.
        </li>
      </ul>

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

      <h2 className={sectionHeading}>Entity types and schema</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Schema-agnostic for chat.</strong> Use a
          descriptive <code>entity_type</code> and whatever properties the message implies;
          the server accepts arbitrary fields. Do not call <code>list_entity_types</code>{" "}
          before storing.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Type reuse.</strong> Before introducing a new
          type, check for semantic equivalents (singular vs plural, person/contact,
          social_post/social_media_post). Prefer the type with more existing entities;
          consult <code>list_entity_types</code> with a keyword search if the cached list is
          stale. FORBIDDEN: creating a new type when an equivalent exists.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Schema evolution.</strong> Use{" "}
          <code>update_schema_incremental</code> to add fields (minor bump) or remove fields
          via <code>fields_to_remove</code> (major bump). Removed fields are excluded from
          snapshots but observation data is preserved; re-adding restores them. At least one
          field must remain.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Existing-entity correction.</strong> When
          fixing inaccurate values or normalizing ad hoc fields into an established schema,
          use <code>correct</code> on the existing entity rather than creating a duplicate.
          Prefer canonical schema fields over ad hoc additions.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Type consistency in a workflow.</strong>{" "}
          Within one import or workflow, pick one canonical type and keep it consistent. For
          generic financial rows, default to <code>transaction</code> and store
          source-specific details as fields (provider, account_suffix, value_date, concept).
        </li>
        <li className={listItem}>
          <strong className="text-foreground">conversation_message sender semantics.</strong>{" "}
          Always set <code>sender_kind</code> (one of <code>user</code>,{" "}
          <code>assistant</code>, <code>agent</code>, <code>system</code>,{" "}
          <code>tool</code>) alongside the legacy <code>role</code> field. For agent-to-agent
          traffic, set <code>sender_kind: "agent"</code> with{" "}
          <code>sender_agent_id</code> and optional <code>recipient_agent_id</code>. For the
          parent <code>conversation</code>, set <code>thread_kind</code> to{" "}
          <code>human_agent</code>, <code>agent_agent</code>, or <code>multi_party</code>.
        </li>
      </ul>

      <h2 className={sectionHeading}>Communication and display</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Silent storage default.</strong> Do not mention
          storage, memory, or linking unless the user asked, except when a turn created,
          updated, or retrieved entities (then the display rule below applies). Do not
          narrate internal persistence (&quot;Storing the conversation first&quot;). When
          confirming, use memory-related language (&quot;remember&quot;, &quot;recall&quot;,
          &quot;stored in memory&quot;).
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Proactive storage.</strong> Store when the user
          states relevant information; store first, then respond. Do not skip storage just
          because the user did not ask to save.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Repo canon is additive.</strong> When asked to
          capture a durable principle or standing rule in a repo document, persist the
          durable fact in Neotoma in the same turn, then update the repo document if the
          repo is also a source of truth. &quot;This belongs in the repo&quot; is not a
          reason to skip Neotoma.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">External tool store-first.</strong> When you
          pull data from any external source (email, calendar, search, web fetch, scrape,
          API, file read), extract and store people, companies, locations, events, tasks,
          notifications, device status, and relationships in the same turn, before
          responding. Create tasks for action items.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Depth of capture.</strong> List/summary
          responses are index rows, not the final payload. Hydrate via the matching detail
          endpoint and persist both layers under <code>api_response_data.list</code> and{" "}
          <code>api_response_data.detail</code>.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <em>Scope cap:</em> hydrate up to ~10 items per turn unless the user asks for
              more.
            </li>
            <li>
              <em>Size cap:</em> if a detail body exceeds ~100 KB, persist via the
              unstructured path and link with <code>EMBEDS</code>.
            </li>
            <li>
              <em>Sensitivity:</em> for email/DM/document sources, persist the body but do
              not echo it into chat beyond what answering requires.
            </li>
            <li>
              <em>Idempotent upgrade:</em> hydrate via <code>correct</code> on an existing{" "}
              <code>entity_id</code> rather than creating a duplicate.
            </li>
            <li>
              <em>Tool-capability awareness:</em> only hydrate when a detail endpoint exists
              and is cheap. Otherwise persist what the list returned and set{" "}
              <code>capture_depth: "summary_only"</code> for later enrichment.
            </li>
          </ul>
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Embedded entity extraction.</strong> Once a
          payload is in hand, scan for first-class entities (a subscription charge in a
          billing email → <code>transaction</code>; a meeting proposal → <code>event</code>{" "}
          + <code>task</code>; an order in a receipt → one <code>order_item</code> per
          line). Store each alongside the container in the same call, with its own{" "}
          <code>data_source</code>, <code>source_quote</code>, and normalized fields. Link
          container→embedded with <code>REFERS_TO</code>. Cap embedded extractions per
          container at ~20 items.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">User identity.</strong> When the user provides
          or implies their identity (name, email, &quot;me&quot;), store as contact or
          person in the same turn.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Extract-all.</strong> Extract every distinct
          entity from the user, people, tasks, events, commitments, preferences,
          possessions, relationships, places. For container+asset, use <code>EMBEDS</code>{" "}
          when the asset is in Neotoma; otherwise store only a reference on the container.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Display rule.</strong> When a turn creates,
          updates, or retrieves non-bookkeeping entities, render a section headed{" "}
          <code>🧠 Neotoma</code> with a horizontal rule above it.
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <em>Groups:</em> only non-empty <code>Created (N)</code>,{" "}
              <code>Updated (N)</code>, <code>Retrieved (N)</code>, and{" "}
              <code>Ambiguous (N)</code>; <code>Ambiguous</code> appears when the store
              response includes <code>warnings[]</code> with{" "}
              <code>code: "HEURISTIC_MERGE"</code>.
            </li>
            <li>
              <em>Store disambiguation:</em> entities created or observation-updated this
              turn (including external-tool ingestion) appear under{" "}
              <code>Created</code> or <code>Updated</code>, never under{" "}
              <code>Retrieved</code>.
            </li>
            <li>
              <em>Bullet format:</em> each bullet starts with one schema-typed emoji (✅
              task, 👤 contact, 🏢 company, 📅 event, ✉️ email_message, 🧾 receipt, 💸
              transaction, 📝 note, 📍 place, 📎 file_asset, 🔍 research, 💬{" "}
              product_feedback; default 🗂️), uses a short primary label, omits verbs
              already in the group header, and ends with the schema{" "}
              <code>entity_type</code> in inline-code parentheses.
            </li>
            <li>
              <em>Empty state:</em> before rendering an empty-state or{" "}
              <code>Suggestions</code> block, run a final capture pass, store any concrete
              candidate (synthesized note/report, implied task, authored artifact) and
              render it under <code>Created</code>/<code>Updated</code> instead of
              suggesting it.
            </li>
            <li>
              <em>Override scope:</em> the display rule overrides the silent-storage default
              and the no-emoji style for this disclosure only; do not narrate internal
              sequencing.
            </li>
          </ul>
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Weekly value surfacing.</strong> When the
          conversation is the first of the day or the user has not interacted for several
          days, run a bounded retrieval (recent time window or{" "}
          <code>list_timeline_events</code> for the past 7 days) and surface a 1-2 sentence
          summary. Do not surface this more than once per day.
        </li>
      </ul>

      <h2 className={sectionHeading}>Attribution and agent identity</h2>
      <p className={paragraph}>
        Every write to Neotoma is attributed per row and surfaces in the Inspector,{" "}
        <code>/stats</code>, and audit trails. Self-identification is a user-facing
        contract, see the{" "}
        <Link to="/aauth" className={inlineLink}>
          AAuth reference
        </Link>{" "}
        for the full attribution flow.
      </p>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Preferred, AAuth.</strong> Sign requests with
          AAuth (RFC 9421 HTTP Message Signatures plus an <code>aa-agent+jwt</code> agent
          token). Verified agents render with a <code>hardware</code> trust badge for
          ES256/EdDSA keys or <code>software</code> for other algorithms. Honoured on{" "}
          <code>/mcp</code>, direct write routes, and <code>/session</code>; the same
          identity threads into the write-path services regardless of transport.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Fallback, clientInfo.</strong> When AAuth is
          unavailable, set <code>clientInfo.name</code> and <code>clientInfo.version</code>{" "}
          on the MCP <code>initialize</code> handshake to a recognisable identifier (e.g.{" "}
          <code>cursor-agent</code> + build, <code>claude-code</code> + release). Generic
          values like <code>mcp</code>, <code>client</code>, <code>unknown</code>, or{" "}
          <code>anonymous</code> are normalised to the <code>anonymous</code> tier.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Optional free-form label.</strong> Scripts and
          CI jobs may include <code>agent_label</code> or <code>agent_id</code> on the
          payload. Copied to provenance but never used for authorization.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Do not spoof.</strong> Copying another agent's{" "}
          <code>clientInfo</code>, reusing a public-key thumbprint, or inventing{" "}
          <code>agent_sub</code>/<code>agent_iss</code> pairs is a policy breach. Future
          releases will enforce per-tier ACLs.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Inspector contract.</strong> The Inspector
          exposes an Agent column and filter across entities, observations, relationships,
          sources, timeline events, and interpretations; the Settings page summarises
          attribution coverage.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Preflight your session.</strong> Before
          enabling writes from a new client or proxy, call <code>get_session_identity</code>{" "}
          (or <code>GET /session</code>, or <code>neotoma auth session</code>) and verify{" "}
          <code>attribution.tier</code> is <code>software</code>/<code>hardware</code> and{" "}
          <code>eligible_for_trusted_writes</code> is true.
        </li>
      </ul>

      <h2 className={sectionHeading}>Conventions</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Transport precedence.</strong> When both{" "}
          <code>neotoma</code> (prod) and <code>neotoma-dev</code> MCP servers are
          available, default to <code>neotoma</code>; use <code>neotoma-dev</code> only when
          the user requests dev or the task is clearly dev-only.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Avoid get_authenticated_user</strong> unless
          the next action needs it.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Pre-check before storing.</strong> Look for
          existing records by name/type before inserting; reuse the existing{" "}
          <code>entity_id</code> for relationships if found.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Include all fields from source</strong> when
          storing.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">User scope vs CLI.</strong> MCP infers{" "}
          <code>user_id</code> from authentication; omit it on tool calls. Operators using{" "}
          <code>NEOTOMA_API_ONLY</code> can scope reads via <code>--user-id</code> or{" "}
          <code>NEOTOMA_USER_ID</code> in the CLI.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Combined-store remote files.</strong> When
          Neotoma is reachable over HTTP but not on the same host as the attachment, use{" "}
          <code>file_content + mime_type</code> (and <code>original_filename</code> when
          known); <code>file_path</code> only works when the server can read that path.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Store resolution errors.</strong> On{" "}
          <code>ERR_STORE_RESOLUTION_FAILED</code>, inspect <code>issues[].hint</code> for
          payload-shape guidance and surface the error envelope. Do not treat{" "}
          <code>entities_created=0</code> as success when <code>replayed</code> is not true
          and no entities matched.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Structured vs unstructured path.</strong> Use
          the entities array for conversation-sourced data (omit{" "}
          <code>original_filename</code>). For tool- or file-derived data, prefer the
          combined path so the raw source is preserved. Use the unstructured path for raw
          file preservation; pass raw bytes, do not interpret.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">CLI parity.</strong> In CLI backup mode,{" "}
          <code>entities search</code> accepts a positional identifier or{" "}
          <code>--identifier</code>; structured <code>store</code> accepts{" "}
          <code>--entities</code>/<code>--file</code> and the alias{" "}
          <code>--json=&lt;json&gt;</code>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">CLI backup transport.</strong> When MCP is
          available or when reconciling counts with MCP, run CLI reads/writes via API
          transport (<code>--api-only</code> or explicit <code>--base-url</code>); do not
          rely on the offline-default transport unless the user requests local data.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Summarization after MCP actions.</strong>{" "}
          Follow the display rule exactly. Do not dump raw snapshot keys or internal ids
          into prose; do not repeat the same phrase as both thought and section heading.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Update check.</strong> At session start,
          optionally call <code>npm_check_update</code> with{" "}
          <code>packageName: "neotoma"</code> and prompt the user to upgrade if an update is
          available.
        </li>
      </ul>

      <h2 className={sectionHeading}>Feedback reporting</h2>
      <p className={paragraph}>
        When you hit friction using Neotoma, a failing tool call, an opaque error, a
        missing surface, or a doc gap, submit feedback proactively via{" "}
        <code>submit_feedback</code>. This is how fixes get prioritized.
      </p>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Reporting modes.</strong> Default is
          proactive. If the user runs <code>neotoma feedback mode consent</code>, ask once
          per submission; if <code>off</code>, only submit when the user explicitly asks.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">PII redaction.</strong> Redact emails, phone
          numbers, API tokens, UUIDs, and home-directory path fragments with{" "}
          <code>&lt;LABEL:hash&gt;</code> placeholders before submission. The server applies
          a backstop redaction pass and returns <code>redaction_preview</code> for audit.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">metadata.environment.</strong> MUST include at
          minimum <code>neotoma_version</code>, <code>client_name</code>, <code>os</code>;
          add <code>tool_name</code>, <code>invocation_shape</code>,{" "}
          <code>error_message</code>, and best-effort <code>error_class</code>/
          <code>hit_count</code> when applicable.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Persist a product_feedback record.</strong>{" "}
          Immediately after <code>submit_feedback</code> returns, store or update a Neotoma{" "}
          <code>product_feedback</code> entity with <code>feedback_id</code>,{" "}
          <code>access_token</code>, <code>kind</code>, title,{" "}
          <code>submitted_at</code>, <code>next_check_suggested_at</code>, and current
          status. Treat <code>access_token</code> as sensitive, keep it inside Neotoma,
          never in logs or user-visible prose.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Polling.</strong> Poll via{" "}
          <code>get_feedback_status(access_token)</code>; respect{" "}
          <code>next_check_suggested_at</code> and do not poll more frequently. The token is
          single-purpose, do not share or log it beyond your own agent context.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Upgrade and verification.</strong> When{" "}
          <code>upgrade_guidance</code> is present, treat it as actionable: run or propose{" "}
          <code>install_commands</code>, follow <code>verification_steps</code>, then
          re-attempt the original invocation. If <code>verification_request</code> is
          present, submit a <code>kind=fix_verification</code> follow-up with{" "}
          <code>parent_feedback_id</code> and <code>verification_outcome</code> by{" "}
          <code>verify_by</code>; silence is treated as <code>unable_to_verify</code>.
        </li>
      </ul>

      <h2 className={sectionHeading}>Errors and recovery</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Store retry policy.</strong> If{" "}
          <code>store_structured</code> fails, retry once with the same payload. If it
          fails again, surface the error to the user (&quot;Storage failed: [error
          message]&quot;) before responding with any retrieved data. Do not silently skip
          storage and respond as if it succeeded.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">SQLite corruption.</strong> On{" "}
          <code>database disk image is malformed</code>, <code>SQLITE_CORRUPT</code>,{" "}
          <code>btreeInitPage</code>, or failed integrity checks, tell the user the local
          SQLite file is likely corrupted and suggest <code>neotoma storage recover-db</code>{" "}
          first, then <code>neotoma storage recover-db --recover</code> after the user
          stops Neotoma. Do not auto-swap the recovered DB without explicit approval.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">getStats unreachable.</strong> If{" "}
          <code>getStats</code> is unreachable when answering entity-type cardinality
          questions, state that explicitly rather than substituting an expensive per-type
          count or a schema-width value.
        </li>
      </ul>

      <h2 className={sectionHeading}>Onboarding</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <strong className="text-foreground">Discovery flow.</strong> When Neotoma has
          little or no data (first run or empty state), follow the install workflow: (1) ask
          the user which data types matter most (project files, chat transcripts, meeting
          notes, journals, code context, email, financial docs, custom paths) and which
          mode they prefer (quick win, guided, power user); (2) discover high-value local
          files by shallow scan, ranked by entity density, temporal signals, recency, and
          relationship potential; (3) group results into domains and explain why each was
          selected; (4) confirm per-folder or per-file with a reconstruction preview; (5)
          ingest confirmed files and reconstruct the strongest timeline with provenance;
          (6) show the timeline immediately, not a file count; (7) offer one targeted
          follow-up plus 2-4 leveraged next actions; (8) demonstrate correction.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Output rule (Installation Aha).</strong> After
          first-run ingestion, the first visible output MUST be a reconstructed timeline
          with provenance, not a file count. Format:{" "}
          <em>&quot;[Entity name], Timeline reconstructed from [N] sources&quot;</em>{" "}
          followed by dated events each with <em>&quot;Source: [filename], [location]&quot;</em>.
        </li>
        <li className={listItem}>
          <strong className="text-foreground">Chat transcript discovery.</strong> Check for
          chat transcript exports (ChatGPT JSON, Slack exports, Claude history, meeting
          transcripts). They are the highest-signal ingestion source, they encode
          decisions, commitments, and project discussions with timestamps, ideal for
          timeline reconstruction.
        </li>
      </ul>

      <h2 className={sectionHeading}>Related references</h2>
      <ul className={listClass}>
        <li className={listItem}>
          <Link to="/mcp" className={inlineLink}>MCP server</Link>, actions catalog,
          transport modes, client configuration.
        </li>
        <li className={listItem}>
          <Link to="/cli" className={inlineLink}>CLI</Link>, commands, flags, and
          environment selection for the backup transport.
        </li>
        <li className={listItem}>
          <Link to="/api" className={inlineLink}>REST API</Link>, HTTP endpoints, including{" "}
          <code>GET /sources/:id/content</code> and <code>GET /stats</code>.
        </li>
        <li className={listItem}>
          <Link to="/aauth" className={inlineLink}>AAuth</Link>, agent attribution, trust
          tiers, and verification.
        </li>
        <li className={listItem}>
          <Link to="/architecture" className={inlineLink}>Architecture</Link>, state-layer
          boundaries, determinism, and consistency model.
        </li>
        <li className={listItem}>
          <Link to="/schema-management" className={inlineLink}>Schema management</Link>,
          how to evolve types safely.
        </li>
      </ul>
    </DetailPage>
  );
}
