import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import {
  MEMORY_GUARANTEE_ROWS,
  MEMORY_MODEL_VENDORS,
  type GuaranteeLevel,
} from "../site/site_data";
import { useLocale } from "@/i18n/LocaleContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { TableScrollWrapper } from "./ui/table-scroll-wrapper";

const GUARANTEE_LEVEL_META: Record<
  GuaranteeLevel,
  { icon: string; label: string; className: string; cellClassName: string }
> = {
  guaranteed: {
    icon: "\u2713",
    label: "Guaranteed",
    className: "text-emerald-700 dark:text-emerald-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-emerald-500/10 dark:bg-emerald-500/15",
  },
  "not-provided": {
    icon: "\u2717",
    label: "Not provided",
    className: "text-muted-foreground font-semibold text-[20px] leading-none",
    cellClassName: "bg-muted/40 dark:bg-muted/20",
  },
  manual: {
    icon: "\u26A0",
    label: "Possible (manual)",
    className: "text-amber-700 dark:text-amber-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-amber-500/10 dark:bg-amber-500/15",
  },
  partial: {
    icon: "\u26A0",
    label: "Possible (partial)",
    className: "text-amber-700 dark:text-amber-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-amber-500/10 dark:bg-amber-500/15",
  },
  common: {
    icon: "\u26A0",
    label: "Common",
    className: "text-rose-600 dark:text-rose-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-rose-500/10 dark:bg-rose-500/15",
  },
  possible: {
    icon: "\u26A0",
    label: "Possible",
    className: "text-amber-700 dark:text-amber-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-amber-500/10 dark:bg-amber-500/15",
  },
  prevented: {
    icon: "\u2713",
    label: "Prevented",
    className: "text-emerald-700 dark:text-emerald-300 font-semibold text-[20px] leading-none",
    cellClassName: "bg-emerald-500/10 dark:bg-emerald-500/15",
  },
};

export function GuaranteeCell({ level }: { level: GuaranteeLevel }) {
  const { icon, label, className, cellClassName } = GUARANTEE_LEVEL_META[level];

  return (
    <div className={`${cellClassName} w-full px-3 py-2.5 flex items-center justify-center`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`${className} inline-flex`} aria-label={label}>
            {icon}
          </span>
        </TooltipTrigger>
        <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function MemoryGuaranteesTable() {
  const { pack } = useLocale();
  const memory = pack.memory;
  const memoryModelKeys = ["platform", "retrieval", "file", "database", "neotoma"] as const;

  return (
    <TooltipProvider delayDuration={200}>
      <TableScrollWrapper className="w-full max-w-full">
        <table className="min-w-[620px] table-fixed text-[14px] leading-6 border-collapse">
        <colgroup>
          <col style={{ width: "30%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="text-left px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 align-top"
            >
              <span className="block break-words whitespace-normal">Property</span>
            </th>
            <th
              scope="col"
              className="text-center px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.platform}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/platform-memory"
                      className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about Platform memory"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
                    <p>Memory and controls provided directly by the model platform.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
            <th
              scope="col"
              className="text-center px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.retrievalRag}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/retrieval-memory"
                      className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about Retrieval memory"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
                    <p>Memory reconstructed by searching prior context at query time.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
            <th
              scope="col"
              className="text-center px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.files}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/file-based-memory"
                      className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about File-based memory"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
                    <p>Memory stored in files or artifacts outside a structured memory system.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
            <th
              scope="col"
              className="text-center px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.database}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/database-memory"
                      className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about Database memory"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
                    <p>Memory stored in a relational database (SQLite, Postgres) with standard CRUD operations.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
            <th
              scope="col"
              className="text-center px-3 py-2.5 font-medium text-foreground bg-muted/50 min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.deterministic}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/deterministic-memory"
                      className="inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about Deterministic memory"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal">
                    <p>
                      Memory with deterministic state evolution, immutable history, and formal
                      guarantees. Neotoma is the reference implementation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/50">
            <th
              scope="row"
              className="text-left px-3 py-2.5 font-medium text-foreground min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                <span className="truncate">{memory.vendors}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/memory-vendors"
                      className="ml-1 inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label="More info about Vendors"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal"
                  >
                    <p>Representative model providers commonly used for each memory approach.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </th>
            {memoryModelKeys.map((key) => (
              <td
                key={key}
                className="px-3 py-2.5 text-[12px] text-muted-foreground align-middle text-center min-w-0 overflow-hidden"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block truncate cursor-default">{MEMORY_MODEL_VENDORS[key]}</span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="w-max max-w-[min(24rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal"
                  >
                    <p>{MEMORY_MODEL_VENDORS[key]}</p>
                  </TooltipContent>
                </Tooltip>
              </td>
            ))}
          </tr>
          {MEMORY_GUARANTEE_ROWS.map((row) => (
            <tr key={row.property} className="border-b border-border/50">
              <th
                scope="row"
                className="text-left px-3 py-2.5 font-medium text-foreground min-w-0 align-top"
              >
                <span className="break-words whitespace-normal">
                  {row.property}
                  {"\u00A0"}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={`/memory-guarantees#${row.slug}`}
                        className="inline-flex align-middle shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        aria-label={`More info about ${row.property}`}
                      >
                        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="w-max min-w-[18rem] max-w-[min(36rem,calc(100vw-1.5rem))] text-[13px] leading-5 whitespace-normal"
                    >
                      <p>{row.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <td className="px-0 py-0 align-middle text-center min-w-0 overflow-hidden">
                <GuaranteeCell level={row.platform} />
              </td>
              <td className="px-0 py-0 align-middle text-center min-w-0 overflow-hidden">
                <GuaranteeCell level={row.retrieval} />
              </td>
              <td className="px-0 py-0 align-middle text-center min-w-0 overflow-hidden">
                <GuaranteeCell level={row.file} />
              </td>
              <td className="px-0 py-0 align-middle text-center min-w-0 overflow-hidden">
                <GuaranteeCell level={row.database} />
              </td>
              <td className="px-0 py-0 align-middle text-center min-w-0 overflow-hidden">
                <GuaranteeCell level={row.neotoma} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </TableScrollWrapper>
    </TooltipProvider>
  );
}
