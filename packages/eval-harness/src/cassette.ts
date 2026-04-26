/**
 * Cassette format for the Tier 2 eval harness.
 *
 * A cassette is a JSON file that captures one full agent turn — the
 * scripted user prompt, the tool calls (with inputs the driver fed back
 * as outputs), the assistant's final reply, and a metadata block that
 * lets us detect drift (provider/model + recording date).
 *
 * In `replay` mode the driver consumes the cassette without ever
 * touching the network. In `record` mode the driver writes a fresh
 * cassette overwriting any existing file.
 *
 * The on-disk shape is a stable, hand-readable JSON document so PR
 * reviewers can see what the recorded LLM actually said.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { DriverResult, ProviderId, ToolCall } from "./types.js";

export const CASSETTE_FORMAT_VERSION = 1;

export interface CassetteMeta {
  format_version: number;
  scenario_id: string;
  provider: ProviderId;
  model: string;
  instruction_profile: string;
  recorded_at: string;
  /** Approx tokens reported by SDK at record time (informational). */
  total_tokens?: number;
  /** Approximate USD cost the recording incurred. */
  cost_usd?: number;
}

export interface CassetteFile {
  meta: CassetteMeta;
  user_prompt: string;
  system_prompt?: string;
  tool_calls: ToolCall[];
  assistant_text: string;
}

export interface ReadCassetteResult {
  cassette: CassetteFile;
  /** Days elapsed since `recorded_at`. -1 when the date cannot be parsed. */
  ageDays: number;
}

export function cassetteFilename(
  scenarioId: string,
  provider: ProviderId,
  model: string,
  cassetteId?: string
): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  const suffix = cassetteId ? safe(cassetteId) : `${safe(provider)}__${safe(model)}`;
  return `${safe(scenarioId)}__${suffix}.cassette.json`;
}

export function readCassette(path: string): ReadCassetteResult | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  let parsed: CassetteFile;
  try {
    parsed = JSON.parse(raw) as CassetteFile;
  } catch (err) {
    throw new Error(`failed to parse cassette ${path}: ${(err as Error).message}`);
  }
  if (parsed.meta?.format_version !== CASSETTE_FORMAT_VERSION) {
    throw new Error(
      `cassette ${path} format_version ${parsed.meta?.format_version ?? "unknown"} not supported (expected ${CASSETTE_FORMAT_VERSION}). Re-record with --mode=record.`
    );
  }
  let ageDays = -1;
  if (parsed.meta.recorded_at) {
    const recorded = Date.parse(parsed.meta.recorded_at);
    if (Number.isFinite(recorded)) {
      ageDays = Math.floor((Date.now() - recorded) / (24 * 60 * 60 * 1000));
    }
  }
  return { cassette: parsed, ageDays };
}

export function writeCassette(path: string, cassette: CassetteFile): void {
  mkdirSync(dirname(path), { recursive: true });
  // Stable indent so PR diffs render cleanly.
  writeFileSync(path, JSON.stringify(cassette, null, 2) + "\n", "utf-8");
}

export function buildCassetteFromResult(
  scenarioId: string,
  provider: ProviderId,
  model: string,
  instructionProfile: string,
  userPrompt: string,
  systemPrompt: string | undefined,
  result: DriverResult
): CassetteFile {
  return {
    meta: {
      format_version: CASSETTE_FORMAT_VERSION,
      scenario_id: scenarioId,
      provider,
      model,
      instruction_profile: instructionProfile,
      recorded_at: new Date().toISOString(),
      total_tokens: result.totalTokens,
      cost_usd: result.estimatedCostUsd,
    },
    user_prompt: userPrompt,
    system_prompt: systemPrompt,
    tool_calls: result.toolCalls,
    assistant_text: result.assistantText,
  };
}

/**
 * Configurable threshold above which the runner emits a warning that
 * a replayed cassette is older than the operator probably expects.
 */
export const DEFAULT_STALENESS_THRESHOLD_DAYS = 30;

export function staleness(ageDays: number, threshold = DEFAULT_STALENESS_THRESHOLD_DAYS): "fresh" | "stale" | "unknown" {
  if (ageDays < 0) return "unknown";
  if (ageDays > threshold) return "stale";
  return "fresh";
}
