import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useComplianceScorecard } from "@/hooks/use_compliance";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";

const SINCE_OPTIONS = ["24h", "7d", "30d", "90d"] as const;
const GROUP_OPTIONS = [
  "model+harness",
  "model",
  "harness",
  "profile",
  "model+harness+profile",
] as const;

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)} %`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function severity(rate: number): string {
  if (rate >= 0.3) return "text-red-600 dark:text-red-400";
  if (rate >= 0.1) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function HeatBar({ values }: { values: number[] }) {
  if (values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex h-3 items-end gap-px">
      {values.map((v, idx) => {
        const intensity = Math.max(0, Math.min(1, v));
        const bg = `rgb(${Math.round(220 + intensity * 35)}, ${Math.round(80 + (1 - intensity) * 100)}, ${Math.round(80 + (1 - intensity) * 100)})`;
        const height = `${Math.max(10, Math.round(intensity * 100))}%`;
        return (
          <div
            key={idx}
            title={`${formatPercent(v)}`}
            className="w-1.5 rounded-sm"
            style={{ backgroundColor: bg, height }}
          />
        );
      })}
    </div>
  );
}

export default function ComplianceDashboardPage() {
  const [since, setSince] = useState<string>("7d");
  const [groupBy, setGroupBy] = useState<string>("model+harness");

  const params = useMemo(
    () => ({
      since,
      group_by: groupBy,
      min_turns: 25,
      top_missed_steps: 5,
    }),
    [since, groupBy],
  );

  const card = useComplianceScorecard(params);
  const summary = card.data?.summary;

  return (
    <PageShell
      title="Compliance scorecard"
      description="Per-(model × harness × profile) backfill rate from turn_compliance observations. Lower is better."
      actions={showBackgroundQueryRefresh(card) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compliance-since" className="text-xs text-muted-foreground">
              Window
            </Label>
            <Select value={since} onValueChange={setSince}>
              <SelectTrigger id="compliance-since" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SINCE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    last {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="compliance-group-by"
              className="text-xs text-muted-foreground"
            >
              Group by
            </Label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger id="compliance-group-by" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {summary ? (
            <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Overall backfill rate
              </span>
              <span className={`text-2xl font-semibold ${severity(summary.backfill_rate)}`}>
                {formatPercent(summary.backfill_rate)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatNumber(summary.backfilled_turns)} of {formatNumber(summary.total_turns)} turns ·{" "}
                {summary.cell_count} cells
              </span>
            </div>
          ) : null}
        </div>

        <Separator />

        {showInitialQuerySkeleton(card) ? (
          <ListSkeleton rows={6} />
        ) : card.error ? (
          <QueryErrorAlert title="Could not load compliance data">
            {card.error.message}
          </QueryErrorAlert>
        ) : !card.data || card.data.cells.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No turns matched the supplied filters. Confirm that hooks are
            installed and emitting `turn_compliance` observations.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Harness</th>
                  <th className="px-3 py-2">Profile</th>
                  <th className="px-3 py-2 text-right">Turns</th>
                  <th className="px-3 py-2 text-right">Backfilled</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2">Daily</th>
                  <th className="px-3 py-2">Top missed</th>
                </tr>
              </thead>
              <tbody>
                {card.data.cells.map((cell, idx) => {
                  const days = Object.keys(cell.daily_backfill_rate).sort();
                  const series = days.map((d) => cell.daily_backfill_rate[d] ?? 0);
                  return (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">
                        {cell.model}
                        {cell.estimated ? (
                          <span
                            title="Estimated from historical data"
                            className="ml-1 text-muted-foreground"
                          >
                            *
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{cell.harness}</td>
                      <td className="px-3 py-2">{cell.profile}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(cell.total_turns)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(cell.backfilled_turns)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${severity(cell.backfill_rate)}`}
                      >
                        {formatPercent(cell.backfill_rate)}
                      </td>
                      <td className="px-3 py-2">
                        <HeatBar values={series} />
                      </td>
                      <td className="px-3 py-2">
                        {cell.top_missed_steps.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5 text-xs text-muted-foreground">
                            {cell.top_missed_steps.slice(0, 3).map((s) => (
                              <li key={s.step}>
                                <code>{s.step}</code> · {formatNumber(s.count)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {summary && summary.top_missed_steps.length > 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium">
              Top missed steps (across all rows)
            </h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {summary.top_missed_steps.map((s) => (
                <li key={s.step}>
                  <code className="text-foreground">{s.step}</code> ·{" "}
                  {formatNumber(s.count)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
