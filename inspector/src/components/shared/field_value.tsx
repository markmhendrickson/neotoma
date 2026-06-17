import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { JsonViewer } from "@/components/shared/json_viewer";
import { formatDate } from "@/lib/utils";
import {
  absoluteDateTime,
  compactFieldPreview,
  humanizeKey,
  inferValueKind,
  isFieldPreviewTruncated,
  truncate,
  type ValueKind,
} from "@/lib/humanize";

/** Max visual lines in compact snapshot field values (CSS line-clamp + explicit newlines). */
const PREVIEW_MAX_LINES = 6;
/** Character cap after line cap (whichever bites first). */
const PREVIEW_MAX_CHARS = 400;
/** Long single-line strings use show more/less below this length. */
const PREVIEW_TOGGLE_MIN_CHARS = 200;

interface FieldValueProps {
  value: unknown;
  /** Optional type hint from the schema's `field_summary[key].type`. */
  typeHint?: string | null;
  className?: string;
  /**
   * When true, long text values are rendered with line breaks preserved
   * and no truncation. Default keeps single-line strings compact.
   */
  expanded?: boolean;
}

export function FieldValue({ value, typeHint, className, expanded }: FieldValueProps) {
  const kind = inferValueKind(value, typeHint);
  return (
    <div className={cn("text-sm leading-snug", className)}>
      {renderKind(kind, value, expanded)}
    </div>
  );
}

function renderKind(kind: ValueKind, value: unknown, expanded?: boolean) {
  switch (kind) {
    case "null":
      return <span className="text-muted-foreground italic">not set</span>;
    case "empty":
      return <span className="text-muted-foreground italic">empty</span>;
    case "boolean":
      return (
        <span className={cn("font-medium", (value as boolean) ? "text-success" : "text-muted-foreground")}>
          {(value as boolean) ? "Yes" : "No"}
        </span>
      );
    case "number":
      return <span className="tabular-nums">{(value as number).toLocaleString()}</span>;
    case "date": {
      const iso = value as string;
      const ymd = formatDate(iso);
      return <span title={absoluteDateTime(iso) || undefined}>{ymd}</span>;
    }
    case "url": {
      const s = String(value);
      const href = s.startsWith("//") ? "https:" + s : s;
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline break-all">
          {truncate(s, 140)}
        </a>
      );
    }
    case "email": {
      const s = String(value);
      return (
        <a href={`mailto:${s}`} className="text-primary hover:underline break-all">
          {s}
        </a>
      );
    }
    case "phone": {
      const s = String(value);
      const tel = s.replace(/[^\d+]/g, "");
      return (
        <a href={`tel:${tel}`} className="text-primary hover:underline">
          {s}
        </a>
      );
    }
    case "text": {
      const s = String(value);
      if (expanded) {
        return <span className="break-words whitespace-pre-wrap">{s}</span>;
      }
      return <CompactTextPreview text={s} />;
    }
    case "multiline": {
      const s = String(value);
      if (expanded) {
        return <span className="break-words whitespace-pre-wrap">{s}</span>;
      }
      return <CompactTextPreview text={s} />;
    }
    case "array":
      return <ArrayValue items={value as unknown[]} />;
    case "object":
      return <ObjectValue data={value as Record<string, unknown>} />;
    default:
      return <span>{String(value)}</span>;
  }
}

function CompactTextPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const needsToggle =
    text.length > PREVIEW_TOGGLE_MIN_CHARS ||
    isFieldPreviewTruncated(text, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS);
  const showFull = open;
  const display = showFull
    ? text
    : compactFieldPreview(text, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS);

  return (
    <span className="inline">
      <span
        className={cn(
          "break-words whitespace-pre-wrap",
          !showFull && needsToggle && "line-clamp-6",
        )}
      >
        {display}
      </span>
      {needsToggle ? (
        <>
          {" "}
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-primary hover:underline"
            type="button"
          >
            {showFull ? "Show less" : "Show more"}
          </button>
        </>
      ) : null}
    </span>
  );
}

function ArrayValue({ items }: { items: unknown[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground italic">empty list</span>;
  }
  const allScalar = items.every(
    (v) => v === null || ["string", "number", "boolean"].includes(typeof v)
  );
  if (allScalar && items.length <= 8) {
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((it, idx) => (
          <span
            key={idx}
            className="rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {it === null ? "null" : String(it)}
          </span>
        ))}
      </div>
    );
  }
  return <ExpandableObject label={`${items.length} item${items.length === 1 ? "" : "s"}`} data={items} />;
}

function ObjectValue({ data }: { data: Record<string, unknown> }) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return <span className="text-muted-foreground italic">empty object</span>;
  }
  if (keys.length <= 3) {
    return (
      <div className="flex flex-col gap-0.5">
        {keys.map((k) => {
          const v = data[k];
          const kind = inferValueKind(v);
          const preview =
            kind === "object" || kind === "array"
              ? kind === "array"
                ? `${(v as unknown[]).length} items`
                : `${Object.keys(v as Record<string, unknown>).length} keys`
              : String(v);
          return (
            <div key={k} className="text-xs">
              <span className="text-muted-foreground">{humanizeKey(k)}:</span>{" "}
              <span className="break-words">{truncate(preview, 120)}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return <ExpandableObject label={`${keys.length} field${keys.length === 1 ? "" : "s"}`} data={data} />;
}

function ExpandableObject({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open ? (
        <div className="mt-1 rounded border border-dashed bg-muted/30 p-2">
          <JsonViewer data={data} defaultExpanded />
        </div>
      ) : null}
    </div>
  );
}
