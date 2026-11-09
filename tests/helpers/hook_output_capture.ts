/**
 * Shared vector loader and assertions for the hook tool-capture policy.
 *
 * The policy (metadata-only for read-type tools, redacted bounded summaries
 * otherwise, nothing for secret-bearing paths) is duplicated across the hook
 * packages because they ship independently. Every copy is driven by the same
 * vectors in `tests/fixtures/hook_output_capture/vectors.json`, so they cannot
 * drift apart.
 */

import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
  /** Optional programmatic expansion of the input/output (limits that cannot be written inline). */
  expand?: {
    nest_depth?: number;
    leaf?: string;
    array_pad?: { key: string; count: number; value: string };
    long_string?: { key: string; length: number };
    output_long_string?: number;
  };
}

export interface InvocationShapeVector {
  name: string;
  tool_input: unknown;
  expect_shape: Record<string, unknown>;
  excludes: string[];
}

export interface CaptureVectors {
  secret_paths: { secret: string[]; not_secret: string[] };
  redaction: RedactionVector[];
  captures: CaptureVector[];
  invocation_shapes: InvocationShapeVector[];
}

/** Applies a vector's `expand` directive and returns the concrete input and output. */
export function expandVector(vector: CaptureVector): { toolInput: unknown; toolOutput: unknown } {
  let toolInput: unknown = structuredClone(vector.tool_input);
  let toolOutput: unknown = structuredClone(vector.tool_output);
  const e = vector.expand;
  if (!e) return { toolInput, toolOutput };
  const record = toolInput as Record<string, unknown>;
  if (e.nest_depth !== undefined) {
    let nested: unknown = e.leaf ?? "leaf";
    for (let i = 0; i < e.nest_depth; i += 1) nested = { a: nested };
    record.nested = nested;
  }
  if (e.array_pad) {
    record[e.array_pad.key] = Array.from({ length: e.array_pad.count }, () => e.array_pad!.value);
  }
  if (e.long_string) {
    record[e.long_string.key] = "x".repeat(e.long_string.length);
  }
  if (e.output_long_string !== undefined) {
    toolOutput = "x".repeat(e.output_long_string);
  }
  return { toolInput, toolOutput };
}

/** Builds the shared symlink fixture: a benign-looking name that resolves to a secret-bearing file. */
export function makeSymlinkFixture(root: string): { link: string; plain: string } {
  const real = join(root, "real");
  mkdirSync(real, { recursive: true });
  const secretFile = join(real, ".env.fixture");
  writeFileSync(secretFile, "FIXTURE-SECRET-BODY=1\n");
  const plainFile = join(root, "notes.txt");
  writeFileSync(plainFile, "plain\n");
  const link = join(root, "innocent.txt");
  symlinkSync(secretFile, link);
  return { link, plain: plainFile };
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
  // No content hash is stored for any call: an unsalted hash of output is a lookup oracle.
  expect(fields.output_sha256, `${label}: no output_sha256`).toBeUndefined();
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
