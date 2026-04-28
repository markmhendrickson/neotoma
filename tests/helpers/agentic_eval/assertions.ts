/**
 * Assertion engine for the Tier 1 agentic-eval runner.
 *
 * Each predicate compiles to a function that takes the captured request
 * log + hook outputs for a single cell and returns a structured pass/
 * fail report. Failures carry a focused `expected vs actual` message so
 * the failure renderer can surface "did not store conversation_message"
 * rather than dumping the whole DB.
 */

import type {
  AssertionPredicate,
  CapturedHookOutput,
  CapturedRequest,
  CellResult,
  ExpectedOutputPredicate,
  ExpectedOutputsByHook,
  FixtureAssertions,
  FixtureExpectedOutputs,
  HarnessId,
} from "./types.js";

function isStructuredExpectedOutputs(
  raw: ExpectedOutputsByHook | FixtureExpectedOutputs | undefined
): raw is FixtureExpectedOutputs {
  if (!raw) return false;
  return (
    Object.prototype.hasOwnProperty.call(raw, "default") ||
    Object.prototype.hasOwnProperty.call(raw, "by_model") ||
    Object.prototype.hasOwnProperty.call(raw, "by_harness")
  );
}

function resolveExpectedOutputs(
  raw: ExpectedOutputsByHook | FixtureExpectedOutputs | undefined,
  harness: HarnessId,
  model: string
): ExpectedOutputsByHook {
  if (!raw) return {};
  if (!isStructuredExpectedOutputs(raw)) {
    return raw;
  }
  const merged: ExpectedOutputsByHook = {};
  const sources: ExpectedOutputsByHook[] = [];
  if (raw.default) sources.push(raw.default);
  if (raw.by_model?.[model]) sources.push(raw.by_model[model]);
  if (raw.by_harness?.[harness]) sources.push(raw.by_harness[harness] as ExpectedOutputsByHook);
  for (const src of sources) {
    for (const [hook, list] of Object.entries(src)) {
      const hookName = hook as keyof ExpectedOutputsByHook;
      const existing = merged[hookName] ?? [];
      merged[hookName] = [...existing, ...(list ?? [])];
    }
  }
  return merged;
}

export interface AssertionFailure {
  predicate: AssertionPredicate | { type: "expected_output"; hook: string; predicate: ExpectedOutputPredicate };
  message: string;
  expected: unknown;
  actual: unknown;
}

export interface AssertionReport {
  passes: number;
  failures: AssertionFailure[];
  totalPredicates: number;
}

function getRequests(
  cell: CellResult,
  endpoint: string
): CapturedRequest[] {
  if (endpoint === "/store") {
    return cell.capturedRequests.filter(
      (r) => r.endpoint === "/store" || r.endpoint === "/store_structured"
    );
  }
  return cell.capturedRequests.filter((r) => r.endpoint === endpoint);
}

function getStoredEntities(cell: CellResult): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const req of getRequests(cell, "/store")) {
    const entities = (req.body as { entities?: Array<Record<string, unknown>> } | null)?.entities;
    if (Array.isArray(entities)) {
      for (const e of entities) out.push(e);
    }
  }
  return out;
}

function getStoredRelationships(
  cell: CellResult
): Array<Record<string, unknown>> {
  return getRequests(cell, "/create_relationship").map(
    (r) => (r.body as Record<string, unknown>) ?? {}
  );
}

function getEntityById(
  cell: CellResult,
  id: string | undefined
): Record<string, unknown> | undefined {
  if (!id) return undefined;
  // The mock returns synthetic ids in order; we don't track ids forward
  // through the hooks, so callers should match by entity_type + fields
  // rather than id. Provided here for completeness.
  void id;
  return undefined;
}

function whereMatches(
  entity: Record<string, unknown>,
  where: Record<string, unknown> | undefined
): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (entity[key] !== expected) return false;
  }
  return true;
}

function compareNumber(
  actual: number,
  op: "eq" | "gte" | "lte",
  expected: number
): boolean {
  if (op === "eq") return actual === expected;
  if (op === "gte") return actual >= expected;
  if (op === "lte") return actual <= expected;
  return false;
}

function dotPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split(".");
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function evaluatePredicate(
  predicate: AssertionPredicate,
  cell: CellResult
): AssertionFailure | null {
  switch (predicate.type) {
    case "request_count": {
      const count = getRequests(cell, predicate.endpoint).length;
      if (compareNumber(count, predicate.op, predicate.value)) return null;
      return {
        predicate,
        message: `Expected ${predicate.endpoint} request count ${predicate.op} ${predicate.value}, got ${count}.`,
        expected: { op: predicate.op, value: predicate.value, endpoint: predicate.endpoint },
        actual: count,
      };
    }
    case "entity_stored": {
      const entities = getStoredEntities(cell);
      const matches = entities.filter(
        (e) =>
          e.entity_type === predicate.entity_type &&
          whereMatches(e, predicate.where)
      );
      if (matches.length > 0) return null;
      return {
        predicate,
        message: `Expected at least one stored entity of type "${predicate.entity_type}"${
          predicate.where ? ` matching ${JSON.stringify(predicate.where)}` : ""
        }, found ${entities
          .map((e) => e.entity_type)
          .filter((t, i, a) => a.indexOf(t) === i)
          .join(", ") || "none"}.`,
        expected: predicate,
        actual: entities.map((e) => ({
          entity_type: e.entity_type,
          ...(e.role ? { role: e.role } : {}),
          ...(e.canonical_name ? { canonical_name: e.canonical_name } : {}),
        })),
      };
    }
    case "relationship_stored": {
      const rels = getStoredRelationships(cell);
      const found = rels.find((r) => r.relationship_type === predicate.relationship_type);
      if (found) return null;
      return {
        predicate,
        message: `Expected at least one ${predicate.relationship_type} relationship to be stored, got ${rels.length} relationships of type(s) [${rels
          .map((r) => r.relationship_type)
          .filter((t, i, a) => a.indexOf(t) === i)
          .join(", ")}].`,
        expected: predicate,
        actual: rels,
      };
    }
    case "turn_compliance": {
      // The compliance signal is emitted by the stop hook either as a
      // standalone `turn_compliance` entity (newer harnesses) or as an
      // update on the `conversation_turn` row that carries `status` +
      // `missed_steps` fields (cursor-hooks today). Both shapes count.
      const turnComp = getStoredEntities(cell).find((e) => {
        if (e.entity_type === "turn_compliance") return true;
        if (e.entity_type === "conversation_turn" && typeof e.status === "string") {
          return true;
        }
        return false;
      });
      if (predicate.status === "absent") {
        if (!turnComp) return null;
        return {
          predicate,
          message: "Expected NO turn_compliance observation, but the stop hook emitted one.",
          expected: "absent",
          actual: turnComp,
        };
      }
      if (!turnComp) {
        return {
          predicate,
          message: `Expected a turn_compliance observation with status="${predicate.status}", got none.`,
          expected: predicate,
          actual: null,
        };
      }
      if (turnComp.status !== predicate.status) {
        return {
          predicate,
          message: `Expected turn_compliance.status="${predicate.status}", got "${turnComp.status}".`,
          expected: predicate.status,
          actual: turnComp.status,
        };
      }
      if (predicate.missed_includes?.length) {
        const missed = (turnComp.missed_steps as string[] | undefined) ?? [];
        const missing = predicate.missed_includes.filter((s) => !missed.includes(s));
        if (missing.length > 0) {
          return {
            predicate,
            message: `Expected turn_compliance.missed_steps to include ${JSON.stringify(predicate.missed_includes)}, missing ${JSON.stringify(missing)}.`,
            expected: predicate.missed_includes,
            actual: missed,
          };
        }
      }
      return null;
    }
    case "request_field_eq": {
      const requests = getRequests(cell, predicate.endpoint);
      if (requests.length === 0) {
        return {
          predicate,
          message: `Expected at least one request to ${predicate.endpoint} with ${predicate.path}=${JSON.stringify(predicate.value)}, got zero requests.`,
          expected: predicate,
          actual: null,
        };
      }
      const last = requests[requests.length - 1];
      const actual = dotPath(last.body, predicate.path);
      if (actual === predicate.value) return null;
      return {
        predicate,
        message: `Expected ${predicate.endpoint} body.${predicate.path}=${JSON.stringify(predicate.value)}, got ${JSON.stringify(actual)}.`,
        expected: predicate.value,
        actual,
      };
    }
    case "no_writes": {
      const stores = getRequests(cell, "/store").length;
      const rels = getRequests(cell, "/create_relationship").length;
      if (stores === 0 && rels === 0) return null;
      return {
        predicate,
        message: `Expected zero writes, got ${stores} /store + ${rels} /create_relationship calls.`,
        expected: 0,
        actual: { stores, relationships: rels },
      };
    }
    case "turn_diagnosis": {
      const turnEntity = getStoredEntities(cell).find(
        (e) => e.entity_type === "conversation_turn" && e.instruction_diagnostics
      );
      if (!turnEntity) {
        return {
          predicate,
          message: "Expected a conversation_turn entity with instruction_diagnostics, found none.",
          expected: predicate,
          actual: null,
        };
      }
      const diag = turnEntity.instruction_diagnostics as Record<string, unknown> | undefined;
      if (predicate.classification && diag?.classification !== predicate.classification) {
        return {
          predicate,
          message: `Expected instruction_diagnostics.classification="${predicate.classification}", got "${diag?.classification}".`,
          expected: predicate.classification,
          actual: diag?.classification,
        };
      }
      const actualConfidence = turnEntity.diagnosis_confidence ?? diag?.confidence;
      if (predicate.confidence && actualConfidence !== predicate.confidence) {
        return {
          predicate,
          message: `Expected diagnosis_confidence="${predicate.confidence}", got "${actualConfidence}".`,
          expected: predicate.confidence,
          actual: actualConfidence,
        };
      }
      if (predicate.reminder_injected !== undefined) {
        const actual = turnEntity.reminder_injected === true;
        if (actual !== predicate.reminder_injected) {
          return {
            predicate,
            message: `Expected reminder_injected=${predicate.reminder_injected}, got ${actual}.`,
            expected: predicate.reminder_injected,
            actual,
          };
        }
      }
      if (predicate.recommends_includes) {
        const repairs = turnEntity.recommended_repairs as string[] | undefined;
        const repairsStr = Array.isArray(repairs) ? repairs.join(" ") : "";
        if (!repairsStr.includes(predicate.recommends_includes)) {
          return {
            predicate,
            message: `Expected recommended_repairs to include "${predicate.recommends_includes}", got ${JSON.stringify(repairs)}.`,
            expected: predicate.recommends_includes,
            actual: repairs,
          };
        }
      }
      return null;
    }
  }
  return null;
}

function evaluateExpectedOutput(
  hook: string,
  predicate: ExpectedOutputPredicate,
  outputs: CapturedHookOutput[]
): AssertionFailure | null {
  const matchingOutputs = outputs.filter((o) => o.hook === hook);
  if (matchingOutputs.length === 0) {
    if (predicate.presence === "absent") return null;
    return {
      predicate: { type: "expected_output", hook, predicate },
      message: `Expected hook "${hook}" to produce output but it was never invoked or produced none.`,
      expected: predicate,
      actual: null,
    };
  }
  // Use the most recent output for the hook (relevant for stop hooks that may run once).
  const out = matchingOutputs[matchingOutputs.length - 1];
  const value = out.output[predicate.field];
  const present = value !== undefined && value !== null && value !== "";
  if (predicate.presence === "absent") {
    if (!present) return null;
    return {
      predicate: { type: "expected_output", hook, predicate },
      message: `Expected hook "${hook}" output.${predicate.field} to be absent, got ${JSON.stringify(value)}.`,
      expected: "absent",
      actual: value,
    };
  }
  if (predicate.presence === "present" || predicate.matches) {
    if (!present) {
      return {
        predicate: { type: "expected_output", hook, predicate },
        message: `Expected hook "${hook}" output.${predicate.field} to be present, got ${JSON.stringify(value)}.`,
        expected: "present",
        actual: value,
      };
    }
  }
  if (predicate.matches) {
    const re = new RegExp(predicate.matches);
    if (typeof value !== "string" || !re.test(value)) {
      return {
        predicate: { type: "expected_output", hook, predicate },
        message: `Expected hook "${hook}" output.${predicate.field} to match /${predicate.matches}/, got ${JSON.stringify(value)}.`,
        expected: predicate.matches,
        actual: value,
      };
    }
  }
  return null;
}

export function evaluateCell(
  cell: CellResult,
  assertions: FixtureAssertions,
  expectedOutputs:
    | ExpectedOutputsByHook
    | FixtureExpectedOutputs
    | undefined,
  harness: HarnessId,
  model: string
): AssertionReport {
  const predicates: AssertionPredicate[] = [];
  for (const p of assertions.default ?? []) predicates.push(p);
  for (const p of assertions.by_model?.[model] ?? []) predicates.push(p);
  for (const p of assertions.by_harness?.[harness] ?? []) predicates.push(p);

  const failures: AssertionFailure[] = [];
  let passes = 0;
  for (const p of predicates) {
    const fail = evaluatePredicate(p, cell);
    if (fail) failures.push(fail);
    else passes++;
  }

  const resolvedOutputs = resolveExpectedOutputs(expectedOutputs, harness, model);
  let totalExpected = 0;
  for (const [hook, list] of Object.entries(resolvedOutputs)) {
    for (const ep of list ?? []) {
      totalExpected++;
      const fail = evaluateExpectedOutput(hook, ep, cell.capturedOutputs);
      if (fail) failures.push(fail);
      else passes++;
    }
  }
  return {
    passes,
    failures,
    totalPredicates: predicates.length + totalExpected,
  };
}

export { getRequests, getStoredEntities, getStoredRelationships, getEntityById };
