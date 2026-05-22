/**
 * Shared driver primitives.
 *
 * Both Claude and OpenAI drivers route through the same replay path so
 * that cassette-driven cells produce byte-identical post-turn Neotoma
 * state regardless of which provider recorded the cassette. This keeps
 * the assertion engine deterministic in CI.
 */

import { readCassette, type CassetteFile } from "../cassette.js";
import { createHostToolRegistry, type HostToolRegistry } from "../host_tools.js";
import type {
  DriverInvocation,
  DriverResult,
  ToolCall,
} from "../types.js";

/**
 * MCP tool names that, when emitted by the agent in a cassette, should
 * be re-applied against the isolated Neotoma server during replay so
 * that post-turn graph state is reproduced.
 */
export const NEOTOMA_TOOL_NAMES = new Set<string>([
  "store",
  "store_structured",
  "retrieve_entities",
  "retrieve_entity_by_identifier",
  "create_relationship",
  "correct",
  "get_session_identity",
]);

/** Map MCP tool name → HTTP endpoint we POST to on the isolated server. */
const TOOL_ENDPOINTS: Record<string, string> = {
  store: "/store",
  store_structured: "/store",
  retrieve_entities: "/retrieve_entities",
  retrieve_entity_by_identifier: "/retrieve_entity_by_identifier",
  create_relationship: "/create_relationship",
  correct: "/correct",
  get_session_identity: "/session",
};

async function postNeotomaTool(
  baseUrl: string,
  toolName: string,
  input: unknown,
  token: string
): Promise<{ output?: unknown; error?: string }> {
  const path = TOOL_ENDPOINTS[toolName];
  if (!path) return { error: `unknown Neotoma tool ${toolName}` };
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: toolName === "get_session_identity" ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: toolName === "get_session_identity" ? undefined : JSON.stringify(input ?? {}),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave as text
    }
    if (!res.ok) {
      return { error: `${toolName} returned status ${res.status}: ${text.slice(0, 400)}` };
    }
    return { output: parsed };
  } catch (err) {
    return { error: `${toolName} failed: ${(err as Error).message}` };
  }
}

export async function replayCassetteAgainstServer(
  invocation: DriverInvocation,
  cassette: CassetteFile,
  registry: HostToolRegistry
): Promise<DriverResult> {
  const start = Date.now();
  const replayedCalls: ToolCall[] = [];
  for (const call of cassette.tool_calls) {
    let result: { output?: unknown; error?: string };
    if (NEOTOMA_TOOL_NAMES.has(call.name)) {
      result = await postNeotomaTool(
        invocation.neotomaBaseUrl,
        call.name,
        call.input,
        invocation.neotomaToken
      );
    } else {
      // Host tools are deterministic stubs by definition.
      result = await registry.invoke(call.name, call.input);
    }
    replayedCalls.push({
      name: call.name,
      input: call.input,
      output: result.output ?? call.output,
      error: result.error ?? call.error,
      sequence: replayedCalls.length,
    });
  }
  return {
    assistantText: cassette.assistant_text,
    toolCalls: replayedCalls,
    elapsedMs: Date.now() - start,
    estimatedCostUsd: 0,
    totalTokens: cassette.meta.total_tokens,
  };
}

export function loadCassetteOrThrow(invocation: DriverInvocation): CassetteFile {
  const result = readCassette(invocation.cassettePath);
  if (!result) {
    throw new Error(
      `replay mode requires a cassette but ${invocation.cassettePath} does not exist. Run with --mode=record (and the appropriate API key) to capture one.`
    );
  }
  return result.cassette;
}

export function makeRegistryFor(invocation: DriverInvocation): HostToolRegistry {
  return createHostToolRegistry(invocation.scenario.host_tools);
}
