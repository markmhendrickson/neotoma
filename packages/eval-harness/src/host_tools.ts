/**
 * Host-tool stubs for the Tier 2 eval harness.
 *
 * Drivers expose a small set of tools to the agent (Read, Grep, Write,
 * etc.) that, in production, would touch real disk or network. In the
 * harness those tools are deterministic stubs whose responses come from
 * the scenario YAML. This guarantees that across two runs of the same
 * cassette + scenario the agent observes byte-identical environments.
 *
 * The stub layer also tracks invocation counts so the assertion engine
 * can predicate on `host_tool.invocations`.
 */

import type { HostToolStub, HostToolStubResponse } from "./types.js";

export interface HostToolInvocation {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  matchedKey: string;
  sequence: number;
}

export interface HostToolRegistry {
  /** All declared stubs keyed by tool name. */
  stubs: Map<string, HostToolStub>;
  /** Ordered invocation log shared across drivers. */
  invocations: HostToolInvocation[];
  /** Per-tool counters for fast assertion queries. */
  counts: Map<string, number>;
  /** Run a single tool call against the registry, returning its result. */
  invoke(name: string, input: unknown): Promise<{ output?: unknown; error?: string }>;
}

function fingerprintInput(input: unknown): string {
  // Stable JSON for matching `responses` keys — sorts keys alphabetically.
  if (input == null) return "null";
  if (typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return JSON.stringify(input.map(fingerprintInput));
  const obj = input as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return JSON.stringify(sorted);
}

function pickResponse(
  stub: HostToolStub,
  fingerprint: string
): { matchedKey: string; response: HostToolStubResponse } {
  if (stub.responses?.[fingerprint]) {
    return { matchedKey: fingerprint, response: stub.responses[fingerprint] };
  }
  if (stub.default) {
    return { matchedKey: "<default>", response: stub.default };
  }
  return {
    matchedKey: "<missing>",
    response: {
      output: null,
      error: `host_tool[${stub.name}]: no canned response for input ${fingerprint}`,
    },
  };
}

export function createHostToolRegistry(stubs: HostToolStub[]): HostToolRegistry {
  const stubsByName = new Map<string, HostToolStub>();
  for (const stub of stubs) {
    if (stubsByName.has(stub.name)) {
      throw new Error(`duplicate host tool stub: ${stub.name}`);
    }
    stubsByName.set(stub.name, stub);
  }
  const invocations: HostToolInvocation[] = [];
  const counts = new Map<string, number>();

  return {
    stubs: stubsByName,
    invocations,
    counts,
    async invoke(name, input) {
      const stub = stubsByName.get(name);
      const sequence = invocations.length;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (!stub) {
        const error = `host_tool[${name}]: not declared in scenario.host_tools`;
        invocations.push({ name, input, error, matchedKey: "<unknown>", sequence });
        return { error };
      }
      const fingerprint = fingerprintInput(input);
      const { matchedKey, response } = pickResponse(stub, fingerprint);
      const record: HostToolInvocation = {
        name,
        input,
        output: response.output,
        error: response.error,
        matchedKey,
        sequence,
      };
      invocations.push(record);
      return { output: response.output, error: response.error };
    },
  };
}

/**
 * Default canned tool descriptions used by drivers when a stub does not
 * provide its own. Keeping these short keeps the prompt budget tight.
 */
export const DEFAULT_TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: "Read a UTF-8 file from the workspace and return its contents.",
  Grep: "Search the workspace for a regex pattern and return matching lines.",
  Write: "Write text content to a file in the workspace.",
  Glob: "Glob-match files in the workspace and return their paths.",
};

export function describeStub(stub: HostToolStub): string {
  return stub.description ?? DEFAULT_TOOL_DESCRIPTIONS[stub.name] ?? `Tool: ${stub.name}`;
}
