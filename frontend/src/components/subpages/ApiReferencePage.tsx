import { Link } from "react-router-dom";
import { FUNCTIONALITY_MATRIX } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { DOC_TABLE_SCROLL_OUTER_CLASS, TableScrollWrapper } from "../ui/table-scroll-wrapper";
import { useLocale } from "@/i18n/LocaleContext";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function ApiReferencePage() {
  const { subpage } = useLocale();
  const rows = FUNCTIONALITY_MATRIX.flatMap((row) =>
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

  return (
    <DetailPage title={subpage.apiReference.title}>
      <p className="text-[15px] leading-7 mb-4">
        The Neotoma REST API is defined in the{" "}
        <a href="https://github.com/markmhendrickson/neotoma/blob/main/openapi.yaml">
          OpenAPI spec
        </a>
        . The table below lists each endpoint and the capability it provides.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        The API is designed around deterministic state operations: store structured observations, retrieve
        snapshots with provenance, and manage typed relationships explicitly.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Getting started</h2>
      <p className="text-[15px] leading-7 mb-4">
        The API server is managed through the{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          Neotoma CLI
        </Link>
        . After{" "}
        <Link to="/install" className="text-foreground underline underline-offset-2 hover:no-underline">
          installing Neotoma
        </Link>
        , start the API server:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`# Start the development API server (port 3080)
neotoma api start --env dev

# Start the production API server (port 3180)
neotoma api start --env prod

# Check server status
neotoma api status

# View server logs
neotoma api logs --env dev`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Once the server is running, you can reach it at the base URLs below.
        The CLI also exposes every API operation directly. Run{" "}
        <code>neotoma --help</code> to see available commands, or see the{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>{" "}
        for the full command list.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Base URL</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Development:</strong>{" "}
          <code>http://localhost:3080</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Production:</strong>{" "}
          <code>http://localhost:3180</code> (local) or your deployed host
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Authentication</h2>
      <p className="text-[15px] leading-7 mb-4">
        Most write endpoints require authentication. Discovery routes like <code>/health</code>, <code>/server-info</code>, and <code>/.well-known/*</code> are unauthenticated. When authentication is enabled, include a Bearer token:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`Authorization: Bearer <NEOTOMA_BEARER_TOKEN>`}</pre>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Set via <code>NEOTOMA_BEARER_TOKEN</code> environment variable
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          When encryption is enabled, use the key-derived MCP token instead: <code>neotoma auth mcp-token</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          MCP OAuth endpoints (<code>/mcp/oauth/*</code>) have their own auth flow - see the{" "}
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP reference
          </Link>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          For agent identity (cryptographically verifiable writes via RFC 9421 signatures and the{" "}
          <code>aa-agent+jwt</code> token), see the{" "}
          <Link to="/aauth" className="text-foreground underline underline-offset-2 hover:no-underline">
            AAuth reference
          </Link>
          . Bearer auth and AAuth are independent and stack: Bearer authorizes the connection,
          AAuth attributes individual writes.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Request examples</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store structured entities
curl -X POST http://localhost:3080/store \\
  -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"entities":[{"entity_type":"task","title":"Review schema changes","status":"open"}]}'

# Query entities
curl -X POST http://localhost:3080/entities/query \\
  -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"filters":{"entity_type":"task"},"limit":10}'

# Retrieve snapshot with provenance
curl -X POST http://localhost:3080/get_entity_snapshot \\
  -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"entity_id":"<entity_id>"}'

# Store a file with entities (unified store)
curl -X POST http://localhost:3080/store \\
  -H "Authorization: Bearer $NEOTOMA_BEARER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"entities":[{"entity_type":"note","title":"Meeting notes"}],"file_path":"/path/to/document.pdf"}'

# Health check (no auth required)
curl http://localhost:3080/health`}</pre>
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
            {rows.map((row) => (
              <tr key={row.key}>
                <td data-label="Method" className="align-top">
                  <code className="text-[13px]">{row.method}</code>
                </td>
                <td data-label="Endpoint" className="align-top">
                  <code className="text-[13px] break-words whitespace-normal">{row.path}</code>
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
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Error responses</h2>
      <p className="text-[15px] leading-7 mb-4">
        All errors use a structured envelope:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`{
  "error_code": "INGESTION_FILE_TOO_LARGE",
  "message": "File exceeds maximum size of 50MB",
  "details": { "file_size": 52428800, "max_size": 52428800 },
  "trace_id": "trace-uuid",
  "timestamp": "2024-01-01T12:00:00Z"
}`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Standard HTTP status codes: <code>200</code> OK, <code>201</code> Created, <code>400</code> Bad Request,{" "}
        <code>401</code> Unauthorized, <code>403</code> Forbidden, <code>404</code> Not Found,{" "}
        <code>409</code> Conflict, <code>413</code> Payload Too Large, <code>429</code> Rate Limited,{" "}
        <code>500</code> Internal Server Error, <code>503</code> Service Unavailable.
        Check <code>error_code</code> for programmatic handling, not just the HTTP status.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Pagination</h2>
      <p className="text-[15px] leading-7 mb-4">
        List endpoints accept <code>limit</code> and <code>offset</code> parameters.
        Use <code>include_total_count: true</code> when building pagination UI.
        Recommended: keep <code>limit</code> at 100 or below for performance.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "filters": { "entity_type": "task" },
  "limit": 20,
  "offset": 0,
  "include_total_count": true
}`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">File operations</h2>
      <p className="text-[15px] leading-7 mb-4">
        Upload files via the unified <code>POST /store</code> (with <code>file_path</code> or <code>file_content</code> + <code>mime_type</code>)
        or <code>POST /store/unstructured</code> for raw file ingestion. File size limit: 50 MB.
        Retrieve signed URLs via <code>GET /get_file_url?file_path=...</code> (default expiry: 1 hour).
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Continue with{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        ,{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        ,{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        ,{" "}
        <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
          architecture
        </Link>
        , and{" "}
        <Link to="/tunnel" className="text-foreground underline underline-offset-2 hover:no-underline">
          expose tunnel
        </Link>
        .
      </p>
    </DetailPage>
  );
}
