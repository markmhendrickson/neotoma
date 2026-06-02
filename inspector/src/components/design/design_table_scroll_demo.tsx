import { ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Static wide table inside table-scroll-outer markup for the /design catalog. */
export function DesignTableScrollDemo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "table-scroll-outer table-scrollable relative my-2 w-full max-w-full overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="table-scroll-viewport min-w-0 max-w-full overflow-x-auto rounded-lg">
        <div className="table-scroll-inner flex min-w-full flex-row">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Parameters</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-mono text-ui">store</td>
                <td className="px-4 py-3">Persist entities and optional file bytes</td>
                <td className="px-4 py-3 text-muted-foreground">entities, idempotency_key</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-mono text-ui">retrieve_entities</td>
                <td className="px-4 py-3">List entities by type with filters</td>
                <td className="px-4 py-3 text-muted-foreground">entity_type, limit</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="table-scroll-edge pointer-events-none absolute bottom-0 right-0 top-0 w-10" aria-hidden>
        <span className="table-scroll-hint absolute bottom-2 right-2 flex items-center gap-1">
          Scroll right
          <ChevronsRight className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
