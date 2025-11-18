import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
}

interface JsonBranchProps {
  label: string;
  value: unknown;
  path: string;
  depth: number;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function getSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `Array (${value.length})`;
  }
  if (isPlainObject(value)) {
    return `Object (${Object.keys(value).length})`;
  }
  if (value === null) return 'null';
  return String(value);
}

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value);
}

function JsonBranch({ label, value, path, depth }: JsonBranchProps) {
  const isComposite = isPlainObject(value) || Array.isArray(value);
  const [expanded, setExpanded] = useState(depth < 1);

  if (!isComposite) {
    return (
      <div className="border-l border-border/40 pl-2">
        <div className="flex flex-wrap gap-1 text-xs font-mono">
          <span className="font-semibold text-foreground">{label}:</span>
          <span className="text-primary">{formatPrimitive(value)}</span>
        </div>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : Object.entries(value);

  return (
    <div className="border-l border-border/40 pl-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={`json-node-${path}`}
        aria-label={`Toggle ${label}`}
        className={cn(
          'flex w-full items-center gap-1 text-left text-xs font-semibold transition-colors',
          'text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{label}</span>
        <span className="text-muted-foreground">({getSummary(value)})</span>
      </button>
      {expanded && (
        <div id={`json-node-${path}`} className="mt-1 space-y-1">
          {entries.map(([childKey, childValue]) => (
            <JsonBranch
              key={`${path}.${childKey}`}
              label={childKey}
              value={childValue}
              path={`${path}.${childKey}`}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonViewer({ data }: JsonViewerProps) {
  if (data === null || data === undefined) {
    return (
      <div className="rounded border border-border/60 bg-muted/30 p-3 text-xs font-mono text-muted-foreground">
        null
      </div>
    );
  }

  if (!isPlainObject(data) && !Array.isArray(data)) {
    return (
      <div className="rounded border border-border/60 bg-muted/30 p-3 text-xs font-mono">
        {formatPrimitive(data)}
      </div>
    );
  }

  return (
    <div className="rounded border border-border/60 bg-muted/30 p-3 text-xs font-mono">
      <div className="space-y-1">
        {Array.isArray(data)
          ? data.map((item, index) => (
              <JsonBranch key={`root.${index}`} label={String(index)} value={item} path={`root.${index}`} depth={0} />
            ))
          : Object.entries(data).map(([key, value]) => (
              <JsonBranch key={`root.${key}`} label={key} value={value} path={`root.${key}`} depth={0} />
            ))}
      </div>
    </div>
  );
}


