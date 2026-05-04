/**
 * Combined runner — orchestrates WRIT and Tier 2 against a shared
 * isolated Neotoma server.
 *
 * Execution order:
 *   1. Start one isolated Neotoma server.
 *   2. Run WRIT via runBenchmark() with NeotomaAdapter pointed at it.
 *   3. Reset the DB (stop + restart server).
 *   4. Run Tier 2 via runScenarios() in the requested mode.
 *   5. Merge results by matching writ:<category> tags.
 *   6. Tear down.
 */

import { resolve, join } from "node:path";

export interface CombinedOptions {
  repoRoot: string;
  mode: "replay" | "record";
  writCategories?: string[];
  tier2Only?: boolean;
  writOnly?: boolean;
  log?: (line: string) => void;
}

export interface CombinedResult {
  writReport: WritReportShape | null;
  tier2Summary: Tier2SummaryShape | null;
  layeredMatrix: LayeredMatrixRow[];
}

export interface WritReportShape {
  scenarios_run: number;
  aggregate: {
    recall_accuracy: number;
    update_fidelity: number;
    provenance_completeness: number;
    [key: string]: number;
  };
  by_category: Record<string, {
    recall_accuracy: number;
    update_fidelity: number;
    provenance_completeness: number;
    scenarios_evaluated: number;
    [key: string]: number;
  }>;
  scenario_results: Array<{
    scenario_id: string;
    category: string;
    scores: Record<string, number>;
  }>;
}

export interface Tier2SummaryShape {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cells: Array<{
    scenario: { id: string; tags?: string[] };
    model: { provider: string; model: string };
    pass: boolean;
    skipped?: { reason: string };
    errorMessage?: string;
  }>;
}

export interface LayeredMatrixRow {
  category: string;
  seedStrategy: string;
  agentLayer: {
    scenarios: number;
    passRate: number;
  };
  stateLayer: {
    scenarios: number;
    recall: number;
    update: number;
    provenance: number;
  };
}

function extractWritCategory(tags: string[] | undefined): string | null {
  if (!tags) return null;
  const tag = tags.find((t) => t.startsWith("writ:"));
  return tag ? tag.slice(5) : null;
}

function buildLayeredMatrix(
  writReport: WritReportShape | null,
  tier2Summary: Tier2SummaryShape | null
): LayeredMatrixRow[] {
  const rows: LayeredMatrixRow[] = [];
  const categoryMap = new Map<string, Map<string, { total: number; passed: number }>>();

  if (tier2Summary) {
    for (const cell of tier2Summary.cells) {
      const cat = extractWritCategory(cell.scenario.tags);
      if (!cat) continue;
      const seedTag = cell.scenario.tags?.find((t) =>
        ["generated", "real_derived", "hybrid_amplified"].includes(t)
      ) ?? "generated";

      const key = `${cat}|${seedTag}`;
      if (!categoryMap.has(key)) categoryMap.set(key, new Map());
      const m = categoryMap.get(key)!;
      if (!m.has(cat)) m.set(cat, { total: 0, passed: 0 });
      const entry = m.get(cat)!;
      entry.total++;
      if (cell.pass) entry.passed++;
    }
  }

  const allCategories = new Set<string>();
  if (writReport) {
    for (const cat of Object.keys(writReport.by_category)) allCategories.add(cat);
  }
  for (const key of categoryMap.keys()) {
    allCategories.add(key.split("|")[0]);
  }

  for (const cat of [...allCategories].sort()) {
    const writCat = writReport?.by_category[cat];
    const tier2Entries: Array<{ seed: string; total: number; passed: number }> = [];

    for (const [key, m] of categoryMap.entries()) {
      if (key.startsWith(`${cat}|`)) {
        const seed = key.split("|")[1];
        const entry = m.get(cat);
        if (entry) tier2Entries.push({ seed, total: entry.total, passed: entry.passed });
      }
    }

    if (tier2Entries.length === 0) {
      rows.push({
        category: cat,
        seedStrategy: "N/A",
        agentLayer: { scenarios: 0, passRate: 0 },
        stateLayer: {
          scenarios: writCat?.scenarios_evaluated ?? 0,
          recall: writCat?.recall_accuracy ?? 0,
          update: writCat?.update_fidelity ?? 0,
          provenance: writCat?.provenance_completeness ?? 0,
        },
      });
    } else {
      for (const entry of tier2Entries) {
        rows.push({
          category: cat,
          seedStrategy: entry.seed,
          agentLayer: {
            scenarios: entry.total,
            passRate: entry.total > 0 ? entry.passed / entry.total : 0,
          },
          stateLayer: {
            scenarios: writCat?.scenarios_evaluated ?? 0,
            recall: writCat?.recall_accuracy ?? 0,
            update: writCat?.update_fidelity ?? 0,
            provenance: writCat?.provenance_completeness ?? 0,
          },
        });
      }
    }
  }

  return rows;
}

export async function runCombined(opts: CombinedOptions): Promise<CombinedResult> {
  const log = opts.log ?? (() => undefined);
  let writReport: WritReportShape | null = null;
  let tier2Summary: Tier2SummaryShape | null = null;

  const evalHarnessPath = join(opts.repoRoot, "packages", "eval-harness");
  const writPath = join(opts.repoRoot, "writ");

  if (!opts.tier2Only) {
    log("[eval-combined] running WRIT benchmark...");
    try {
      const writ = await import(join(writPath, "src", "index.js"));
      const scenarios = writ.loadAllScenarios
        ? writ.loadAllScenarios(join(writPath, "scenarios"))
        : [];

      const filteredScenarios = opts.writCategories
        ? scenarios.filter((s: { category: string }) =>
            opts.writCategories!.includes(s.category)
          )
        : scenarios;

      if (filteredScenarios.length > 0) {
        const { startIsolatedNeotomaServer } = await import(
          join(evalHarnessPath, "src", "isolated_server.js")
        );
        const server = await startIsolatedNeotomaServer({ hooksEnabled: true });
        try {
          const adapter = new writ.NeotomaAdapter(server.baseUrl, {
            token: server.token,
          });
          const report = await writ.runBenchmark({
            scenarios: filteredScenarios,
            adapter,
          });
          writReport = report as WritReportShape;
          log(`[eval-combined] WRIT complete: ${report.scenarios_run} scenarios`);
        } finally {
          await server.stop();
        }
      } else {
        log("[eval-combined] no WRIT scenarios found or all filtered out");
      }
    } catch (err) {
      log(`[eval-combined] WRIT failed: ${(err as Error).message}`);
    }
  }

  if (!opts.writOnly) {
    log("[eval-combined] running Tier 2 eval harness...");
    try {
      const harness = await import(join(evalHarnessPath, "src", "index.js"));
      const scenarios = harness.loadScenariosFromDir();
      const summary = await harness.runScenarios({
        scenarios,
        mode: opts.mode as "replay" | "record",
        log,
      });
      tier2Summary = summary as Tier2SummaryShape;
      log(
        `[eval-combined] Tier 2 complete: ${summary.passed}/${summary.total} passed`
      );
    } catch (err) {
      log(`[eval-combined] Tier 2 failed: ${(err as Error).message}`);
    }
  }

  const layeredMatrix = buildLayeredMatrix(writReport, tier2Summary);
  return { writReport, tier2Summary, layeredMatrix };
}
