import { Link } from "react-router-dom";
import { CLI_COMMANDS_TABLE } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { DOC_TABLE_SCROLL_OUTER_CLASS, TableScrollWrapper } from "../ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function CliReferencePage() {
  return (
    <DetailPage title="Command-line interface (CLI)">
      <p className="text-[15px] leading-7 mb-4">
        The Neotoma CLI provides full access to every operation available in the MCP and REST API,
        plus administration commands for server lifecycle, storage, backups, and configuration.
        Run <code>neotoma</code> with no arguments for an interactive session (<code>neotoma&gt; </code> prompt),
        or invoke commands directly (e.g. <code>neotoma entities list</code>).
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Installation</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`# Install globally
npm install -g neotoma

# Initialize data directory and database
neotoma init

# Start the API server (development)
neotoma api start --env dev --background`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        From a source checkout: <code>npm run setup:cli</code> builds and links the global <code>neotoma</code> command.
        Use <code>npm run watch:build</code> to keep the global CLI in sync during development.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Environments</h2>
      <p className="text-[15px] leading-7 mb-4">
        Target a specific environment with <code>neotoma dev</code> (port 3080) or{" "}
        <code>neotoma prod</code> (port 3180), or pass <code>--env dev</code> / <code>--env prod</code>.
        Server lifecycle commands (<code>api start</code>, <code>api stop</code>, <code>api logs</code>) always require <code>--env</code>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Typical workflow</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store entities
neotoma store --json='[{"entity_type":"task","title":"Review API rollout","status":"open"}]'

# List entities by type
neotoma entities list --type task --limit 10

# Search by identifier
neotoma entities search "Ana Rivera" --entity-type contact

# Inspect provenance
neotoma observations list --entity-id <entity_id>

# Ingest a file with AI interpretation
neotoma ingest ./invoice.pdf

# Ingest locally (no API server needed)
neotoma ingest --offline ./invoice.pdf

# Stream changes in real time
neotoma watch --tail --human`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Global options</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--offline</code>: force in-process local transport (no API required)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--api-only</code>: fail if API server is unavailable
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--base-url &lt;url&gt;</code>: target a specific API instance
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--env dev|prod</code>: environment selector (required for server commands)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--json</code>: machine-readable JSON output
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--pretty</code>: formatted JSON output
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--tunnel</code>: start HTTPS tunnel (ngrok/cloudflared) with server start
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--debug</code>: emit detailed initialization logs to stderr
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Offline support</h2>
      <p className="text-[15px] leading-7 mb-4">
        Data commands (<code>entities</code>, <code>relationships</code>, <code>sources</code>,{" "}
        <code>observations</code>, <code>timeline</code>, <code>store</code>, <code>schemas</code>,{" "}
        <code>stats</code>, <code>corrections</code>, <code>snapshots</code>) are offline-first and
        use in-process local transport by default - no API server required. Server lifecycle commands
        (<code>api start|stop|status|logs</code>) manage the API process and are unaffected.
      </p>

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
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Authentication</h2>
      <p className="text-[15px] leading-7 mb-4">
        Local CLI commands run without login in development. For production or MCP OAuth:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>neotoma auth login</code> - OAuth PKCE flow for MCP Connect
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>neotoma auth status</code> - show auth mode and user details
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>neotoma auth mcp-token</code> - print key-derived MCP token (when encryption is enabled)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>neotoma auth logout</code> - clear stored OAuth credentials
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        For agent identity (cryptographically verifiable writes), use{" "}
        <code>neotoma auth keygen</code> (software or hardware-backed) and{" "}
        <code>neotoma auth session</code> to inspect the resolved trust tier. See{" "}
        <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">
          AAuth reference
        </Link>{" "}
        for the full agent authentication contract.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Storage and configuration</h2>
      <p className="text-[15px] leading-7 mb-4">
        CLI config is stored at <code>~/.config/neotoma/config.json</code>. Run{" "}
        <code>neotoma storage info</code> to see data directory, database path, sources directory, and log paths.
        Use <code>neotoma storage set-data-dir</code> to relocate the data directory with optional DB migration.
        Use <code>neotoma storage merge-db</code> to merge SQLite databases (safe mode by default).
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Backups</h2>
      <p className="text-[15px] leading-7 mb-4">
        <code>neotoma backup create</code> creates a timestamped backup of the database, sources, and logs
        with a <code>manifest.json</code> containing checksums. <code>neotoma backup restore --from &lt;dir&gt;</code> restores
        a backup into the data directory. Encrypted data stays encrypted; preserve the key file or mnemonic.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for agent-native transport,{" "}
        <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
          REST API reference
        </Link>
        {" "}for HTTP endpoints,{" "}
        <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">
          AAuth reference
        </Link>
        {" "}for agent identity, and{" "}
        <Link to="/troubleshooting" className="text-foreground underline underline-offset-2 hover:no-underline">
          troubleshooting
        </Link>
        {" "}for common failure modes.
      </p>
    </DetailPage>
  );
}
