import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitiesQuery } from "@/hooks/use_entities";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
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

export default function IssuesPage() {
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");
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
  }, [query.data?.entities, filter]);

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

  return (
    <PageShell title="Issues" description="Issues and conversation threads stored in Neotoma">
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2">
              {(["open", "closed", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setSelected(new Set());
                  }}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(["all", "public", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setVisibility(v);
                    setSelected(new Set());
                  }}
                  className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                    visibility === v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {v === "all" ? "All sources" : v === "public" ? "GitHub" : "Private"}
                </button>
              ))}
            </div>
          </div>

          {issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllOnPage}
                aria-label="Select all issues"
              />
              <span className="text-muted-foreground">Select all</span>
            </label>
            <span className="text-muted-foreground text-sm">({selectedIds.length})</span>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busy !== null}
              onClick={async () => {
                const { ok, message } = await runBulk("close", selectedIds);
                if (!ok) setLastError(message);
              }}
              className="px-3 py-1 text-sm rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50"
            >
              {busy === "close" ? "Closing…" : "Close"}
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busy !== null}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Remove ${selectedIds.length} issue(s) from Neotoma? Linked GitHub issues will be closed if still open, then removed from this list.`,
                  )
                ) {
                  return;
                }
                const { ok, message } = await runBulk("remove", selectedIds);
                if (!ok) setLastError(message);
              }}
              className="px-3 py-1 text-sm rounded-md border border-destructive/50 text-destructive bg-background hover:bg-destructive/10 disabled:opacity-50"
            >
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </div>
        )}
        </div>
      </div>

      {lastError && (
        <p className="text-sm text-destructive mb-4" role="alert">
          {lastError}
        </p>
      )}

      {query.isLoading && <ListSkeleton />}
      {query.error && (
        <QueryErrorAlert title="Failed to load issues">{query.error.message}</QueryErrorAlert>
      )}

      {!query.isLoading && !query.error && issues.length === 0 && (
        <p className="text-muted-foreground">
          No {filter === "all" ? "" : filter} issues found. Use{" "}
          <code className="text-sm">neotoma issues sync</code> to pull from GitHub.
        </p>
      )}

      {!query.isLoading && issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((issue) => {
            const id = rowEntityId(issue);
            const listNumberLabel = getIssueListNumberLabel(issue);
            const submittedLabel = formatSubmitted(issue);
            return (
              <div
                key={id || getIssueRouteSegment(issue)}
                className="flex gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors items-start"
              >
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={id ? selected.has(id) : false}
                  onChange={() => id && toggleSelect(id)}
                  disabled={!id}
                  aria-label={`Select issue ${listNumberLabel !== "—" ? listNumberLabel : id ?? "unnumbered"}`}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/issues/${encodeURIComponent(getIssueRouteSegment(issue))}`}
                    className="block group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {listNumberLabel !== "—" ? (
                            <span className="font-mono text-muted-foreground text-sm">#{listNumberLabel}</span>
                          ) : null}
                          <h3 className="font-medium truncate group-hover:underline">
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            issueEntityField(issue, "status") === "open"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                          }`}
                        >
                          {String(issueEntityField(issue, "status") ?? "")}
                        </span>
                        {Array.isArray(issueEntityField(issue, "labels")) &&
                          (issueEntityField(issue, "labels") as string[]).map((label) => (
                            <span
                              key={label}
                              className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                            >
                              {label}
                            </span>
                          ))}
                      </div>
                    </div>
                  </Link>
                  {id ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-background"
                        disabled={busy !== null || issueEntityField(issue, "status") === "closed"}
                        onClick={async (e) => {
                          e.preventDefault();
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
                        }}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={busy !== null}
                        onClick={async (e) => {
                          e.preventDefault();
                          if (
                            !window.confirm(
                              "Remove this issue from Neotoma? If it is linked to GitHub and still open, it will be closed there first.",
                            )
                          ) {
                            return;
                          }
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
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
