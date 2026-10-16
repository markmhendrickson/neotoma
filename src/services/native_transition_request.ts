/** Structural native wire validation; successful parsing grants no authority. */
import { z } from "zod";
import type { components } from "../shared/openapi_types.js";
import { NEOTOMA_ENTITY_ID_REGEX } from "../shared/neotoma_entity_id.js";
import { canonicalStoreRequest } from "./store_condition_keys.js";
import { NativeProjectionError, nativeSchemaReducerHash } from "./native_transition_projection.js";

export type NativeTransitionRequest = components["schemas"]["NativeTransitionRequest"];

const text = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0);
const id = z.string().regex(NEOTOMA_ENTITY_ID_REGEX);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const integer = z.number().refine(Number.isSafeInteger);
const step = text.refine((s) => Buffer.byteLength(s, "utf8") <= 256);
const names = z.array(text).refine((a) => a.every((s, i) => i === 0 || a[i - 1] < s));
const target = z
  .object({ entity_type: z.enum(["task", "batch"]), entity_id: id, step_name: step.nullable() })
  .strict()
  .refine((t) => (t.entity_type === "task" ? t.step_name === null : t.step_name !== null));
const subject = z.object({ entity_type: z.enum(["task", "action"]), entity_id: id }).strict();
const selector = z.union([
  z.object({ entity: z.object({ entity_id: id }).strict() }).strict(),
  z
    .object({
      edges: z.object({ entity_id: id, direction: z.literal("both"), types: names }).strict(),
    })
    .strict(),
  z
    .object({
      slot: z
        .object({
          target_type: z.enum(["task", "batch"]),
          target_id: id,
          step_name: step.nullable(),
        })
        .strict()
        .refine((s) => (s.target_type === "task" ? s.step_name === null : s.step_name !== null)),
    })
    .strict(),
  z
    .object({
      registry: z
        .object({ entity_types: names, relationship_types: names, reducer_versions: names })
        .strict(),
    })
    .strict(),
]);
const expected = z
  .object({
    recipe_version: z.literal("native-readset-v1"),
    schema_reducer_sha256: digest,
    groups: z
      .array(
        z.object({ selector, count: integer.refine((n) => n >= 0), rows_sha256: digest }).strict()
      )
      .min(1),
  })
  .strict();
const duration = integer.refine((n) => n > 0);
// The registered schema still owns the JSON-valued option/ref/finding domains.
// This parser neither declares their schemas nor defaults unknown authority.
const transition = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("checkpoint.raise"),
      subject,
      reason: text,
      needed_input: text,
      options: z.array(z.unknown()).min(1),
      awaited_roles: z
        .array(text)
        .min(1)
        .refine((a) => new Set(a).size === a.length),
    })
    .strict(),
  z
    .object({
      name: z.literal("checkpoint.resolve"),
      checkpoint_id: id,
      subject,
      decision: z.enum(["approved", "denied", "vetoed"]),
      self_resolved: z.boolean(),
      resolution_note: text,
    })
    .strict(),
  z
    .object({
      name: z.literal("lease.acquire"),
      target,
      runner_id: text,
      requested_duration_seconds: duration,
      pinned_agent_version: text,
      pinned_declaration_sha256: digest,
    })
    .strict(),
  z
    .object({
      name: z.literal("lease.renew"),
      target,
      runner_id: text,
      claim_observation_id: text,
      expected_lease_observation_id: text,
      requested_duration_seconds: duration,
    })
    .strict(),
  z
    .object({
      name: z.literal("lease.return"),
      target,
      runner_id: text,
      claim_observation_id: text,
      expected_lease_observation_id: text,
    })
    .strict(),
  z
    .object({
      name: z.literal("verdict.submit"),
      batch_id: id,
      step_name: step,
      claim_observation_id: text,
      runner_id: text,
      agent_version: text,
      declaration_sha256: digest,
      conclusion: z.enum(["signed", "blocked", "waived"]),
      artifact_refs: z.array(z.unknown()),
      read_refs: z.array(z.unknown()),
      findings: z.array(
        z
          .object({
            severity: z.unknown(),
            kind: z.unknown(),
            scope: z.unknown(),
            evidence: z.unknown(),
            text,
          })
          .strict()
      ),
      successor: z.unknown(),
    })
    .strict(),
]);
const request = z
  .object({
    protocol: z.literal("native-record-transition-v1"),
    idempotency_key: text.refine((s) => s.length <= 200),
    expected,
    transition,
  })
  .strict();

export function parseNativeTransitionRequest(input: unknown): NativeTransitionRequest {
  // Validate original descriptors/values before Zod can read or copy them.
  canonicalStoreRequest(input);
  const parsed = request.safeParse(input);
  if (!parsed.success) throw invalid();
  const body = parsed.data;
  const groups = body.expected.groups;
  const selectors = groups.map((g) => Buffer.from(canonicalStoreRequest(g.selector), "utf8"));
  if (selectors.some((s, i) => i > 0 && Buffer.compare(selectors[i - 1], s) >= 0)) throw invalid();
  const registry = groups.filter((g) => "registry" in g.selector);
  if (
    registry.length !== 1 ||
    body.expected.schema_reducer_sha256 !== nativeSchemaReducerHash(registry[0].rows_sha256)
  )
    throw invalid();
  // z.unknown() accepts absent object keys; wire requiredness must not do so.
  const original = input as Record<string, unknown>;
  const fields = original.transition as Record<string, unknown>;
  if (
    body.transition.name === "verdict.submit" &&
    (!Object.hasOwn(fields, "successor") ||
      body.transition.findings.some((f) =>
        ["severity", "kind", "scope", "evidence"].some((key) => !Object.hasOwn(f, key))
      ))
  )
    throw invalid();
  return body as NativeTransitionRequest;
}

function invalid(): NativeProjectionError {
  return new NativeProjectionError("VALIDATION_ERROR", "Invalid native transition request.");
}
