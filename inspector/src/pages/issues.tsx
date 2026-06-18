import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitiesQuery } from "@/hooks/use_entities";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import { PageShell } from "@/components/layout/page_shell";
import { ActiveFilterBadges } from "@/components/shared/active_filter_badges";
import { FiltersCard } from "@/components/shared/filters_card";
import { ListSurface } from "@/components/shared/list_surface";
import { MobileFilterPopover } from "@/components/shared/mobile_filter_popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  getIssueListNumberLabel,
  getIssueRouteSegment,
  isGithubLinkedIssue,
  issueEntityField,
} from "@/utils/issue_navigation";
import { bulkCloseIssues, bulkRemoveIssues } from "@/api/endpoints/issues";
import { IssueAuthorLine } from "@/components/shared/issue_author_attribution";
import { formatDate } from "@/lib/utils";
import type { EntitySnapshot } from "@/types/api";

function rowEntityId(issue: EntitySnapshot): string {
  return String(issue.entity_id ?? issue.id ?? "");
}

/** GitHub / issue row `created_at` (ISO) used as submitted time. */
function submittedAtRaw(issue: EntitySnapshot): string | undefined {
  const merged = issueEntityField(issue, "created_at");
  if (typeof merged === "string" && merged.trim()) return merged.trim();
  const top = issue.created_at;
  if (typeof top === "string" && top.trim()) return top.trim();
  return undefined;
}

function submittedAtMs(issue: EntitySnapshot): number {
  const raw = submittedAtRaw(issue);
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function formatSubmitted(issue: EntitySnapshot): string | null {
  const raw = submittedAtRaw(issue);
  if (!raw) return null;
  const formatted = formatDate(raw);
  return formatted === "—" ? null : formatted;
}

type StatusFilter = "open" | "closed" | "all";
type VisibilityFilter = "all" | "public" | "private";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "public", label: "GitHub" },
  { value: "private", label: "Private" },
];

export default function IssuesPage() {
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"close" | "remove" | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const query = useEntitiesQuery({
    entity_type: "issue",
    limit: 100,
    offset: 0,
    sort_by: "submitted_at",
    sort_order: "desc",
  });

  const issues = useMemo(() => {
    const filtered = (query.data?.entities ?? []).filter((issue) => {
      if (filter !== "all" && issueEntityField(issue, "status") !== filter) return false;
      if (visibility === "public" && !isGithubLinkedIssue(issue)) return false;
      if (visibility === "private" && isGithubLinkedIssue(issue)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const d = submittedAtMs(b) - submittedAtMs(a);
      if (d !== 0) return d;
      return rowEntityId(a).localeCompare(rowEntityId(b));
    });
  }, [query.data?.entities, filter, visibility]);

  const issueIdsOnPage = useMemo(
    () => issues.map(rowEntityId).filter((id) => id.length > 0),
    [issues],
  );

  const allVisibleSelected =
    issueIdsOnPage.length > 0 && issueIdsOnPage.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of issueIdsOnPage) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of issueIdsOnPage) next.add(id);
        return next;
      });
    }
  }

  const selectedIds = issueIdsOnPage.filter((id) => selected.has(id));

  async function runBulk(
    mode: "close" | "remove",
    ids: string[],
  ): Promise<{ ok: boolean; message: string }> {
    if (ids.length === 0) {
      return { ok: false, message: "No issues selected." };
    }
    setBusy(mode);
    setLastError(null);
    try {
      const res = mode === "close" ? await bulkCloseIssues(ids) : await bulkRemoveIssues(ids);
      const failed = res.results.filter((r) => !r.ok);
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
      setSelected(new Set());
      if (failed.length > 0) {
        const msg = failed.map((f) => `${f.entity_id}: ${f.error ?? "failed"}`).join("; ");
        return { ok: false, message: msg };
      }
      return { ok: true, message: "" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    } finally {
      setBusy(null);
    }
  }

  async function closeSingle(id: string) {
    setLastError(null);
    setBusy("close");
    try {
      const res = await bulkCloseIssues([id]);
      const row = res.results[0];
      if (!row?.ok) setLastError(row?.error ?? "Close failed");
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeSingle(id: string) {
    setLastError(null);
    setBusy("remove");
    try {
      const res = await bulkRemoveIssues([id]);
      const row = res.results[0];
      if (!row?.ok) {
        setLastError(row?.error ?? "Remove failed");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["entities"] });
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = STATUS_OPTIONS.find((s) => s.value === filter)?.label ?? filter;
  const visibilityLabel = VISIBILITY_OPTIONS.find((v) => v.value === visibility)?.label ?? visibility;
  const activeFilterGroups = [
    { label: "Status", values: [statusLabel] },
    { label: "Source", values: [visibilityLabel] },
  ];

  const statusBadgeLabel =
    filter === "open" ? "Open" : filter === "closed" ? "Closed" : "All";

  const totalCount = query.data?.entities?.length ?? 0;
  const showSkeleton = showInitialQuerySkeleton(query);
  const headerCountLabel =
    issues.length === 0
      ? "No issues"
      : totalCount === issues.length
        ? `${issues.length} issue${issues.length === 1 ? "" : "s"}`
        : `${issues.length} of ${totalCount}`;

  return (
    <PageShell
      title="Issues"
      description="Issues and conversation threads stored in Neotoma. Use status and source filters to scope the list; bulk close or remove from the selection row."
    >
      <div className="space-y-5">
        <FiltersCard
          title="Issue filters"
          description="Filter by issue status and origin (GitHub-linked or private)."
          footer={<ActiveFilterBadges groups={activeFilterGroups} divider />}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <Label className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground md:w-20">
                Status
              </Label>
              <div className="hidden md:flex">
                <SegmentedControl
                  type="single"
                  size="sm"
                  value={filter}
                  onValueChange={(val) => {
                    if (val) {
                      setFilter(val as StatusFilter);
                      setSelected(new Set());
                    }
                  }}
                  aria-label="Filter by issue status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <SegmentedControlItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>
              <div className="flex md:hidden">
                <MobileFilterPopover
                  triggerLabel="Status"
                  heading="Issue status"
                  tooltip="Open status filter"
                  badgeLabel={statusBadgeLabel}
                  options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  selected={[filter]}
                  onToggle={(value, checked) => {
                    if (checked) {
                      setFilter(value);
                      setSelected(new Set());
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <Label className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground md:w-20">
                Source
              </Label>
              <div className="hidden md:flex">
                <SegmentedControl
                  type="single"
                  size="sm"
                  value={visibility}
                  onValueChange={(val) => {
                    if (val) {
                      setVisibility(val as VisibilityFilter);
                      setSelected(new Set());
                    }
                  }}
                  aria-label="Filter by issue source"
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <SegmentedControlItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>
              <div className="flex md:hidden">
                <MobileFilterPopover
                  triggerLabel="Source"
                  heading="Issue source"
                  tooltip="Open source filter"
                  badgeLabel={visibilityLabel}
                  options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  selected={[visibility]}
                  onToggle={(value, checked) => {
                    if (checked) {
                      setVisibility(value);
                      setSelected(new Set());
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </FiltersCard>

        {lastError ? (
          <p className="text-sm text-destructive" role="alert">
            {lastError}
          </p>
        ) : null}

        <ListSurface
          title="Issues"
          description={`${statusLabel} · ${visibilityLabel}`}
          headerEnd={
            !showSkeleton && !query.error ? (
              <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
                {headerCountLabel}
              </Badge>
            ) : null
          }
          loading={showSkeleton}
          error={query.error ? { message: query.error.message } : null}
          errorTitle="Failed to load issues"
          isEmpty={!showSkeleton && !query.error && issues.length === 0}
          emptyMessage={
            <>
              No {filter === "all" ? "" : filter} issues found. Use{" "}
              <code className="text-sm">neotoma issues sync</code> to pull from GitHub.
            </>
          }
        >
          {issues.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                <Label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAllOnPage}
                    aria-label="Select all issues"
                  />
                  <span className="text-muted-foreground">Select all</span>
                </Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  ({selectedIds.length})
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedIds.length === 0 || busy !== null}
                    onClick={async () => {
                      const { ok, message } = await runBulk("close", selectedIds);
                      if (!ok) setLastError(message);
                    }}
                  >
                    {busy === "close" ? "Closing…" : "Close"}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={selectedIds.length === 0 || busy !== null}
                      >
                        {busy === "remove" ? "Removing…" : "Remove"}
                      </Button>
                    }
                    title={`Remove ${selectedIds.length} issue${selectedIds.length === 1 ? "" : "s"}?`}
                    description="Linked GitHub issues will be closed if still open, then removed from this list."
                    confirmLabel="Remove"
                    variant="destructive"
                    onConfirm={async () => {
                      const { ok, message } = await runBulk("remove", selectedIds);
                      if (!ok) setLastError(message);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {issues.map((issue) => {
                  const id = rowEntityId(issue);
                  const listNumberLabel = getIssueListNumberLabel(issue);
                  const submittedLabel = formatSubmitted(issue);
                  const isClosed = issueEntityField(issue, "status") === "closed";
                  return (
                    <div
                      key={id || getIssueRouteSegment(issue)}
                      className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        className="mt-1 shrink-0"
                        checked={id ? selected.has(id) : false}
                        onCheckedChange={() => id && toggleSelect(id)}
                        disabled={!id}
                        aria-label={`Select issue ${listNumberLabel !== "—" ? listNumberLabel : (id ?? "unnumbered")}`}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/issues/${encodeURIComponent(getIssueRouteSegment(issue))}`}
                          className="block group"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {listNumberLabel !== "—" ? (
                                  <span className="font-mono text-sm text-muted-foreground">#{listNumberLabel}</span>
                                ) : null}
                                <h3 className="truncate font-medium group-hover:underline">
                                  {String(issueEntityField(issue, "title") ?? "")}
                                </h3>
                              </div>
                              <div className="mt-1 flex min-w-0 flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                                {submittedLabel ? (
                                  <span className="min-w-0 flex-1">
                                    Submitted{" "}
                                    <span className="text-foreground/90">{submittedLabel}</span>
                                  </span>
                                ) : null}
                                <span className="shrink-0">
                                  <IssueAuthorLine
                                    author={String(issueEntityField(issue, "author") ?? "unknown")}
                                    provenance={issue.provenance}
                                  />
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge
                                variant={isClosed ? "secondary" : "default"}
                                className="font-normal"
                              >
                                {String(issueEntityField(issue, "status") ?? "")}
                              </Badge>
                              {Array.isArray(issueEntityField(issue, "labels")) &&
                                (issueEntityField(issue, "labels") as string[]).map((label) => (
                                  <Badge key={label} variant="outline" className="font-normal">
                                    {label}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        </Link>
                        {id ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 px-3 text-xs sm:h-7 sm:px-2"
                              disabled={busy !== null || isClosed}
                              onClick={(e) => {
                                e.preventDefault();
                                void closeSingle(id);
                              }}
                            >
                              Close
                            </Button>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-9 border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10 sm:h-7 sm:px-2"
                                  disabled={busy !== null}
                                  onClick={(e) => e.preventDefault()}
                                >
                                  Remove
                                </Button>
                              }
                              title="Remove this issue?"
                              description="If it is linked to GitHub and still open, it will be closed there first, then removed from this list."
                              confirmLabel="Remove"
                              variant="destructive"
                              onConfirm={() => {
                                void removeSingle(id);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </ListSurface>
      </div>
    </PageShell>
  );
}
