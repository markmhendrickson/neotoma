import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const sectionHeading = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
const paragraph = "text-[15px] leading-7 mb-4";
const listClass = "list-none pl-0 space-y-2 mb-6";
const listItem = "text-[15px] leading-7 text-muted-foreground";
const inlineLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function AgentInstructionsDisplayPage() {
  return (
    <DetailPage title="Agent instructions: Display, attribution, and conventions">
      <p className={paragraph}>
        <Link to="/agent-instructions" className={inlineLink}>← Agent instructions</Link>
      </p>

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
          <code>store</code> fails, retry once with the same payload. If it
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
    </DetailPage>
  );
}
