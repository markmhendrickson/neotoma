import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Braces,
  ExternalLink,
  FileCode,
  FileType,
  Image,
  Loader2,
  Volume2,
} from "lucide-react";
import { getSourceContentBlob, getSourceContentText } from "@/api/endpoints/sources";
import { isApiUrlConfigured } from "@/api/client";
import {
  inferSourcePreviewKind,
  sourceContentActionLabel,
  type SourcePreviewKind,
} from "@/lib/source_display";
import { INLINE_SOURCE_PREVIEW_MAX_BYTES, tryParseJsonDocument } from "@/lib/source_content";
import type { Source } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JsonViewer } from "@/components/shared/json_viewer";
import { InlineSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { toast } from "sonner";

type SourceInlinePreviewProps = {
  source: Pick<Source, "id" | "mime_type" | "original_filename" | "file_size">;
};

function previewToggleIcon(kind: SourcePreviewKind) {
  if (kind === "json") return Braces;
  if (kind === "text") return FileCode;
  if (kind === "image") return Image;
  if (kind === "pdf") return FileType;
  if (kind === "audio") return Volume2;
  return ExternalLink;
}

/**
 * Toggle + inline raw panel for entity-detail source cards.
 * Parent should use a `grid grid-cols-[1fr_auto]` wrapper so the panel can span full width.
 */
export function SourceInlinePreview({ source }: SourceInlinePreviewProps) {
  const [open, setOpen] = useState(false);
  const previewKind = inferSourcePreviewKind(source);
  const ToggleIcon = previewToggleIcon(previewKind);
  const isTextPreview = previewKind === "json" || previewKind === "text";
  const isLargeFile = (source.file_size ?? 0) > INLINE_SOURCE_PREVIEW_MAX_BYTES;
  const canInline = isTextPreview && !isLargeFile;
  const actionLabel = sourceContentActionLabel(source);

  const rawText = useQuery({
    queryKey: ["source-inline-text", source.id],
    queryFn: () => getSourceContentText(source.id),
    enabled: isApiUrlConfigured() && open && canInline,
  });

  const parsedJson =
    previewKind === "json" && typeof rawText.data === "string"
      ? tryParseJsonDocument(rawText.data)
      : null;

  async function openInNewTab() {
    if (!isApiUrlConfigured()) {
      toast.error("Configure the Neotoma API URL in Settings before opening source content.");
      return;
    }
    let objectUrl: string | null = null;
    try {
      const blob = await getSourceContentBlob(source.id);
      const mime =
        blob.type ||
        source.mime_type ||
        (previewKind === "json" ? "application/json" : "application/octet-stream");
      const typedBlob = blob.type ? blob : new Blob([blob], { type: mime });
      objectUrl = URL.createObjectURL(typedBlob);
      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        toast.error("Pop-up blocked. Allow pop-ups for this site or use the source detail page.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open source content");
    } finally {
      if (objectUrl) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
      }
    }
  }

  function handleToggle() {
    if (canInline) {
      setOpen((prev) => !prev);
      return;
    }
    void openInNewTab();
  }

  const toggleTitle = canInline
    ? open
      ? `Hide ${actionLabel.replace(/^View /i, "").toLowerCase()}`
      : actionLabel
    : actionLabel;

  return (
    <>
      <div className="col-start-2 row-start-1 self-start">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-expanded={canInline ? open : undefined}
              aria-label={toggleTitle}
              disabled={canInline && open && rawText.isPending}
              onClick={() => handleToggle()}
            >
              {canInline && open && rawText.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ToggleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{toggleTitle}</TooltipContent>
        </Tooltip>
      </div>

      {open && canInline ? (
        <div className="col-span-2 rounded-md border bg-muted/30 p-3">
          {rawText.isPending ? (
            <InlineSkeleton className="h-24 w-full" />
          ) : rawText.error ? (
            <QueryErrorAlert title="Could not load source content">
              {(rawText.error as Error).message}
            </QueryErrorAlert>
          ) : parsedJson != null ? (
            <JsonViewer data={parsedJson} defaultExpanded />
          ) : typeof rawText.data === "string" ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
              {rawText.data}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No content returned.</p>
          )}
        </div>
      ) : null}
    </>
  );
}
