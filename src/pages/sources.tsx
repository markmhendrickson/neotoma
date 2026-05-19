import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSources } from "@/hooks/use_sources";
import { useStore, useStoreUnstructured } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { SourceContentOpenButton } from "@/components/shared/source_content_open_button";
import {
  sourceDisplaySummary,
  sourceDisplayTitle,
  sourcePreviewChips,
} from "@/lib/source_display";

const PAGE_SIZE = 25;

type MimePreset = "all" | "audio" | "image" | "pdf" | "text" | "video" | "custom";

const MIME_PRESET_FILTERS: { id: Exclude<MimePreset, "all" | "custom">; label: string; needle: string }[] = [
  { id: "audio", label: "Audio", needle: "audio" },
  { id: "image", label: "Image", needle: "image" },
  { id: "pdf", label: "PDF", needle: "pdf" },
  { id: "text", label: "Text", needle: "text" },
  { id: "video", label: "Video", needle: "video" },
];

export default function SourcesPage() {
  const [search, setSearch] = useState("");
  const [mimePreset, setMimePreset] = useState<MimePreset>("all");
  const [mimeCustom, setMimeCustom] = useState("");
  const [offset, setOffset] = useState(0);

  const mimeTypeForApi =
    mimePreset === "all"
      ? undefined
      : mimePreset === "custom"
        ? mimeCustom.trim() || undefined
        : MIME_PRESET_FILTERS.find((p) => p.id === mimePreset)?.needle;

  const sources = useSources({
    search: search || undefined,
    mime_type: mimeTypeForApi,
    limit: PAGE_SIZE,
    offset,
  });
  const sourcesList = sources.data?.sources ?? [];
  const { filterRows, AgentFilterControl } =
    useAgentAttributionFilter(sourcesList);
  const displayedSources = filterRows(sourcesList);

  function setMimePresetAndReset(preset: MimePreset) {
    setMimePreset(preset);
    if (preset !== "custom") setMimeCustom("");
    setOffset(0);
  }

  const headerSearch = useMemo<HeaderSearchContextValue>(
    () => ({
      value: search,
      onValueChange: (nextSearch) => {
        setSearch(nextSearch);
        setOffset(0);
      },
      placeholder: "Search sources…",
      ariaLabel: "Search sources",
    }),
    [search],
  );

  const [storeJson, setStoreJson] = useState('{\n  "entities": [],\n  "idempotency_key": ""\n}');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const storeMut = useStore();
  const uploadMut = useStoreUnstructured();

  return (
    <PageShell
      title="Sources"
      search={headerSearch}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(sources) ? <QueryRefreshIndicator /> : null}
          <Dialog>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-3 w-3 mr-1" /> Store</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Store (Structured)</DialogTitle><DialogDescription>Submit a structured store request with entities and relationships.</DialogDescription></DialogHeader>
              <div><Label>Request JSON</Label><Textarea value={storeJson} onChange={(e) => setStoreJson(e.target.value)} rows={12} className="font-mono text-xs" /></div>
              <DialogFooter>
                <Button onClick={() => {
                  try {
                    storeMut.mutate(JSON.parse(storeJson), { onSuccess: () => toast.success("Stored successfully") });
                  } catch { toast.error("Invalid JSON"); }
                }}>Store</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Upload className="h-3 w-3 mr-1" /> Upload</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload File</DialogTitle><DialogDescription>Upload a raw file for unstructured storage.</DialogDescription></DialogHeader>
              <div>
                <Label>File</Label>
                <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
              </div>
              <DialogFooter>
                <Button disabled={!uploadFile} onClick={async () => {
                  if (!uploadFile) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(",")[1]!;
                    uploadMut.mutate(
                      { file_content: base64, mime_type: uploadFile.type || "application/octet-stream", original_filename: uploadFile.name },
                      { onSuccess: () => { toast.success("File uploaded"); setUploadFile(null); } }
                    );
                  };
                  reader.readAsDataURL(uploadFile);
                }}>Upload</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5 sm:flex-[0_1_auto]">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={mimePreset === "all" ? "secondary" : "outline"}
                className="h-8 shrink-0 px-2.5 text-xs"
                onClick={() => setMimePresetAndReset("all")}
              >
                All
              </Button>
              {MIME_PRESET_FILTERS.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={mimePreset === id ? "secondary" : "outline"}
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => setMimePresetAndReset(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex w-full min-w-[140px] flex-col gap-1.5 sm:w-[200px]">
            <span className="text-xs font-medium text-muted-foreground">Custom MIME</span>
            <Input
              placeholder="e.g. wav, octet-stream"
              value={mimeCustom}
              onChange={(e) => {
                setMimeCustom(e.target.value);
                setMimePreset("custom");
                setOffset(0);
              }}
              className="h-8"
            />
          </div>
          <AgentFilterControl />
        </div>
      </div>

      {showInitialQuerySkeleton(sources) ? (
        <ListSkeleton rows={10} />
      ) : sources.error ? (
        <QueryErrorAlert title="Could not load sources">{sources.error.message}</QueryErrorAlert>
      ) : (
        <>
          <div className="space-y-3">
            {displayedSources.map((source) => (
              <div key={source.id} className="rounded-md border bg-card p-3 text-card-foreground">
                <div className="flex items-start gap-3">
                  <LiveRelativeTime
                    iso={source.created_at}
                    className="inline-block w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/sources/${encodeURIComponent(source.id)}`}
                        className="text-sm font-medium text-primary hover:underline"
                        title={source.id}
                      >
                        {sourceDisplayTitle(source)}
                      </Link>
                      <AgentBadge
                        provenance={source.provenance ?? null}
                        iconOnly
                      />
                      <SourceContentOpenButton
                        source={source}
                        className="h-7 px-2 text-xs"
                      />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {sourceDisplaySummary(source)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sourcePreviewChips(source).slice(0, 5).map((chip) => (
                        <Badge
                          key={`${source.id}-${chip}`}
                          variant="secondary"
                          className="font-normal text-muted-foreground"
                        >
                          {chip}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {sources.data && sources.data.sources.length >= PAGE_SIZE && (
            <Pagination offset={offset} limit={PAGE_SIZE} total={sources.data.sources.length + offset + 1} onPageChange={setOffset} />
          )}
        </>
      )}
    </PageShell>
  );
}

