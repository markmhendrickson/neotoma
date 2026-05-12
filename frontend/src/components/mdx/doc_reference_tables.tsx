import { MCP_ACTIONS_TABLE, CLI_COMMANDS_TABLE, FUNCTIONALITY_MATRIX, SITE_CODE_SNIPPETS } from "@/site/site_data";
import { DOC_TABLE_SCROLL_OUTER_CLASS, TableScrollWrapper } from "@/components/ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

const PRE =
  "rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words";

export function McpReferenceIntro() {
  return (
    <p className="text-[15px] leading-7 mb-4">
      Neotoma exposes {MCP_ACTIONS_TABLE.length} MCP actions covering storage, retrieval, relationships, schema
      management, corrections, and lifecycle. MCP is the primary interface for agent workflows because it keeps
      deterministic state operations explicit: retrieve before reasoning, store with provenance, and create typed
      relationships.
    </p>
  );
}

export function McpStdioConfigSnippet() {
  return <pre className={`${PRE} mb-4`}>{SITE_CODE_SNIPPETS.stdioConfigJson}</pre>;
}

export function McpHttpConfigSnippet() {
  return (
    <pre className={`${PRE} mb-6`}>{`{
  "mcpServers": {
    "neotoma": {
      "url": "http://localhost:3080/mcp"
    }
  }
}`}</pre>
  );
}

export function McpCommonActionPatternsSnippet() {
  return (
    <pre className={`${PRE} mb-6`}>{`# 1) Retrieve target entities before writing
retrieve_entity_by_identifier(identifier="Ana Rivera", entity_type="contact")

# 2) Store conversation + message + extracted entities in one call
store(
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
  );
}

export function McpReferenceActionsTable() {
  return (
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
  );
}

export function CliReferenceCommandsTable() {
  return (
    <TableScrollWrapper className={DOC_TABLE_SCROLL_OUTER_CLASS}>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[28ch]">Command</th>
            <th className="min-w-[20ch]">Description</th>
            <th className="min-w-[18ch]">Flags</th>
          </tr>
        </thead>
        <tbody>
          {CLI_COMMANDS_TABLE.map((row, i) => (
            <tr key={`${row.command}-${i}`}>
              <td data-label="Command" className="align-top">
                <code className="text-[13px] break-words whitespace-normal">{row.command}</code>
              </td>
              <td data-label="Description" className="align-top">
                {row.description}
              </td>
              <td data-label="Flags" className="align-top">
                <code className="text-[13px] text-muted-foreground">{row.parameters}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScrollWrapper>
  );
}

function buildApiMatrixRows() {
  return FUNCTIONALITY_MATRIX.flatMap((row) =>
    row.openapi
      .split(",")
      .map((endpoint) => endpoint.trim())
      .filter((e) => e && e !== "-")
      .map((endpoint, i) => {
        const spaceIdx = endpoint.indexOf(" ");
        const method = spaceIdx >= 0 ? endpoint.slice(0, spaceIdx) : "";
        const path = spaceIdx >= 0 ? endpoint.slice(spaceIdx + 1) : endpoint;
        return {
          key: `${row.functionality}-${i}-${endpoint}`,
          method,
          path,
          description: row.endpointDescriptions?.[i] ?? row.functionality,
          parameters: row.endpointParameters?.[i] ?? "-",
        };
      }),
  );
}

export function ApiReferenceEndpointsTable() {
  const rows = buildApiMatrixRows();
  return (
    <TableScrollWrapper className={DOC_TABLE_SCROLL_OUTER_CLASS}>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[8ch]">Method</th>
            <th className="min-w-[28ch]">Endpoint</th>
            <th className="min-w-[20ch]">Description</th>
            <th className="min-w-[18ch]">Parameters</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td data-label="Method" className="align-top">
                <code className="text-[13px]">{r.method}</code>
              </td>
              <td data-label="Endpoint" className="align-top">
                <code className="text-[13px] break-words whitespace-normal">{r.path}</code>
              </td>
              <td data-label="Description" className="align-top">
                {r.description}
              </td>
              <td data-label="Parameters" className="align-top">
                <code className="text-[13px] text-muted-foreground">{r.parameters}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScrollWrapper>
  );
}
