import type { Source } from "@/types/api";
import { humanizeKey, shortId, truncate } from "./humanize";
import { formatDate } from "./utils";

export type SourcePreviewKind =
  | "json"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "none";

const TITLE_KEYS = [
  "title",
  "name",
  "file_name",
  "filename",
  "original_filename",
] as const;

const SUMMARY_KEYS = [
  "summary",
  "description",
  "content",
  "conversation_title",
  "prompt",
] as const;

export function sourceFileSizeLabel(size: number | null | undefined): string {
  if (!size) return "Unknown size";
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

export function inferSourcePreviewKind(source: Pick<Source, "mime_type" | "original_filename">): SourcePreviewKind {
  const mime = (source.mime_type || "").toLowerCase();
  const name = (source.original_filename || "").toLowerCase();

  if (mime === "application/json" || /\.json$/i.test(name)) return "json";
  if (mime.startsWith("text/") || mime === "application/xml" || mime === "image/svg+xml") return "text";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";

  if (/\.(txt|md|xml|csv|tsv|html|js|ts|tsx|jsx|css|log|yaml|yml|svg)$/i.test(name)) return "text";
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name)) return "image";
  if (/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(name)) return "audio";
  if (/\.(mp4|mov|webm|mkv)$/i.test(name)) return "video";
  if (/\.pdf$/i.test(name)) return "pdf";

  return "none";
}

export function sourceKindLabel(source: Source): string {
  const kind = inferSourcePreviewKind(source);
  if (kind === "json") return "JSON source";
  if (kind === "text") return "Text source";
  if (kind === "image") return "Image source";
  if (kind === "audio") return "Audio source";
  if (kind === "video") return "Video source";
  if (kind === "pdf") return "PDF source";
  if (source.source_type) return `${humanizeKey(source.source_type)} source`;
  return "Raw source";
}

export function sourceDisplayTitle(source: Source): string {
  if (source.original_filename?.trim()) return source.original_filename.trim();
  const inferred = firstStringValue(source.provenance, TITLE_KEYS);
  if (inferred) return inferred;
  return `${sourceKindLabel(source)} ${shortId(source.id, 10)}`;
}

export function sourceDisplaySummary(source: Source): string {
  const summary = firstStringValue(source.provenance, SUMMARY_KEYS);
  if (summary) return truncate(summary, 160);

  const pieces = [sourceKindLabel(source)];
  if (source.mime_type) pieces.push(source.mime_type);
  if (source.file_size) pieces.push(sourceFileSizeLabel(source.file_size));
  return pieces.join(" · ");
}

export function sourcePreviewChips(source: Source): string[] {
  const chips = [sourceKindLabel(source)];
  if (source.file_size) chips.push(sourceFileSizeLabel(source.file_size));
  if (source.created_at) chips.push(`Created ${formatDate(source.created_at)}`);
  if (source.mime_type) chips.push(source.mime_type);
  if (source.content_hash) chips.push(`Hash ${shortId(source.content_hash, 12)}`);
  return chips;
}

export function sourceContentActionLabel(source: Source): string {
  const kind = inferSourcePreviewKind(source);
  if (kind === "json") return "View JSON";
  if (kind === "text") return "View text";
  if (kind === "image") return "View image";
  if (kind === "audio") return "Play audio";
  if (kind === "video") return "View video";
  if (kind === "pdf") return "Open PDF";
  return "View raw content";
}

export function sourceMetadataRows(source: Source): { label: string; value: string }[] {
  return [
    { label: "Kind", value: sourceKindLabel(source) },
    { label: "Format", value: source.mime_type || "Unknown format" },
    { label: "Size", value: sourceFileSizeLabel(source.file_size) },
    { label: "Stored", value: formatDate(source.created_at) },
    { label: "Source type", value: source.source_type ? humanizeKey(source.source_type) : "Unspecified" },
    { label: "Source ID", value: source.id },
    { label: "Content hash", value: source.content_hash || "Unknown" },
  ];
}

function firstStringValue(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const compact = value.replace(/\s+/g, " ").trim();
      if (compact) return compact;
    }
  }
  return undefined;
}
