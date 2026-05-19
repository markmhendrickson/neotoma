import { useEffect, useMemo, useState } from "react";
import { Filter, ListFilter, MoreHorizontal } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { RecentRecordsFeed } from "@/components/shared/recent_records_feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRecordActivity } from "@/hooks/use_record_activity";
import type { RecordActivityType } from "@/types/api";

const PAGE_SIZE = 50;

const ALL_RECORD_ACTIVITY_TYPES: RecordActivityType[] = [
  "entity",
  "source",
  "observation",
  "interpretation",
  "timeline_event",
  "relationship",
];

const TYPE_LABELS: Record<RecordActivityType, string> = {
  entity: "Entity",
  source: "Source",
  observation: "Observation",
  interpretation: "Interpretation",
  timeline_event: "Timeline",
  relationship: "Relationship",
};

const TYPE_TOOLTIPS: Record<RecordActivityType, string> = {
  entity: "Canonical entities you own (created or updated recently).",
  source: "Uploaded or ingested files and blobs tied to your account.",
  observation: "Structured facts extracted or stored for an entity.",
  interpretation: "Interpretation jobs and outcomes over your sources.",
  timeline_event: "Timeline rows derived from sources you own.",
  relationship: "Relationship snapshots between entities.",
};

function isFullSelection(types: RecordActivityType[]): boolean {
  return types.length === ALL_RECORD_ACTIVITY_TYPES.length;
}

function sortTypes(types: RecordActivityType[]): RecordActivityType[] {
  return [...types].sort(
    (a, b) => ALL_RECORD_ACTIVITY_TYPES.indexOf(a) - ALL_RECORD_ACTIVITY_TYPES.indexOf(b)
  );
}

export default function RecentActivityPage() {
  const [offset, setOffset] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<RecordActivityType[]>(() => [
    ...ALL_RECORD_ACTIVITY_TYPES,
  ]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const recordTypesParam = useMemo(() => {
    if (selectedTypes.length === 0 || isFullSelection(selectedTypes)) return undefined;
    return sortTypes(selectedTypes).join(",");
  }, [selectedTypes]);

  useEffect(() => {
    setOffset(0);
  }, [recordTypesParam]);

  const activity = useRecordActivity({
    limit: PAGE_SIZE,
    offset,
    record_types: recordTypesParam,
  });

  const items = activity.data?.items ?? [];
  const hasMore = activity.data?.has_more ?? false;
  const showSkeleton = activity.isPending && activity.data === undefined;

  function setTypesFromToggleValues(vals: string[]) {
    const next = vals as RecordActivityType[];
    setSelectedTypes(next.length === 0 ? [...ALL_RECORD_ACTIVITY_TYPES] : sortTypes(next));
  }

  function toggleTypeCheckbox(t: RecordActivityType, checked: boolean) {
    setSelectedTypes((prev) => {
      if (checked) {
        const merged = sortTypes([...prev, t]);
        return merged.length === 0 ? [...ALL_RECORD_ACTIVITY_TYPES] : merged;
      }
      const next = prev.filter((x) => x !== t);
      return next.length === 0 ? [...ALL_RECORD_ACTIVITY_TYPES] : next;
    });
  }

  function selectAllTypes() {
    setSelectedTypes([...ALL_RECORD_ACTIVITY_TYPES]);
  }

  function invertSelection() {
    setSelectedTypes((prev) => {
      const next = ALL_RECORD_ACTIVITY_TYPES.filter((t) => !prev.includes(t));
      return next.length === 0 ? [...ALL_RECORD_ACTIVITY_TYPES] : sortTypes(next);
    });
  }

  const filterBadgeLabel = isFullSelection(selectedTypes)
    ? "All"
    : `${selectedTypes.length}/${ALL_RECORD_ACTIVITY_TYPES.length}`;

  return (
    <PageShell
      title="Activity"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-muted-foreground">Types</Label>

              <div className="hidden flex-wrap items-center gap-1 md:flex">
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  value={selectedTypes}
                  onValueChange={setTypesFromToggleValues}
                  aria-label="Filter by record type"
                >
                  {ALL_RECORD_ACTIVITY_TYPES.map((t) => (
                    <Tooltip key={t}>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem value={t} aria-label={TYPE_LABELS[t]}>
                          {TYPE_LABELS[t]}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        {TYPE_TOOLTIPS[t]}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </ToggleGroup>
              </div>

              <div className="flex md:hidden">
                <Popover open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="gap-2">
                          <ListFilter className="h-4 w-4 shrink-0" aria-hidden />
                          <span>Types</span>
                          <Badge variant="secondary" className="font-normal tabular-nums">
                            {filterBadgeLabel}
                          </Badge>
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Open type filter</TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Included record types
                      </div>
                      <div className="space-y-2">
                        {ALL_RECORD_ACTIVITY_TYPES.map((t) => (
                          <label
                            key={t}
                            className="flex cursor-pointer items-center gap-2 rounded-md py-1 text-sm leading-none hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={selectedTypes.includes(t)}
                              onCheckedChange={(v) => toggleTypeCheckbox(t, v === true)}
                            />
                            <span>{TYPE_LABELS[t]}</span>
                          </label>
                        ))}
                      </div>
                      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={selectAllTypes}>
                        Select all types
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 self-start sm:self-center">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="More type filter actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">More actions and type checklist</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Type filters</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => selectAllTypes()}>Select all types</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => invertSelection()}>Invert selection</DropdownMenuItem>
                <DropdownMenuSeparator />
                {ALL_RECORD_ACTIVITY_TYPES.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={selectedTypes.includes(t)}
                    onCheckedChange={(checked) => toggleTypeCheckbox(t, checked === true)}
                  >
                    {TYPE_LABELS[t]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Separator />

        {showSkeleton ? (
          <ListSkeleton rows={8} />
        ) : activity.error ? (
          <QueryErrorAlert title="Could not load activity">{activity.error.message}</QueryErrorAlert>
        ) : (
          <>
            <RecentRecordsFeed items={items} emptyMessage="No records yet." />
            {(offset > 0 || hasMore) && (
              <Pagination className="mx-0 w-full justify-between">
                <PaginationContent className="flex w-full flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {items.length === 0
                      ? "No rows on this page."
                      : `Showing ${offset + 1}–${offset + items.length}`}
                  </p>
                  <div className="flex items-center gap-1">
                    <PaginationItem>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <PaginationPrevious
                              size="icon"
                              disabled={offset === 0}
                              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Newer activity</TooltipContent>
                      </Tooltip>
                    </PaginationItem>
                    <PaginationItem>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <PaginationNext
                              size="icon"
                              disabled={!hasMore}
                              onClick={() => setOffset(offset + PAGE_SIZE)}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Older activity</TooltipContent>
                      </Tooltip>
                    </PaginationItem>
                  </div>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
