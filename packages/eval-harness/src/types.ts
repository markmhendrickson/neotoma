/**
 * Core types for the Tier 2 eval harness.
 */

export type ProviderId = "claude" | "openai" | "ollama" | "stub";

export type RunMode = "record" | "replay";

export type InstructionProfile = "full" | "compact" | "auto";

export interface ScenarioMeta {
  id: string;
  description: string;
  tags?: string[];
}

export interface HostToolStubResponse {
  /** When non-null, the stub returns this exact JSON to the agent. */
  output: unknown;
  /** Optional error to simulate (mutually exclusive with output). */
  error?: string;
}

export interface HostToolStub {
  /** Tool name as the agent will request it (e.g. "Read", "Grep"). */
  name: string;
  /**
   * Map keyed by a stable input fingerprint (typically `JSON.stringify(input)`)
   * to the canned output. The stub falls back to `default` when no input
   * matches.
   */
  responses?: Record<string, HostToolStubResponse>;
  default?: HostToolStubResponse;
  /** When provided, overrides the descriptive blurb the driver advertises. */
  description?: string;
}

export interface ModelEntry {
  /** Provider id (driver dispatch). */
  provider: ProviderId;
  /** Model id passed to the SDK (e.g. `claude-sonnet-4-5-20250929`, `gpt-5-mini`). */
  model: string;
  /** Optional override of the cassette filename suffix. Defaults to `<provider>__<model>`. */
  cassette_id?: string;
}

export interface ExpectedAssertion {
  /** Predicate type — one of the names below. */
  type:
    | "store_structured.calls"
    | "entity.exists"
    | "entity.count"
    | "observation.with_field"
    | "relationship.exists"
    | "relationship.count"
    | "reply_text.contains"
    | "turn_compliance.backfilled"
    | "instruction_profile.served"
    | "host_tool.invocations";
  /** Numeric comparison op for count-shaped predicates. */
  op?: "eq" | "gte" | "lte";
  value?: number | string | boolean;
  entity_type?: string;
  /**
   * Accept any of the listed entity types (semantic equivalents). Per
   * Neotoma's "Entity-type reuse check" rule, agents may legitimately
   * pick `person` or `contact` (etc.) for the same observation; this
   * lets a scenario assert the underlying intent without locking in a
   * single canonical type.
   */
  entity_type_any_of?: string[];
  where?: Record<string, unknown>;
  relationship_type?: string;
  /** Accept any of the listed relationship types (semantic equivalents). */
  relationship_type_any_of?: string[];
  source_entity_type?: string;
  target_entity_type?: string;
  field?: string;
  profile?: InstructionProfile;
  tool_name?: string;
  /** Substring to look for in `reply_text.contains`. */
  substring?: string;
  /** Regex pattern to match in `reply_text.contains`. */
  pattern?: string;
}

export type SeedStrategy = "generated" | "real_derived" | "hybrid_amplified";

export interface SeedEntity {
  entity_type: string;
  [key: string]: unknown;
}

export interface ScenarioFile {
  meta: ScenarioMeta;
  system_prompt?: string;
  user_prompt: string;
  /** Optional attachments (paths or inline content) for the user message. */
  attachments?: Array<{
    name: string;
    mime_type: string;
    /** Either inline base64 OR a path relative to the scenario file. */
    content_b64?: string;
    path?: string;
  }>;
  host_tools: HostToolStub[];
  models: ModelEntry[];
  /**
   * Whether the harness should enable the small-model compact instruction
   * profile. `auto` follows the driver's default (model-class detection).
   */
  instruction_profile?: InstructionProfile;
  /** Whether hooks are enabled in the isolated server (e.g. compliance backfill). */
  hooks_enabled?: boolean;
  /** Optional max-tokens / temperature / seed knobs passed to the driver. */
  driver_options?: {
    max_tokens?: number;
    temperature?: number;
    seed?: number;
  };
  /**
   * Hybrid scenario seeding — how the scenario was derived.
   * `generated` = purely synthetic, `real_derived` = from real transcript,
   * `hybrid_amplified` = pattern from real usage, anonymized and amplified.
   */
  seed_strategy?: SeedStrategy;
  /** Neotoma entity ID of the source transcript that inspired this scenario. */
  source_transcript_ref?: string;
  /** Human-readable description of the failure pattern extracted from the source. */
  source_pattern?: string;
  /** Description of how PII was transformed for the committed scenario. */
  privacy_transform?: string;
  /**
   * Entities to pre-seed into the isolated Neotoma DB before the driver
   * runs. Used for retrieval and dedup scenarios that need existing state.
   */
  seed_entities?: SeedEntity[];
  /**
   * Server fault injection — configures the isolated server to simulate
   * failures for error-recovery scenarios.
   */
  server_faults?: {
    /** Target MCP tool or HTTP endpoint to inject faults on. */
    target: string;
    /** Number of initial calls to fail before succeeding. */
    fail_first_n: number;
    /** HTTP status code to return for failures. Default 500. */
    status_code?: number;
  };
  expected: ExpectedAssertion[];
}

export interface DriverInvocation {
  scenario: ScenarioFile;
  model: ModelEntry;
  /** MCP base URL of the isolated Neotoma server (the agent registers it). */
  neotomaBaseUrl: string;
  neotomaToken: string;
  /** Effective profile after applying scenario.instruction_profile + model class. */
  effectiveProfile: InstructionProfile;
  /** Mode controls whether the driver hits the network or uses a cassette. */
  mode: RunMode;
  /** Cassette path (always set; record-mode writes here, replay reads). */
  cassettePath: string;
  /** Hard wall-clock cap to avoid hung runs. */
  timeoutMs?: number;
}

export interface ToolCall {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  /** Monotonic order across the run. */
  sequence: number;
}

export interface DriverResult {
  /** The final assistant text (post-tool-loop). */
  assistantText: string;
  /** Every tool call the agent issued, in order. */
  toolCalls: ToolCall[];
  /** Wall-clock duration. */
  elapsedMs: number;
  /** Approximate cost (USD) for live runs; 0 in replay. */
  estimatedCostUsd: number;
  /** Total prompt+completion tokens (sum) when reported by the SDK. */
  totalTokens?: number;
}

export interface LLMDriver {
  /** Stable id used for cassette filename + matrix labelling. */
  readonly id: ProviderId;
  /** Whether the driver is wired to a real SDK or runs replay-only. */
  readonly capabilities: {
    live: boolean;
    replay: boolean;
  };
  /** Sanity-check the environment before a live run (API key, SDK availability). */
  preflight(mode: RunMode): { ok: boolean; reason?: string };
  /** Run a single agent turn and return tool calls + final text. */
  runOnce(invocation: DriverInvocation): Promise<DriverResult>;
}

export interface AssertionFailure {
  predicate: ExpectedAssertion;
  message: string;
  expected: unknown;
  actual: unknown;
}

export interface CellReport {
  scenario: ScenarioMeta;
  model: ModelEntry;
  effectiveProfile: InstructionProfile;
  mode: RunMode;
  driverResult?: DriverResult;
  assertionFailures: AssertionFailure[];
  startedAt: string;
  endedAt: string;
  /** True when the cell ran without skip and assertions passed. */
  pass: boolean;
  /** Human-readable failure summary; empty when `pass`. */
  errorMessage?: string;
  /** Set when the cell was skipped (e.g. driver lacks live capability + no cassette). */
  skipped?: { reason: string };
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cells: CellReport[];
  /** Total estimated USD spent across live cells. */
  estimatedCostUsd: number;
  /** Mode the harness ran in (the highest-fidelity used; matrix may mix). */
  mode: RunMode;
}
