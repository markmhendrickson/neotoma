import { Link } from "react-router-dom";
import { FUNCTIONALITY_MATRIX } from "../../site/site_data";
import { DetailPage } from "../DetailPage";
import { TableScrollWrapper } from "../ui/table-scroll-wrapper";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function ApiReferencePage() {
  const rows = FUNCTIONALITY_MATRIX.flatMap((row) =>
    row.openapi
      .split(",")
      .map((endpoint) => endpoint.trim())
      .filter(Boolean)
      .map((endpoint, i) => {
        const spaceIdx = endpoint.indexOf(" ");
        const method = spaceIdx >= 0 ? endpoint.slice(0, spaceIdx) : "";
        const path = spaceIdx >= 0 ? endpoint.slice(spaceIdx + 1) : endpoint;
        return {
          key: `${row.functionality}-${i}-${endpoint}`,
          method,
          path,
          description: row.endpointDescriptions?.[i] ?? row.functionality,
          parameters: row.endpointParameters?.[i] ?? "—",
        };
      }),
  );

  return (
    <DetailPage title="API and OpenAPI specification">
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

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Minimal request examples</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store structured entities
curl -X POST http://localhost:3080/store \\
  -H "Content-Type: application/json" \\
  -d '{"entities":[{"entity_type":"task","title":"Review schema changes","status":"open"}]}'

# Query entities
curl -X POST http://localhost:3080/entities/query \\
  -H "Content-Type: application/json" \\
  -d '{"filters":{"entity_type":"task"},"limit":10}'

# Retrieve snapshot with provenance
curl -X POST http://localhost:3080/get_entity_snapshot \\
  -H "Content-Type: application/json" \\
  -d '{"entity_id":"<entity_id>"}'`}</pre>

      <p className="text-[15px] leading-7 mb-4">
        Authentication requirements differ by endpoint and deployment mode. Local development workflows often
        run without OAuth while hosted or shared environments should enforce authenticated access.
      </p>
      <TableScrollWrapper className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent">
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
      <p className="text-[14px] leading-6 text-muted-foreground">
        Continue with{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        ,{" "}
        <Link to="/data-model" className="text-foreground underline underline-offset-2 hover:no-underline">
          data model walkthrough
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
