import { Link } from "react-router-dom";
import { GLOSSARY_ROWS } from "../../site/site_data";
import { DetailPage } from "../DetailPage";

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_th]:align-top [&_td]:align-top [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tbody_tr:first-child]:border-t [&_tbody_tr:first-child]:border-border md:[&_tbody_tr:first-child]:border-t-0 [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";

export function TerminologyPage() {
  return (
    <DetailPage title="Core terminology">
      <p className="text-[15px] leading-7 mb-6">
        The following terms describe how Neotoma structures, stores, and evolves
        memory state. Each maps to a concrete layer of the deterministic state
        pipeline.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        If you are new to Neotoma, read the terms in this order: Source {"->"} Observation {"->"} Entity snapshot {"->"}
        Relationship {"->"} Memory graph. Then review the{" "}
        <Link to="/data-model" className="text-foreground underline underline-offset-2 hover:no-underline">
          data model walkthrough
        </Link>
        {" "}for end-to-end examples.
      </p>
      <table className={RESPONSIVE_TABLE_CLASS}>
        <thead>
          <tr>
            <th className="min-w-[14ch] md:min-w-[14ch]">Term</th>
            <th className="min-w-[36ch] md:min-w-[36ch]">Definition</th>
          </tr>
        </thead>
        <tbody>
          {GLOSSARY_ROWS.map((row) => (
            <tr key={row.term}>
              <td data-label="Term" className="font-medium">
                {row.term}
              </td>
              <td data-label={row.term} className="align-top">
                {row.definition}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Where these terms appear</h2>
      <ul className="list-none pl-0 space-y-2">
        <li className="text-[15px] leading-7">
          <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
            Architecture
          </Link>{" "}
          — deterministic state pipeline and guarantees
        </li>
        <li className="text-[15px] leading-7">
          <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
            MCP reference
          </Link>{" "}
          — actions that operate on entities, observations, and relationships
        </li>
        <li className="text-[15px] leading-7">
          <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
            CLI reference
          </Link>{" "}
          — command-level access to snapshots, observations, and graph operations
        </li>
      </ul>
    </DetailPage>
  );
}
