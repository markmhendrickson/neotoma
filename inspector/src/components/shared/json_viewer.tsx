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
  if (typeof value === "boolean") return <span className="text-blue-600">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-green-600">{value}</span>;
  if (typeof value === "string") {
    if (value.length > 200) {
      return <span className="text-amber-700">"{value.slice(0, 200)}…"</span>;
    }
    return <span className="text-amber-700">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[]"}</span>;
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-0.5 hover:text-primary">
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
        <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-0.5 hover:text-primary">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-muted-foreground">{`{${entries.length}}`}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l pl-2">
            {entries.map(([key, val]) => (
              <div key={key} className="py-0.5">
                <span className="text-purple-600 mr-1">{key}:</span>
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
