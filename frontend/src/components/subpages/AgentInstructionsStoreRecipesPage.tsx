import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const sectionHeading = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
const subHeading = "text-[15px] font-medium tracking-[-0.01em] mt-5 mb-2";
const paragraph = "text-[15px] leading-7 mb-4";
const listClass = "list-none pl-0 space-y-2 mb-6";
const listItem = "text-[15px] leading-7 text-muted-foreground";
const inlineLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function AgentInstructionsStoreRecipesPage() {
  return (
    <DetailPage title="Agent instructions: Store recipes and entity types">
      <p className={paragraph}>
        <Link to="/agent-instructions" className={inlineLink}>← Agent instructions</Link>
      </p>

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
    </DetailPage>
  );
}
