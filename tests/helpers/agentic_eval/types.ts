/**
 * Type definitions for the Tier 1 agentic-eval fixture format.
 * See docs/developer/agentic_eval_fixture_format.md for the spec.
 */

export type CanonicalHook =
  | "sessionStart"
  | "beforeSubmitPrompt"
  | "postToolUse"
  | "postToolUseFailure"
  | "stop";

export type HarnessId =
  | "cursor-hooks"
  | "claude-code-plugin"
  | "codex-hooks"
  | "opencode-plugin"
  | "claude-agent-sdk-adapter";

export interface FixtureEvent {
  hook: CanonicalHook;
  payload: Record<string, unknown>;
  /** Restrict this event to specific harnesses. Default: all in meta.harnesses. */
  harnesses?: HarnessId[];
}

export type AssertionPredicate =
  | {
      type: "request_count";
      endpoint: string;
      op: "eq" | "gte" | "lte";
      value: number;
    }
  | {
      type: "entity_stored";
      entity_type: string;
      where?: Record<string, unknown>;
    }
  | {
      type: "relationship_stored";
      relationship_type: string;
      source_entity_type?: string;
      target_entity_type?: string;
    }
  | {
      type: "turn_compliance";
      status: "backfilled_by_hook" | "absent";
      missed_includes?: string[];
    }
  | {
      type: "request_field_eq";
      endpoint: string;
      path: string;
      value: unknown;
    }
  | { type: "no_writes" }
  | {
      type: "turn_diagnosis";
      classification?: string;
      confidence?: string;
      local_build?: boolean;
      reminder_injected?: boolean;
      recommends_includes?: string;
    };

export interface FixtureAssertions {
  default?: AssertionPredicate[];
  by_model?: Record<string, AssertionPredicate[]>;
  by_harness?: Partial<Record<HarnessId, AssertionPredicate[]>>;
}

export interface ExpectedOutputPredicate {
  field: string;
  presence?: "present" | "absent";
  matches?: string;
}

export interface FixtureMeta {
  id: string;
  description: string;
  harnesses: HarnessId[];
  models: string[];
  tags?: string[];
}

export type ExpectedOutputsByHook = Partial<Record<CanonicalHook, ExpectedOutputPredicate[]>>;

export interface FixtureExpectedOutputs {
  default?: ExpectedOutputsByHook;
  by_model?: Record<string, ExpectedOutputsByHook>;
  by_harness?: Partial<Record<HarnessId, ExpectedOutputsByHook>>;
}

export interface AgenticEvalFixture {
  meta: FixtureMeta;
  events: FixtureEvent[];
  assertions: FixtureAssertions;
  /**
   * Either the legacy flat shape (`{ stop: [...] }`) or the structured
   * shape (`{ default: { stop: [...] }, by_model: { ... } }`). The
   * runner accepts both.
   */
  expected_outputs?: ExpectedOutputsByHook | FixtureExpectedOutputs;
}

/**
 * Captured HTTP request from a hook to the mock Neotoma server.
 * Recorded payloads are normalized: arrays sorted, ids redacted.
 */
export interface CapturedRequest {
  method: string;
  endpoint: string;
  body: unknown;
  /** Wall-clock-style monotonic counter so request order is comparable across cells. */
  sequence: number;
}

/**
 * Captured stdout JSON from a hook script (where applicable).
 */
export interface CapturedHookOutput {
  hook: CanonicalHook;
  output: Record<string, unknown>;
  stderr: string;
  exitCode: number | null;
}

export interface CellContext {
  fixture: AgenticEvalFixture;
  harness: HarnessId;
  model: string;
  /** Injected by the runner; deterministic per fixture cell. */
  sessionId: string;
  /** Monotonic counter shared across the cell so events line up in stable order. */
  turnId: string;
  /**
   * Mock-server base URL the harness should hit. Includes a per-cell path
   * prefix so isolation across cells is hard-isolated even though the
   * server is shared.
   */
  baseUrl: string;
  /** Bearer token for the mock server. Always "test-token" for Tier 1. */
  token: string;
  /** Tmp directory for hook-state files (NEOTOMA_HOOK_STATE_DIR). */
  hookStateDir: string;
}

export interface CellResult {
  context: CellContext;
  capturedRequests: CapturedRequest[];
  capturedOutputs: CapturedHookOutput[];
  /** Adapter-emitted skips (e.g. unsupported event for this harness). */
  skippedEvents: Array<{ hook: CanonicalHook; reason: string }>;
}

/**
 * A per-harness adapter knows how to drive a single harness's hook
 * scripts using the canonical event sequence in a fixture.
 */
export interface HarnessAdapter {
  readonly id: HarnessId;
  /** Whether this adapter is fully implemented or a Phase 1 stub. */
  readonly status: "implemented" | "stub";
  /**
   * Execute a single canonical event against this harness. Adapters
   * MUST return without throwing: failures are reported via the
   * captured request log + stderr.
   */
  runEvent(
    event: FixtureEvent,
    ctx: CellContext
  ): Promise<CapturedHookOutput | null>;
  /** Optional pre-cell setup (build artifacts, etc.). */
  preflight?(): Promise<void> | void;
}
