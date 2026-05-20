import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EntityMarkdownPreview, type MarkdownPreviewMode } from "@/components/shared/entity_markdown_preview";
import { cn } from "@/lib/utils";

const WIDTH_STORAGE_KEY = "neotoma_inspector_markdown_sheet_width_px";
const DEFAULT_WIDTH_PX = 768;
const MIN_WIDTH_PX = 360;
const MAX_WIDTH_PX = 1400;

function maxWidthForViewport(): number {
  if (typeof window === "undefined") return MAX_WIDTH_PX;
  return Math.min(MAX_WIDTH_PX, Math.floor(window.innerWidth - 24));
}

function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH_PX, Math.min(maxWidthForViewport(), w));
}

function readStoredWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WIDTH_STORAGE_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return clampWidth(n);
  } catch {
    return null;
  }
}

export function MarkdownBodySheet({
  open,
  onOpenChange,
  title,
  description,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  content: string;
}) {
  const [viewMode, setViewMode] = useState<MarkdownPreviewMode>("formatted");
  const [copied, setCopied] = useState(false);
  const [panelWidthPx, setPanelWidthPx] = useState(DEFAULT_WIDTH_PX);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef({ startX: 0, startW: 0 });
  const widthRef = useRef(panelWidthPx);
  widthRef.current = panelWidthPx;

  useLayoutEffect(() => {
    const stored = readStoredWidth();
    if (stored != null) setPanelWidthPx(stored);
  }, []);

  useEffect(() => {
    function onWinResize() {
      setPanelWidthPx((w) => clampWidth(w));
    }
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    function onMove(e: PointerEvent) {
      const dx = dragRef.current.startX - e.clientX;
      setPanelWidthPx(clampWidth(dragRef.current.startW + dx));
    }
    function onUp() {
      setIsResizing(false);
      try {
        sessionStorage.setItem(WIDTH_STORAGE_KEY, String(widthRef.current));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const beginResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    setIsResizing(true);
  }, []);

  const resetWidth = useCallback(() => {
    setPanelWidthPx(DEFAULT_WIDTH_PX);
    try {
      sessionStorage.removeItem(WIDTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setViewMode("formatted");
      }}
    >
      <SheetContent
        side="right"
        className={cn(
          "z-[100] flex h-full flex-col gap-0 overflow-hidden border-l bg-card p-0 shadow-2xl !max-w-none",
          !isResizing && "transition-[width] duration-150 ease-out",
        )}
        style={{ width: `${panelWidthPx}px` }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize markdown panel"
          title="Drag to resize · double-click to reset"
          onPointerDown={beginResize}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resetWidth();
          }}
          className={cn(
            "absolute bottom-0 left-0 top-0 z-[60] flex w-3 cursor-ew-resize touch-none items-stretch justify-center pl-0.5",
            "hover:bg-primary/10 active:bg-primary/15",
            isResizing && "bg-primary/15",
          )}
        >
          <span className="my-auto h-10 w-1 shrink-0 rounded-full bg-border/90 shadow-sm" />
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-b border-border/80 bg-muted/20 px-8 py-5 pl-10 pr-16 backdrop-blur-[2px]">
          <SheetHeader className="space-y-1.5 text-left">
            <SheetTitle className="text-xl font-semibold leading-snug tracking-tight">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex w-fit rounded-lg border border-border/80 bg-muted p-0.5 text-xs shadow-sm"
              role="group"
              aria-label="Markdown display mode"
            >
              <button
                type="button"
                onClick={() => setViewMode("formatted")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  viewMode === "formatted"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  viewMode === "raw"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Raw
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-sm"
              disabled={!content}
              onClick={() => void handleCopy()}
              title="Copy raw field value (markdown source)"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              Copy
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth bg-gradient-to-b from-background to-muted/15 px-8 py-8 pl-10 sm:px-10 sm:pb-12 sm:pt-7">
          <EntityMarkdownPreview content={content} viewMode={viewMode} layout="panel" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
