/**
 * Shared vector loader and assertions for the hook tool-capture policy.
 *
 * The policy (metadata-only for read-type tools, redacted bounded summaries
 * otherwise, nothing for secret-bearing paths) is duplicated across the hook
 * packages because they ship independently. Every copy is driven by the same
 * vectors in `tests/fixtures/hook_output_capture/vectors.json`, so they cannot
 * drift apart.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS_PATH = join(HERE, "..", "fixtures", "hook_output_capture", "vectors.json");

export interface RedactionVector {
  name: string;
  input: string;
  contains: string[];
  excludes: string[];
}

export interface CaptureExpectation {
  output_capture?: string;
  input_capture?: string;
  output_summary_contains?: string[];
  output_summary_excludes?: string[];
  input_summary_contains?: string[];
  input_summary_excludes?: string[];
  has_output_sha256?: boolean;
  output_bytes?: number;
  output_summary_max_length?: number;
  output_summary_suffix?: string;
  target_path?: string;
}

export interface CaptureVector {
  name: string;
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
  expect: CaptureExpectation;
}

export interface CaptureVectors {
  secret_paths: { secret: string[]; not_secret: string[] };
  redaction: RedactionVector[];
  captures: CaptureVector[];
}

export function loadCaptureVectors(): CaptureVectors {
  return JSON.parse(readFileSync(VECTORS_PATH, "utf8")) as CaptureVectors;
}

/** The record fields a hook persisted for one tool call. */
export type CapturedFields = Record<string, unknown>;

export function expectRedaction(vector: RedactionVector, redacted: string): void {
  for (const needle of vector.contains) {
    expect(redacted, `${vector.name}: should contain ${needle}`).toContain(needle);
  }
  for (const needle of vector.excludes) {
    expect(redacted, `${vector.name}: should not contain ${needle}`).not.toContain(needle);
  }
}

export function expectCapture(vector: CaptureVector, fields: CapturedFields): void {
  const e = vector.expect;
  const label = vector.name;
  const outputSummary = String(fields.output_summary ?? "");
  const inputSummary = String(fields.input_summary ?? "");

  // Backward-compatible record shape: both summaries stay strings.
  expect(typeof fields.output_summary, `${label}: output_summary stays a string`).toBe("string");
  expect(typeof fields.input_summary, `${label}: input_summary stays a string`).toBe("string");

  if (e.output_capture !== undefined) {
    expect(fields.output_capture, `${label}: output_capture`).toBe(e.output_capture);
  }
  if (e.input_capture !== undefined) {
    expect(fields.input_capture, `${label}: input_capture`).toBe(e.input_capture);
  }
  for (const needle of e.output_summary_contains ?? []) {
    expect(outputSummary, `${label}: output_summary should contain ${needle}`).toContain(needle);
  }
  for (const needle of e.output_summary_excludes ?? []) {
    expect(outputSummary, `${label}: output_summary should not contain ${needle}`).not.toContain(
      needle
    );
  }
  for (const needle of e.input_summary_contains ?? []) {
    expect(inputSummary, `${label}: input_summary should contain ${needle}`).toContain(needle);
  }
  for (const needle of e.input_summary_excludes ?? []) {
    expect(inputSummary, `${label}: input_summary should not contain ${needle}`).not.toContain(
      needle
    );
  }
  if (e.has_output_sha256 !== undefined) {
    if (e.has_output_sha256) {
      expect(fields.output_sha256, `${label}: output_sha256`).toMatch(/^[0-9a-f]{64}$/);
    } else {
      expect(fields.output_sha256, `${label}: no output_sha256`).toBeUndefined();
    }
  }
  if (e.output_bytes !== undefined) {
    expect(fields.output_bytes, `${label}: output_bytes`).toBe(e.output_bytes);
  } else {
    expect(typeof fields.output_bytes, `${label}: output_bytes is a number`).toBe("number");
  }
  if (e.output_summary_max_length !== undefined) {
    expect(outputSummary.length, `${label}: output_summary length`).toBeLessThanOrEqual(
      e.output_summary_max_length
    );
  }
  if (e.output_summary_suffix !== undefined) {
    expect(outputSummary.endsWith(e.output_summary_suffix), `${label}: suffix`).toBe(true);
  }
  if (e.target_path !== undefined) {
    expect(fields.target_path, `${label}: target_path`).toBe(e.target_path);
  }
}
