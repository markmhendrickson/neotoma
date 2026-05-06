import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const sectionHeading = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
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
        This page summarizes the canonical instruction block shipped to MCP clients at runtime.
        For the verbatim source see{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp/instructions.md"
          className={inlineLink}
        >
          docs/developer/mcp/instructions.md
        </a>
        . The harness file applied by{" "}
        <code>neotoma cli config --yes</code> is{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/cli_agent_instructions.md"
          className={inlineLink}
        >
          docs/developer/cli_agent_instructions.md
        </a>{" "}
        (transport + CLI cheat sheet only). See{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/agent_instructions.md"
          className={inlineLink}
        >
          docs/developer/agent_instructions.md
        </a>{" "}
        for the map and{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/agent_instructions_sync_rules.mdc"
          className={inlineLink}
        >
          docs/developer/agent_instructions_sync_rules.mdc
        </a>{" "}
        for the maintainer contract.
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
          one <code>store</code> call. If the user attached a file, include it in
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
          user-visible reply is finalized, call <code>store</code> with a single
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

      <h2 className={sectionHeading}>Detailed instruction sections</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link
          to="/agent-instructions/store-recipes"
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Store recipes and entity types
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            User-phase store, attachments, screenshots, chat fallbacks, schema-agnostic storage, type reuse, and schema evolution.
          </p>
        </Link>
        <Link
          to="/agent-instructions/retrieval-provenance"
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Retrieval, provenance, and tasks
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Bounded retrieval, source provenance, three-layer analysis, session-derived artifacts, and task/commitment creation.
          </p>
        </Link>
        <Link
          to="/agent-instructions/display-conventions"
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            Display, attribution, and conventions
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Display rules, agent attribution, transport conventions, feedback reporting, error recovery, and onboarding.
          </p>
        </Link>
      </div>

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
