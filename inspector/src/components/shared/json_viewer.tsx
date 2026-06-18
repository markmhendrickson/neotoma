import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: unknown;
  defaultExpanded?: boolean;
  /** When true, arrays and objects start expanded at every depth (best for small payloads). */
  expandAll?: boolean;
  className?: string;
}

export function JsonViewer({ data, defaultExpanded = false, expandAll = false, className }: JsonViewerProps) {
  return (
    <div className={cn("font-mono text-xs", className)}>
      <JsonNode value={data} defaultExpanded={defaultExpanded} expandAll={expandAll} depth={0} />
    </div>
  );
}

function JsonNode({
  value,
  defaultExpanded,
  expandAll,
  depth,
}: {
  value: unknown;
  defaultExpanded: boolean;
  expandAll: boolean;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(expandAll || defaultExpanded || depth < 1);

  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (value === undefined) return <span className="text-muted-foreground">undefined</span>;
  if (typeof value === "boolean")
    return <span className="text-[hsl(var(--syntax-boolean))]">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-[hsl(var(--syntax-number))]">{value}</span>;
  if (typeof value === "string") {
    if (value.length > 200) {
      return (
        <span className="text-[hsl(var(--syntax-string))]">"{value.slice(0, 200)}…"</span>
      );
    }
    return <span className="text-[hsl(var(--syntax-string))]">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[]"}</span>;
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse array" : "Expand array"}
          className="-mx-2 -my-1 inline-flex min-h-[36px] items-center gap-0.5 px-2 py-1 hover:text-primary sm:mx-0 sm:my-0 sm:min-h-0 sm:px-0 sm:py-0"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-muted-foreground">Array({value.length})</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l pl-2">
            {value.map((item, i) => (
              <div key={i} className="py-0.5">
                <span className="text-muted-foreground mr-1">{i}:</span>
                <JsonNode value={item} defaultExpanded={false} expandAll={expandAll} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse object" : "Expand object"}
          className="-mx-2 -my-1 inline-flex min-h-[36px] items-center gap-0.5 px-2 py-1 hover:text-primary sm:mx-0 sm:my-0 sm:min-h-0 sm:px-0 sm:py-0"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-muted-foreground">{`{${entries.length}}`}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l pl-2">
            {entries.map(([key, val]) => (
              <div key={key} className="py-0.5">
                <span className="text-[hsl(var(--syntax-key))] mr-1">{key}:</span>
                <JsonNode value={val} defaultExpanded={false} expandAll={expandAll} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}
