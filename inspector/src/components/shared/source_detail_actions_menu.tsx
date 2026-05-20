import { useState } from "react";
import { Download, ExternalLink, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { openSourceContentInNewTab } from "@/components/shared/source_content_open_button";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { normalizePinHref } from "@/lib/pinned_primitives";
import { sourceContentActionLabel } from "@/lib/source_display";
import type { Source } from "@/types/api";

type SourceDetailActionsMenuProps = {
  source: Pick<Source, "id" | "mime_type" | "original_filename">;
  title: string;
  subtitle: string;
  showRefresh?: boolean;
  onDownload: () => void | Promise<void>;
};

export function SourceDetailActionsMenu({
  source,
  title,
  subtitle,
  showRefresh = false,
  onDownload,
}: SourceDetailActionsMenuProps) {
  const [openingContent, setOpeningContent] = useState(false);
  const { isPinned, toggle } = usePinnedPrimitives();
  const pinHref = normalizePinHref(`/sources/${encodeURIComponent(source.id)}`);
  const pinned = isPinned(pinHref);
  const openLabel = sourceContentActionLabel(source);

  return (
    <div className="flex items-center gap-2">
      {showRefresh ? <QueryRefreshIndicator /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Source actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              toggle({
                href: pinHref,
                kind: "source",
                label: title.trim() || pinHref,
                subtitle: subtitle.trim() || undefined,
              });
              toast.success(pinned ? "Unpinned from sidebar" : "Pinned to sidebar");
            }}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            disabled={openingContent}
            onSelect={(event) => {
              event.preventDefault();
              setOpeningContent(true);
              void openSourceContentInNewTab(source).finally(() => setOpeningContent(false));
            }}
          >
            <ExternalLink className="h-4 w-4" />
            {openLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={(event) => {
              event.preventDefault();
              void onDownload();
            }}
          >
            <Download className="h-4 w-4" />
            Download
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
