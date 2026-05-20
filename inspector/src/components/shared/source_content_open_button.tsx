import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { getSourceContentBlob } from "@/api/endpoints/sources";
import { isApiUrlConfigured } from "@/api/client";
import { inferSourcePreviewKind, sourceContentActionLabel } from "@/lib/source_display";
import type { Source } from "@/types/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SourceContentRef = Pick<Source, "id" | "mime_type" | "original_filename">;

type SourceContentOpenButtonProps = {
  source: SourceContentRef;
  variant?: "outline" | "ghost" | "default" | "secondary" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
};

/** Opens raw source bytes in a new tab (authenticated fetch). */
export async function openSourceContentInNewTab(source: SourceContentRef): Promise<void> {
  if (!isApiUrlConfigured()) {
    toast.error("Configure the Neotoma API URL in Settings before opening source content.");
    return;
  }
  let objectUrl: string | null = null;
  try {
    const blob = await getSourceContentBlob(source.id);
    const previewKind = inferSourcePreviewKind(source);
    const mime =
      blob.type ||
      source.mime_type ||
      (previewKind === "json" ? "application/json" : "application/octet-stream");
    const typedBlob = blob.type ? blob : new Blob([blob], { type: mime });
    objectUrl = URL.createObjectURL(typedBlob);
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("Pop-up blocked. Allow pop-ups for this site or use Download on the source page.");
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not open source content");
  } finally {
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
    }
  }
}

/**
 * Opens raw source bytes in a new tab using an authenticated fetch (Bearer token
 * from Settings). Plain navigation to GET /sources/:id/content cannot attach that
 * header and is blocked from the SPA shell on same-origin mounts.
 */
export function SourceContentOpenButton({
  source,
  variant = "outline",
  size = "sm",
  className,
}: SourceContentOpenButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setLoading(true);
    try {
      await openSourceContentInNewTab(source);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={() => void handleOpen()}
    >
      {loading ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : (
        <ExternalLink className="mr-1 h-3 w-3" />
      )}
      {sourceContentActionLabel(source)}
    </Button>
  );
}
