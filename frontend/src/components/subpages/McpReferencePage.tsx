import { Link } from "react-router-dom";
import { MCP_ACTIONS_TABLE } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function McpReferencePage() {
  return (
    <DetailPage title="Model Context Protocol (MCP) server">
      <p className="text-[15px] leading-7 mb-4">
        MCP actions are available once the server is running and the client is configured:
        Cursor (<code>.cursor/mcp.json</code>), Claude (<code>.mcp.json</code>), or Codex (
        <code>.codex/config.toml</code>). Use stdio for local usage, HTTP for remote or
        tunnel access.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        MCP is the primary interface for agent workflows because it keeps deterministic state operations
        explicit: retrieve before reasoning, store with provenance, and create typed relationships.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Common action patterns</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# 1) Retrieve target entities before writing
retrieve_entity_by_identifier(identifier="Ana Rivera", entity_type="contact")

# 2) Store conversation + message + extracted entities
store_structured(
  entities=[...],
  relationships=[{"relationship_type":"PART_OF","source_index":1,"target_index":0}]
)

# 3) Link entities explicitly
create_relationship(
  relationship_type="REFERS_TO",
  source_entity_id="<message_id>",
  target_entity_id="<task_id>"
)`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Configuration example</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "mcpServers": {
    "neotoma": {
      "command": "neotoma",
      "args": ["mcp", "stdio"]
    }
  }
}`}</pre>

      <TableScrollWrapper className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent">
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
      <p className="text-[14px] leading-6 text-muted-foreground">
        Continue with{" "}
        <Link to="/agent-instructions" className="text-foreground underline underline-offset-2 hover:no-underline">
          agent instructions
        </Link>
        ,{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        , and{" "}
        <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
          architecture
        </Link>
        .
      </p>
    </DetailPage>
  );
}
