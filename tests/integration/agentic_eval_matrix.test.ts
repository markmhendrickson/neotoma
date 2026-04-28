/**
 * Tier 1 agentic-eval matrix integration test.
 *
 * Discovers every fixture under `tests/fixtures/agentic_eval/*.json`,
 * expands `harness × model` per fixture, and emits one vitest `it()`
 * per cell. Each cell runs against a shared per-suite mock
 * NeotomaServer with hard per-cell namespacing (`/cell/<cellId>/...`).
 *
 * Set `UPDATE_AGENTIC_EVAL_SNAPSHOTS=1` to regenerate snapshot files.
 * Set `NEOTOMA_AGENTIC_EVAL_FILTER=<scenario_substring>` to limit to
 * one fixture during local dev.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_HARNESSES,
  expandMatrix,
  formatCellFailure,
  loadFixtures,
  makeAdapter,
  runCell,
  startMockNeotomaServer,
  type Cell,
} from "../helpers/agentic_eval/runner.js";
import type { MockNeotomaServer } from "../helpers/agentic_eval/mock_neotoma_server.js";
import type { HarnessAdapter } from "../helpers/agentic_eval/types.js";

const filter = process.env.NEOTOMA_AGENTIC_EVAL_FILTER ?? undefined;
const fixtures = loadFixtures(filter);

let server: MockNeotomaServer | null = null;
const adapterCache = new Map<string, HarnessAdapter>();
const adapterPreflightErrors = new Map<string, string>();

function getAdapter(cell: Cell): HarnessAdapter {
  let adapter = adapterCache.get(cell.harness);
  if (!adapter) {
    adapter = makeAdapter(cell.harness);
    if (adapter.preflight) {
      try {
        adapter.preflight();
      } catch (err) {
        adapterPreflightErrors.set(cell.harness, (err as Error).message);
      }
    }
    adapterCache.set(cell.harness, adapter);
  }
  return adapter;
}

describe("agentic-eval (Tier 1) matrix", () => {
  beforeAll(async () => {
    server = await startMockNeotomaServer();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  if (fixtures.length === 0) {
    it("has at least one fixture", () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });
    return;
  }

  for (const fixture of fixtures) {
    const cells = expandMatrix(fixture);
    describe(`${fixture.meta.id} — ${fixture.meta.description}`, () => {
      for (const cell of cells) {
        const cellName = `${cell.harness} × ${cell.model}`;
        const preflightError = (() => {
          // Eagerly load the adapter so we know whether to skip.
          const adapter = getAdapter(cell);
          if (adapter.status === "stub") {
            return `stub adapter for ${cell.harness} (Phase 1)`;
          }
          return adapterPreflightErrors.get(cell.harness);
        })();

        if (preflightError) {
          it.skip(`${cellName} (skipped: ${preflightError})`, () => {});
          continue;
        }

        it(cellName, async () => {
          if (!server) throw new Error("mock server not started");
          const adapter = getAdapter(cell);
          const report = await runCell(cell, server, adapter);
          if (report.assertion.failures.length > 0 || !report.snapshot.ok) {
            const message = formatCellFailure(report);
            // Throw with the focused failure message; vitest renders it as-is.
            throw new Error(message);
          }
        });
      }
    });
  }
});
