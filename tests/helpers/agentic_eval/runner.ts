/**
 * Tier 1 agentic-eval runner.
 *
 * Discovers all fixtures under `tests/fixtures/agentic_eval/*.json`,
 * expands each into a `harness × model` matrix, and runs every cell
 * against an in-process MockNeotomaServer with hard per-cell isolation.
 *
 * Public surface:
 *   - `loadFixtures()`: discovery
 *   - `expandMatrix(fixture)`: yields one `Cell` per harness × model
 *   - `runCell(cell, server, adapter)`: executes a single cell end-to-end
 *   - `summarizeRun(results)`: aggregate report string for CLI mode
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { evaluateCell, type AssertionReport } from "./assertions.js";
import {
  createCursorHooksAdapter,
} from "./adapters/cursor_hooks.js";
import {
  createClaudeCodeAdapter,
  createCodexHooksAdapter,
} from "./adapters/python_hooks.js";
import {
  createOpencodePluginAdapter,
  createClaudeAgentSdkAdapter,
} from "./adapters/typescript_module_stubs.js";
import { renderFailureReport } from "./failure_report.js";
import {
  startMockNeotomaServer,
  type MockNeotomaServer,
} from "./mock_neotoma_server.js";
import {
  compareOrUpdateSnapshot,
  serializeSnapshot,
  snapshotPath,
} from "./snapshot.js";
import type {
  AgenticEvalFixture,
  CellContext,
  CellResult,
  HarnessAdapter,
  HarnessId,
} from "./types.js";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const FIXTURE_DIR = join(REPO_ROOT, "tests", "fixtures", "agentic_eval");

export interface Cell {
  fixture: AgenticEvalFixture;
  harness: HarnessId;
  model: string;
  /** Stable cell id used to namespace the mock server. */
  cellId: string;
}

export interface CellRunReport {
  cell: Cell;
  result: CellResult;
  assertion: AssertionReport;
  snapshot: { ok: boolean; diff?: string; path: string };
  error?: Error;
}

export const ALL_HARNESSES: HarnessId[] = [
  "cursor-hooks",
  "claude-code-plugin",
  "codex-hooks",
  "opencode-plugin",
  "claude-agent-sdk-adapter",
];

export function makeAdapter(harness: HarnessId): HarnessAdapter {
  switch (harness) {
    case "cursor-hooks":
      return createCursorHooksAdapter();
    case "claude-code-plugin":
      return createClaudeCodeAdapter();
    case "codex-hooks":
      return createCodexHooksAdapter();
    case "opencode-plugin":
      return createOpencodePluginAdapter();
    case "claude-agent-sdk-adapter":
      return createClaudeAgentSdkAdapter();
  }
}

export function loadFixtures(filter?: string): AgenticEvalFixture[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(FIXTURE_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const fixtures: AgenticEvalFixture[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const full = join(FIXTURE_DIR, entry);
    const raw = readFileSync(full, "utf-8");
    let parsed: AgenticEvalFixture;
    try {
      parsed = JSON.parse(raw) as AgenticEvalFixture;
    } catch (err) {
      throw new Error(`Failed to parse fixture ${entry}: ${(err as Error).message}`);
    }
    if (!parsed.meta?.id) {
      throw new Error(`Fixture ${entry} missing meta.id`);
    }
    if (filter && !parsed.meta.id.includes(filter)) continue;
    fixtures.push(parsed);
  }
  fixtures.sort((a, b) => (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0));
  return fixtures;
}

export function expandMatrix(fixture: AgenticEvalFixture): Cell[] {
  const harnesses: HarnessId[] =
    fixture.meta.harnesses?.length > 0 ? fixture.meta.harnesses : ALL_HARNESSES;
  const models = fixture.meta.models?.length > 0 ? fixture.meta.models : ["composer-2"];
  const cells: Cell[] = [];
  for (const h of harnesses) {
    for (const m of models) {
      cells.push({
        fixture,
        harness: h,
        model: m,
        cellId: `${fixture.meta.id}__${h}__${m}`.replace(/[^a-zA-Z0-9._-]/g, "_"),
      });
    }
  }
  return cells;
}

function makeContext(cell: Cell, server: MockNeotomaServer): CellContext {
  const hookStateDir = mkdtempSync(join(tmpdir(), `neotoma-eval-${cell.cellId}-`));
  return {
    fixture: cell.fixture,
    harness: cell.harness,
    model: cell.model,
    sessionId: cell.cellId,
    turnId: "turn-1",
    baseUrl: server.cellBaseUrl(cell.cellId),
    token: "test-token",
    hookStateDir,
  };
}

export async function runCell(
  cell: Cell,
  server: MockNeotomaServer,
  adapter: HarnessAdapter
): Promise<CellRunReport> {
  const ctx = makeContext(cell, server);
  const events = cell.fixture.events.filter(
    (e) => !e.harnesses || e.harnesses.includes(cell.harness)
  );
  const result: CellResult = {
    context: ctx,
    capturedRequests: [],
    capturedOutputs: [],
    skippedEvents: [],
  };

  try {
    for (const event of events) {
      try {
        const out = await adapter.runEvent(event, ctx);
        if (out) {
          if (
            adapter.status === "stub" ||
            (out.exitCode == null && out.stderr.includes("stub"))
          ) {
            result.skippedEvents.push({
              hook: event.hook,
              reason: out.stderr || "stub adapter",
            });
          } else {
            result.capturedOutputs.push(out);
          }
        }
      } catch (err) {
        result.skippedEvents.push({
          hook: event.hook,
          reason: `adapter threw: ${(err as Error).message}`,
        });
      }
    }
    result.capturedRequests = server.takeCellRequests(cell.cellId);
  } finally {
    try {
      rmSync(ctx.hookStateDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  const assertion = evaluateCell(
    result,
    cell.fixture.assertions,
    cell.fixture.expected_outputs,
    cell.harness,
    cell.model
  );

  const serialized = serializeSnapshot(result.capturedRequests, result.capturedOutputs);
  const snap = compareOrUpdateSnapshot(
    cell.fixture.meta.id,
    cell.harness,
    cell.model,
    serialized
  );

  return {
    cell,
    result,
    assertion,
    snapshot: { ok: snap.ok, diff: snap.diff, path: snap.path },
  };
}

export function formatCellFailure(report: CellRunReport): string {
  const failures = [...report.assertion.failures];
  return renderFailureReport({
    context: report.result.context,
    failures,
    requests: report.result.capturedRequests,
    snapshotPath: report.snapshot.ok ? undefined : report.snapshot.path,
    snapshotDiff: report.snapshot.ok ? undefined : report.snapshot.diff,
  });
}

export function summarizeRun(reports: CellRunReport[]): string {
  const total = reports.length;
  const failed = reports.filter(
    (r) => r.assertion.failures.length > 0 || !r.snapshot.ok
  );
  const skipped = reports.filter(
    (r) => r.cell.fixture.meta.harnesses?.length === 0 || r.result.skippedEvents.length > 0
  );
  const lines: string[] = [];
  lines.push(`Tier 1 agentic-eval: ${total} cells, ${failed.length} failing, ${skipped.length} with skipped events.`);
  for (const f of failed) {
    lines.push(formatCellFailure(f));
  }
  return lines.join("\n");
}

export { snapshotPath, startMockNeotomaServer };
