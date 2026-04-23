import { Link } from "react-router-dom";
import { MCP_ACTIONS_TABLE } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { DOC_TABLE_SCROLL_OUTER_CLASS, TableScrollWrapper } from "../ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function McpReferencePage() {
  return (
    <DetailPage title="Model Context Protocol (MCP) server">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma exposes {MCP_ACTIONS_TABLE.length} MCP actions covering storage, retrieval, relationships,
        schema management, corrections, and lifecycle. MCP is the primary interface for agent workflows
        because it keeps deterministic state operations explicit: retrieve before reasoning, store with
        provenance, and create typed relationships.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Transport modes</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">stdio</strong> - local process, recommended for Cursor / Claude Code / Codex.
          The MCP client launches the Neotoma process directly.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">HTTP (SSE)</strong> - remote or tunnel access via{" "}
          <code>http://localhost:3080/mcp</code> (dev) or <code>http://localhost:3180/mcp</code> (prod).
          Use with <code>--tunnel</code> for HTTPS via ngrok or Cloudflare.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">WebSocket</strong> - bridge mode for clients that require
          WebSocket transport.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Client configuration</h2>
      <p className="text-[15px] leading-7 mb-3">
        <strong>Cursor</strong> (<code>.cursor/mcp.json</code>):
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}`}</pre>
      <p className="text-[15px] leading-7 mb-3">
        <strong>Claude Code</strong> (<code>claude_desktop_config.json</code>) and{" "}
        <strong>Windsurf</strong> (<code>mcp_config.json</code>) use the same structure.
        Run <code>neotoma mcp check</code> to scan for config files and auto-install missing entries.
        Add <code>--user-level</code> to include user-level paths.
      </p>
      <p className="text-[15px] leading-7 mb-3">
        <strong>HTTP / tunnel</strong> (remote access):
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "mcpServers": {
    "neotoma": {
      "url": "http://localhost:3080/mcp"
    }
  }
}`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Authentication</h2>
      <p className="text-[15px] leading-7 mb-4">
        All MCP actions operate under an authenticated user context. Authentication is handled via
        OAuth (recommended) or Bearer token. The <code>user_id</code> parameter is optional and
        inferred from the auth context. Run <code>neotoma auth login</code> for OAuth setup, or set{" "}
        <code>NEOTOMA_BEARER_TOKEN</code> for token-based auth.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Common action patterns</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# 1) Retrieve target entities before writing
retrieve_entity_by_identifier(identifier="Ana Rivera", entity_type="contact")

# 2) Store conversation + message + extracted entities in one call
store_structured(
  entities=[
    { entity_type: "conversation", title: "Project sync" },
    { entity_type: "conversation_message", role: "user", sender_kind: "user", content: "...", turn_key: "conv:1" }
  ],
  relationships=[{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
  idempotency_key="conversation-conv-1-1711900000000"
)

# 3) Link entities explicitly
create_relationship(
  relationship_type="REFERS_TO",
  source_entity_id="<message_id>",
  target_entity_id="<task_id>"
)

# 4) Store a file with entities in one combined call
store(
  entities=[...],
  file_path="/path/to/invoice.pdf",
  idempotency_key="store-invoice-1711900000000"
)

# 5) Parse a file without storing (agent-side extraction)
parse_file(file_path="/path/to/document.pdf")`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Schema management workflow</h2>
      <p className="text-[15px] leading-7 mb-4">
        Schemas evolve automatically. Fields not in the current schema are stored in{" "}
        <code>raw_fragments</code>. High-confidence fields are auto-promoted. Manual workflow:
      </p>
      <ol className="list-decimal pl-5 space-y-1 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>list_entity_types(keyword="invoice")</code> - discover existing schemas
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>analyze_schema_candidates(entity_type="invoice")</code> - see what fields are candidates
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>update_schema_incremental(entity_type="invoice", new_fields=[...])</code> - promote fields
        </li>
      </ol>

      <TableScrollWrapper className={DOC_TABLE_SCROLL_OUTER_CLASS}>
        <table className={RESPONSIVE_TABLE_CLASS}>
          <thead>
            <tr>
              <th className="min-w-[28ch]">Action</th>
              <th className="min-w-[20ch]">Description</th>
              <th className="min-w-[18ch]">Parameters</th>
            </tr>
          </thead>
          <tbody>
            {MCP_ACTIONS_TABLE.map((row, i) => (
              <tr key={`${row.action}-${i}`}>
                <td data-label="Action" className="align-top">
                  <code className="text-[13px] break-words whitespace-normal">{row.action}</code>
                </td>
                <td data-label="Description" className="align-top">
                  {row.description}
                </td>
                <td data-label="Parameters" className="align-top">
                  <code className="text-[13px] text-muted-foreground">{row.parameters}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollWrapper>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Relationship types</h2>
      <p className="text-[15px] leading-7 mb-4">
        Supported relationship types for <code>create_relationship</code>:{" "}
        <code>PART_OF</code>, <code>CORRECTS</code>, <code>REFERS_TO</code>, <code>SETTLES</code>,{" "}
        <code>DUPLICATE_OF</code>, <code>DEPENDS_ON</code>, <code>SUPERSEDES</code>, <code>EMBEDS</code>.
        Use <code>EMBEDS</code> when a container (blog post, document) embeds an asset (image, attachment):
        source = container, target = asset.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Entity types</h2>
      <p className="text-[15px] leading-7 mb-4">
        Common types agents can set directly: <code>contact</code>, <code>person</code>, <code>company</code>,{" "}
        <code>task</code>, <code>invoice</code>, <code>transaction</code>, <code>receipt</code>,{" "}
        <code>note</code>, <code>contract</code>, <code>event</code>, <code>conversation</code>,{" "}
        <code>agent_message</code>.
        Codebase types: <code>feature_unit</code>, <code>release</code>, <code>agent_decision</code>,{" "}
        <code>agent_session</code>, <code>validation_result</code>, <code>codebase_entity</code>,{" "}
        <code>architectural_decision</code>.
        Use <code>list_entity_types</code> to discover all available types or store with any descriptive
        type and the server infers the schema.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Continue with{" "}
        <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
          REST API reference
        </Link>
        ,{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        ,{" "}
        <Link to="/agent-instructions" className="text-foreground underline underline-offset-2 hover:no-underline">
          agent instructions
        </Link>
        , and{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        .
      </p>
    </DetailPage>
  );
}
