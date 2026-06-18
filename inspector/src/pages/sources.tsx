import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { useSources } from "@/hooks/use_sources";
import { useStore, useStoreUnstructured } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import { ActiveFilterBadges } from "@/components/shared/active_filter_badges";
import { FiltersCard } from "@/components/shared/filters_card";
import { ListSurface } from "@/components/shared/list_surface";
import { ListSkeleton } from "@/components/shared/query_status";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { MobileFilterPopover, type MobileFilterOption } from "@/components/shared/mobile_filter_popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
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

const PRESET_OPTIONS: { value: Exclude<MimePreset, "custom">; label: string }[] = [
  { value: "all", label: "All" },
  ...MIME_PRESET_FILTERS.map(({ id, label }) => ({ value: id, label })),
];

function presetLabel(preset: MimePreset, custom: string): string {
  if (preset === "all") return "All";
  if (preset === "custom") return custom.trim() ? `Custom: ${custom.trim()}` : "Custom";
  return MIME_PRESET_FILTERS.find((p) => p.id === preset)?.label ?? preset;
}

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
  const { filter, filterRows, AgentFilterControl } =
    useAgentAttributionFilter(sourcesList);
  const displayedSources = filterRows(sourcesList);
  const agentFilterActive = filter.kind !== "all";

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

  const showSkeleton = showInitialQuerySkeleton(sources);
  const isEmpty = !showSkeleton && !sources.error && displayedSources.length === 0;
  const activeMimeLabel = presetLabel(mimePreset, mimeCustom);
  const activeFilterGroups: { label: string; values: string[] }[] = [];
  if (mimePreset !== "all") {
    activeFilterGroups.push({ label: "Type", values: [activeMimeLabel] });
  }
  if (search.trim()) {
    activeFilterGroups.push({ label: "Search", values: [search.trim()] });
  }

  const totalLoaded = sourcesList.length;
  const rangeStart = totalLoaded === 0 ? 0 : offset + 1;
  const rangeEnd = offset + totalLoaded;
  const rangeLabel =
    totalLoaded === 0
      ? "No sources on this page"
      : displayedSources.length === totalLoaded
        ? `Showing ${rangeStart}–${rangeEnd}`
        : `Showing ${displayedSources.length} of ${totalLoaded}`;

  const surfaceDescriptionParts: string[] = [];
  if (mimePreset === "all") {
    surfaceDescriptionParts.push("All MIME types");
  } else {
    surfaceDescriptionParts.push(activeMimeLabel);
  }
  if (search.trim()) {
    surfaceDescriptionParts.push(`matching “${search.trim()}”`);
  }
  const surfaceDescription = surfaceDescriptionParts.join(" · ");

  return (
    <PageShell
      title="Sources"
      description="Content-addressed raw files and blobs tied to your account. Filter by MIME type, search by ID or filename, or upload a new source."
      search={headerSearch}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(sources) ? <QueryRefreshIndicator /> : null}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3 w-3" /> Store
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Store (Structured)</DialogTitle>
                <DialogDescription>
                  Submit a structured store request with entities and relationships.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label>Request JSON</Label>
                <Textarea
                  value={storeJson}
                  onChange={(e) => setStoreJson(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    try {
                      storeMut.mutate(JSON.parse(storeJson), {
                        onSuccess: () => toast.success("Stored successfully"),
                      });
                    } catch {
                      toast.error("Invalid JSON");
                    }
                  }}
                >
                  Store
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload className="mr-1 h-3 w-3" /> Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
                <DialogDescription>Upload a raw file for unstructured storage.</DialogDescription>
              </DialogHeader>
              <div>
                <Label>File</Label>
                <Input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={!uploadFile}
                  onClick={async () => {
                    if (!uploadFile) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1]!;
                      uploadMut.mutate(
                        {
                          file_content: base64,
                          mime_type: uploadFile.type || "application/octet-stream",
                          original_filename: uploadFile.name,
                        },
                        {
                          onSuccess: () => {
                            toast.success("File uploaded");
                            setUploadFile(null);
                          },
                        },
                      );
                    };
                    reader.readAsDataURL(uploadFile);
                  }}
                >
                  Upload
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="space-y-5">
        <FiltersCard
          title="Source filters"
          description="Filter by MIME type or attributing agent. Search is in the header."
          footer={
            activeFilterGroups.length > 0 ? (
              <ActiveFilterBadges groups={activeFilterGroups} divider />
            ) : null
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <Label className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground md:w-20">
                Type
              </Label>
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <SegmentedControl
                  type="single"
                  size="sm"
                  value={mimePreset === "custom" ? "" : mimePreset}
                  onValueChange={(val) => {
                    if (val) setMimePresetAndReset(val as MimePreset);
                  }}
                  aria-label="Filter by MIME preset"
                  className="hidden md:inline-flex"
                >
                  {PRESET_OPTIONS.map((opt) => (
                    <SegmentedControlItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
                <MobileFilterPopover<Exclude<MimePreset, "custom">>
                  className="md:hidden"
                  triggerLabel="MIME type"
                  heading="Filter by MIME type"
                  tooltip="Filter by MIME preset"
                  badgeLabel={
                    mimePreset === "all"
                      ? "All"
                      : mimePreset === "custom"
                        ? "Custom"
                        : PRESET_OPTIONS.find((opt) => opt.value === mimePreset)?.label
                  }
                  options={PRESET_OPTIONS.map<MobileFilterOption<Exclude<MimePreset, "custom">>>(
                    (opt) => ({ value: opt.value, label: opt.label }),
                  )}
                  selected={mimePreset !== "custom" ? [mimePreset] : []}
                  onToggle={(value, checked) => {
                    if (checked) {
                      setMimePresetAndReset(value as MimePreset);
                    } else if (mimePreset === value) {
                      setMimePresetAndReset("all");
                    }
                  }}
                />
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Custom MIME</span>
                  <Input
                    placeholder="e.g. wav, octet-stream"
                    value={mimeCustom}
                    onChange={(e) => {
                      setMimeCustom(e.target.value);
                      setMimePreset("custom");
                      setOffset(0);
                    }}
                    className="h-8 w-full md:w-[200px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <Label className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground md:w-20">
                Agent
              </Label>
              <AgentFilterControl />
            </div>
          </div>
        </FiltersCard>

        <ListSurface
          title="Sources"
          description={surfaceDescription}
          headerEnd={
            !showSkeleton && !sources.error ? (
              <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
                {rangeLabel}
              </Badge>
            ) : null
          }
          loading={showSkeleton}
          loadingNode={<ListSkeleton rows={10} />}
          error={sources.error ? { message: sources.error.message } : null}
          errorTitle="Could not load sources"
          isEmpty={isEmpty}
          emptyMessage={
            search.trim() || mimePreset !== "all" || agentFilterActive
              ? "No sources match the current filters."
              : "No sources have been stored yet."
          }
          footer={
            sources.data && sources.data.sources.length >= PAGE_SIZE ? (
              <div className="border-t px-4 py-3">
                <Pagination
                  offset={offset}
                  limit={PAGE_SIZE}
                  total={sources.data.sources.length + offset + 1}
                  onPageChange={setOffset}
                />
              </div>
            ) : null
          }
        >
          <div className="space-y-3">
            {displayedSources.map((source) => (
              <div
                key={source.id}
                className="rounded-md border bg-card p-3 text-card-foreground"
              >
                <div className="flex items-start gap-3">
                  <LiveRelativeTime
                    iso={source.created_at}
                    className="inline-block w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/sources/${encodeURIComponent(source.id)}`}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                        title={source.id}
                      >
                        {sourceDisplayTitle(source)}
                      </Link>
                      <AgentBadge provenance={source.provenance ?? null} iconOnly />
                      <SourceContentOpenButton source={source} className="h-7 px-2 text-xs" />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {sourceDisplaySummary(source)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sourcePreviewChips(source)
                        .slice(0, 5)
                        .map((chip) => (
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
        </ListSurface>
      </div>
    </PageShell>
  );
}
