import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import { ActiveFilterBadges } from "@/components/shared/active_filter_badges";
import { FiltersCard } from "@/components/shared/filters_card";
import { ListSurface } from "@/components/shared/list_surface";
import { MobileFilterPopover } from "@/components/shared/mobile_filter_popover";
import { ListSkeleton } from "@/components/shared/query_status";
import { RecentRecordsFeed } from "@/components/shared/recent_records_feed";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
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
  const showSkeleton = showInitialQuerySkeleton(activity);
  const isAllTypesSelected = isFullSelection(selectedTypes);
  const activeTypeLabels = useMemo(
    () => sortTypes(selectedTypes).map((t) => TYPE_LABELS[t]),
    [selectedTypes],
  );

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

  const filterBadgeLabel = isAllTypesSelected
    ? "All"
    : `${selectedTypes.length}/${ALL_RECORD_ACTIVITY_TYPES.length}`;
  const filterSummary = isAllTypesSelected
    ? "All record types"
    : activeTypeLabels.join(", ");
  const filterBadgeSummary = isAllTypesSelected
    ? "All record types"
    : `${selectedTypes.length} of ${ALL_RECORD_ACTIVITY_TYPES.length} types`;
  const pageRangeLabel =
    items.length === 0
      ? "No rows on this page"
      : `Showing ${offset + 1}–${offset + items.length}${hasMore ? "+" : ""}`;

  const mobileFilterOptions = ALL_RECORD_ACTIVITY_TYPES.map((t) => ({
    value: t,
    label: TYPE_LABELS[t],
    description: TYPE_TOOLTIPS[t],
  }));

  return (
    <PageShell
      title="Activity"
      description="A unified audit stream of recently changed entities, sources, observations, interpretations, timeline rows, and relationships."
    >
      <div className="space-y-5">
        <FiltersCard
          title="Record filters"
          description="Choose which record families appear in the activity stream."
          headerEnd={
            <>
              <Badge
                variant={isAllTypesSelected ? "secondary" : "default"}
                className="tabular-nums"
                title={filterSummary}
              >
                {filterBadgeSummary}
              </Badge>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" aria-label="Type filter shortcuts">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Type filter shortcuts</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Type filter shortcuts</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => selectAllTypes()}>Select all types</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => invertSelection()}>Invert selection</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
          footer={
            !isAllTypesSelected ? (
              <ActiveFilterBadges values={activeTypeLabels} divider />
            ) : null
          }
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Label className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Types
            </Label>

            <div className="hidden flex-wrap items-center gap-1 md:flex">
              <SegmentedControl
                type="multiple"
                size="sm"
                value={selectedTypes}
                onValueChange={setTypesFromToggleValues}
                aria-label="Filter by record type"
              >
                {ALL_RECORD_ACTIVITY_TYPES.map((t) => (
                  <Tooltip key={t}>
                    <TooltipTrigger asChild>
                      <SegmentedControlItem value={t} aria-label={TYPE_LABELS[t]}>
                        {TYPE_LABELS[t]}
                      </SegmentedControlItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {TYPE_TOOLTIPS[t]}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </SegmentedControl>
            </div>

            <div className="flex md:hidden">
              <MobileFilterPopover
                triggerLabel="Types"
                heading="Included record types"
                tooltip="Open type filter"
                options={mobileFilterOptions}
                selected={selectedTypes}
                onToggle={toggleTypeCheckbox}
                onSelectAll={selectAllTypes}
                selectAllLabel="Select all types"
                badgeLabel={filterBadgeLabel}
              />
            </div>
          </div>
        </FiltersCard>

        <ListSurface
          title="Activity feed"
          description={filterSummary}
          headerEnd={
            <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
              {pageRangeLabel}
            </Badge>
          }
          loading={showSkeleton}
          loadingNode={<ListSkeleton rows={8} />}
          error={activity.error ?? null}
          errorTitle="Could not load activity"
          footer={
            (offset > 0 || hasMore) && (
              <Pagination className="mx-0 w-full justify-between border-t px-4 py-3">
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
            )
          }
        >
          <RecentRecordsFeed
            items={items}
            emptyMessage={
              isAllTypesSelected
                ? "No activity has been recorded yet."
                : "No activity matches the selected record types."
            }
          />
        </ListSurface>
      </div>
    </PageShell>
  );
}
