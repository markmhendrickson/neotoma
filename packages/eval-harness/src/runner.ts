/**
 * Tier 2 runner.
 *
 * Drives one or more scenarios across the matrix:
 *   provider × model × instruction_profile × hooks_enabled
 *
 * For each cell:
 *   1. Spin up an isolated Neotoma server (fresh DB, random port).
 *   2. Pick the right driver and run the agent turn (live or replay).
 *   3. Pull /stats for instruction-profile counters.
 *   4. Run all `expected[]` assertions against the post-turn state.
 *   5. Tear the server down and persist a CellReport.
 *
 * The runner writes a structured JSON report so Tier 3 can ingest it as
 * historical eval data without parsing JUnit XML.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateExpectations } from "./assertions.js";
import { cassetteFilename, readCassette, staleness } from "./cassette.js";
import { getDriver } from "./drivers/index.js";
import { createHostToolRegistry } from "./host_tools.js";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "./isolated_server.js";
import type {
  AssertionFailure,
  CellReport,
  DriverInvocation,
  DriverResult,
  InstructionProfile,
  ModelEntry,
  ProviderId,
  RunMode,
  RunSummary,
  ScenarioFile,
} from "./types.js";

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
export const DEFAULT_CASSETTE_DIR = join(PKG_ROOT, "cassettes");

export interface RunnerOptions {
  scenarios: ScenarioFile[];
  mode: RunMode;
  /** Override the default cassette dir (typically used by tests). */
  cassetteDir?: string;
  /** Filter a specific provider, e.g. only run claude cells. */
  providerFilter?: ProviderId;
  /** Override per-scenario instruction_profile for matrix sweeps. */
  profileOverride?: InstructionProfile;
  /** Override hooks_enabled for matrix sweeps. */
  hooksOverride?: boolean;
  /** Hard cap for live USD spend across the matrix. */
  maxSpendUsd?: number;
  /** Single-cell timeout. Default 120s. */
  cellTimeoutMs?: number;
  /** Optional logger; defaults to a quiet logger. */
  log?: (line: string) => void;
}

interface CellPlan {
  scenario: ScenarioFile;
  model: ModelEntry;
  instructionProfile: InstructionProfile;
  hooksEnabled: boolean;
  cassettePath: string;
}

const SMALL_MODEL_HINTS = ["haiku", "mini", "nano", "fast", "small", "composer-2", "8b", "1.5b", "3b"];

function classifyEffectiveProfile(model: ModelEntry, requested: InstructionProfile): InstructionProfile {
  if (requested === "compact" || requested === "full") return requested;
  // auto = compact for small models, full otherwise. Mirrors the cursor-hooks heuristic.
  const lower = model.model.toLowerCase();
  return SMALL_MODEL_HINTS.some((hint) => lower.includes(hint)) ? "compact" : "full";
}

function expandMatrix(opts: RunnerOptions): CellPlan[] {
  const plans: CellPlan[] = [];
  const cassetteDir = opts.cassetteDir ?? DEFAULT_CASSETTE_DIR;
  for (const scenario of opts.scenarios) {
    for (const model of scenario.models) {
      if (opts.providerFilter && model.provider !== opts.providerFilter) continue;
      const instructionProfile = opts.profileOverride ?? scenario.instruction_profile ?? "auto";
      const hooksEnabled = opts.hooksOverride ?? scenario.hooks_enabled ?? true;
      const cassettePath = join(
        cassetteDir,
        cassetteFilename(scenario.meta.id, model.provider, model.model, model.cassette_id)
      );
      plans.push({ scenario, model, instructionProfile, hooksEnabled, cassettePath });
    }
  }
  return plans;
}

function shortToolCallSummary(result: DriverResult): string {
  if (!result.toolCalls.length) return "<no tool calls>";
  const counts = new Map<string, number>();
  for (const c of result.toolCalls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => `${name}×${count}`).join(", ");
}

async function runCell(plan: CellPlan, opts: RunnerOptions): Promise<CellReport> {
  const log = opts.log ?? (() => undefined);
  const startedAt = new Date().toISOString();
  const effectiveProfile = classifyEffectiveProfile(plan.model, plan.instructionProfile);
  const cellLabel = `${plan.scenario.meta.id} | ${plan.model.provider}/${plan.model.model} | profile=${effectiveProfile} | hooks=${plan.hooksEnabled}`;
  log(`[runner] starting cell: ${cellLabel}`);

  const driver = getDriver(plan.model.provider);
  const preflight = driver.preflight(opts.mode);
  if (!preflight.ok) {
    return {
      scenario: plan.scenario.meta,
      model: plan.model,
      effectiveProfile,
      mode: opts.mode,
      assertionFailures: [],
      startedAt,
      endedAt: new Date().toISOString(),
      pass: false,
      skipped: { reason: preflight.reason ?? "preflight failed" },
      errorMessage: preflight.reason,
    };
  }

  if (opts.mode === "replay") {
    const cassetteResult = readCassette(plan.cassettePath);
    if (!cassetteResult) {
      return {
        scenario: plan.scenario.meta,
        model: plan.model,
        effectiveProfile,
        mode: opts.mode,
        assertionFailures: [],
        startedAt,
        endedAt: new Date().toISOString(),
        pass: false,
        skipped: { reason: `replay mode requires cassette ${plan.cassettePath}; run --mode=record to capture it.` },
      };
    }
    if (staleness(cassetteResult.ageDays) === "stale") {
      log(
        `[runner] WARNING: cassette ${plan.cassettePath} is ${cassetteResult.ageDays} days old; consider re-recording.`
      );
    }
  }

  let server: IsolatedServer | null = null;
  let driverResult: DriverResult | undefined;
  let assertionFailures: AssertionFailure[] = [];
  let errorMessage: string | undefined;
  let pass = false;
  try {
    server = await startIsolatedNeotomaServer({
      hooksEnabled: plan.hooksEnabled,
      env: {
        NEOTOMA_INSTRUCTION_PROFILE_FORCE: effectiveProfile,
      },
    });
    log(`[runner] isolated server up at ${server.baseUrl} (data=${server.dataDir})`);

    const invocation: DriverInvocation = {
      scenario: plan.scenario,
      model: plan.model,
      neotomaBaseUrl: server.baseUrl,
      neotomaToken: server.token,
      effectiveProfile,
      mode: opts.mode,
      cassettePath: plan.cassettePath,
      timeoutMs: opts.cellTimeoutMs ?? 120_000,
    };
    driverResult = await runWithTimeout(driver.runOnce(invocation), invocation.timeoutMs!);

    const stats = await server.fetchInstructionProfileCounters();
    const registryForAssertions = createHostToolRegistry(plan.scenario.host_tools);
    // Replay the captured tool calls against the registry just so
    // host_tool.invocations counters reflect what happened. (The driver
    // already ran them, but the registry instance lives only inside the
    // driver call site.)
    for (const call of driverResult.toolCalls) {
      if (registryForAssertions.stubs.has(call.name)) {
        await registryForAssertions.invoke(call.name, call.input);
      }
    }
    assertionFailures = await evaluateExpectations(plan.scenario.expected, {
      baseUrl: server.baseUrl,
      stats,
      hostToolRegistry: registryForAssertions,
      effectiveProfile,
    });
    pass = assertionFailures.length === 0;
    if (!pass) {
      errorMessage = assertionFailures.map((f) => `• ${f.message}`).join("\n");
    } else {
      log(`[runner] cell PASS (${shortToolCallSummary(driverResult)})`);
    }
  } catch (err) {
    errorMessage = (err as Error).message;
    pass = false;
  } finally {
    if (server) await server.stop();
  }

  return {
    scenario: plan.scenario.meta,
    model: plan.model,
    effectiveProfile,
    mode: opts.mode,
    driverResult,
    assertionFailures,
    startedAt,
    endedAt: new Date().toISOString(),
    pass,
    errorMessage,
  };
}

function runWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolveT, reject) => {
    const t = setTimeout(() => reject(new Error(`cell timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolveT(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function runScenarios(opts: RunnerOptions): Promise<RunSummary> {
  const log = opts.log ?? (() => undefined);
  const plans = expandMatrix(opts);
  const cells: CellReport[] = [];
  let estimatedCostUsd = 0;
  for (const plan of plans) {
    if (
      opts.mode === "record" &&
      typeof opts.maxSpendUsd === "number" &&
      estimatedCostUsd >= opts.maxSpendUsd
    ) {
      cells.push({
        scenario: plan.scenario.meta,
        model: plan.model,
        effectiveProfile: classifyEffectiveProfile(plan.model, plan.instructionProfile),
        mode: opts.mode,
        assertionFailures: [],
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        pass: false,
        skipped: { reason: `budget guard: estimated $${estimatedCostUsd.toFixed(4)} ≥ cap $${opts.maxSpendUsd}` },
      });
      log(`[runner] budget guard tripped at $${estimatedCostUsd.toFixed(4)}; remaining cells skipped.`);
      continue;
    }
    const report = await runCell(plan, opts);
    if (report.driverResult) estimatedCostUsd += report.driverResult.estimatedCostUsd;
    cells.push(report);
  }
  const summary: RunSummary = {
    total: cells.length,
    passed: cells.filter((c) => c.pass && !c.skipped).length,
    failed: cells.filter((c) => !c.pass && !c.skipped).length,
    skipped: cells.filter((c) => c.skipped).length,
    cells,
    estimatedCostUsd,
    mode: opts.mode,
  };
  return summary;
}

export { dirname };
