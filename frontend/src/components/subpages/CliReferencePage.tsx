import { Link } from "react-router-dom";
import { CLI_COMMANDS_TABLE } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function CliReferencePage() {
  return (
    <DetailPage title="Command-line interface (CLI)">
      <p className="text-[15px] leading-7 mb-4">
        Use the CLI when MCP is not available. Run <code>neotoma</code> with no arguments
        for an interactive REPL (<code>neotoma&gt; </code> prompt).
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Data commands (store, entities, relationships, etc.) are offline-first and run via
        in-process local transport by default. Use <code>--api-only</code> to require the
        API, or <code>--offline</code> to force local explicitly.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Typical deterministic workflow</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Initialize
neotoma init

# Store one task
neotoma store --json='[{"entity_type":"task","title":"Review API rollout","status":"open"}]'

# Retrieve tasks
neotoma entities list --type task --limit 10

# Inspect provenance for one entity
neotoma observations list --entity-id <entity_id>`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Transport flags</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--offline</code>: force in-process local transport
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--api-only</code>: fail if API server is unavailable
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--base-url</code>: target a specific API instance
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--env dev|prod</code>: required for server lifecycle commands
        </li>
      </ul>

      <TableScrollWrapper className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent">
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
      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for agent-native transport and{" "}
        <Link to="/troubleshooting" className="text-foreground underline underline-offset-2 hover:no-underline">
          troubleshooting
        </Link>
        {" "}for common failure modes.
      </p>
    </DetailPage>
  );
}
