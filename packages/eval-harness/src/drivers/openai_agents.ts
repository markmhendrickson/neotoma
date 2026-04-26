/**
 * OpenAI Agents driver.
 *
 * Mirrors the Claude driver's contract — replay walks the cassette and
 * re-applies tool calls; record drives the live OpenAI Agents SDK
 * (Responses API with MCP support). The SDK is loaded lazily so that
 * the harness can run replay-only without `openai`/`@openai/agents`
 * installed.
 */

import type { LLMDriver, DriverInvocation, DriverResult, RunMode } from "../types.js";
import { loadCassetteOrThrow, makeRegistryFor, replayCassetteAgainstServer } from "./base.js";
import { buildCassetteFromResult, writeCassette } from "../cassette.js";
import { describeStub } from "../host_tools.js";

const PROVIDER_ID = "openai" as const;

const POSTED_PRICES_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.6, output: 2.4 },
  "gpt-5": { input: 5, output: 15 },
  "gpt-5-nano": { input: 0.15, output: 0.6 },
  "gpt-5.5-medium": { input: 1.5, output: 6 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = POSTED_PRICES_PER_1M_TOKENS[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

async function loadAgentsSdk(): Promise<unknown | null> {
  // Try the dedicated `@openai/agents` package first; fall back to the
  // base `openai` SDK. Both are optional peer dependencies — we use
  // dynamic specifiers so the TS build does not require either to be
  // installed.
  const agentsSpec = "@openai/agents";
  const openaiSpec = "openai";
  try {
    return await import(/* @vite-ignore */ agentsSpec);
  } catch {
    try {
      return await import(/* @vite-ignore */ openaiSpec);
    } catch {
      return null;
    }
  }
}

export class OpenAIAgentsDriver implements LLMDriver {
  readonly id = PROVIDER_ID;
  readonly capabilities = { live: true, replay: true };

  preflight(mode: RunMode): { ok: boolean; reason?: string } {
    if (mode === "replay") return { ok: true };
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        reason: "OPENAI_API_KEY is required for record mode (OpenAI driver).",
      };
    }
    return { ok: true };
  }

  async runOnce(invocation: DriverInvocation): Promise<DriverResult> {
    if (invocation.mode === "replay") {
      const cassette = loadCassetteOrThrow(invocation);
      const registry = makeRegistryFor(invocation);
      return replayCassetteAgainstServer(invocation, cassette, registry);
    }
    return this.runLive(invocation);
  }

  private async runLive(invocation: DriverInvocation): Promise<DriverResult> {
    const sdk = (await loadAgentsSdk()) as
      | {
          Agent?: new (opts: Record<string, unknown>) => { run: (prompt: string) => Promise<Record<string, unknown>> };
          run?: (agent: unknown, prompt: string) => Promise<Record<string, unknown>>;
          OpenAI?: new (opts?: Record<string, unknown>) => unknown;
          MCPServerStreamableHttp?: new (opts: Record<string, unknown>) => {
            connect: () => Promise<void>;
            close: () => Promise<void>;
          };
          default?: unknown;
        }
      | null;
    if (!sdk) {
      throw new Error(
        "neither @openai/agents nor openai is installed; install one of them before recording with the OpenAI driver."
      );
    }
    const start = Date.now();
    const registry = makeRegistryFor(invocation);
    const recordedCalls: import("../types.js").ToolCall[] = [];

    // Prefer @openai/agents when available — it speaks MCP natively and
    // matches the Claude driver's tool-call shape.
    if (typeof sdk.Agent === "function" && typeof sdk.run === "function") {
      const tools = invocation.scenario.host_tools.map((stub) => ({
        type: "function",
        name: stub.name,
        description: describeStub(stub),
        parameters: { type: "object", additionalProperties: true },
        async invoke(args: unknown) {
          const result = await registry.invoke(stub.name, args);
          recordedCalls.push({
            name: stub.name,
            input: args,
            output: result.output,
            error: result.error,
            sequence: recordedCalls.length,
          });
          return result.error ?? JSON.stringify(result.output ?? null);
        },
      }));
      const AgentCtor = sdk.Agent as new (opts: Record<string, unknown>) => {
        run: (prompt: string) => Promise<Record<string, unknown>>;
      };
      if (typeof sdk.MCPServerStreamableHttp !== "function") {
        throw new Error(
          "@openai/agents does not export MCPServerStreamableHttp; ensure @openai/agents >= 0.8 is installed."
        );
      }
      const McpServerCtor = sdk.MCPServerStreamableHttp;
      const mcpServer = new McpServerCtor({
        name: "neotoma",
        url: `${invocation.neotomaBaseUrl}/mcp`,
        requestInit: {
          headers: { authorization: `Bearer ${invocation.neotomaToken}` },
        },
        cacheToolsList: true,
      });
      await mcpServer.connect();
      let result: Record<string, unknown>;
      try {
        const agent = new AgentCtor({
          name: `neotoma-eval-${invocation.scenario.meta.id}`,
          model: invocation.model.model,
          tools,
          mcpServers: [mcpServer],
          instructions: invocation.scenario.system_prompt,
          temperature: invocation.scenario.driver_options?.temperature ?? 0,
          maxOutputTokens: invocation.scenario.driver_options?.max_tokens ?? 4096,
        });
        result = (await sdk.run!(agent, invocation.scenario.user_prompt)) as Record<string, unknown>;
      } finally {
        await mcpServer.close().catch(() => undefined);
      }
      const assistantText = (result.finalOutput ?? result.output ?? result.text ?? "") as string;
      const usage = (result.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
      const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      // The Agents SDK exposes the run history as `newItems`; tool invocations
      // surface as `tool_call_item` (function or hosted) and their outputs as
      // `tool_call_output_item`. We pair them by callId/index to capture both
      // the model-emitted args and the MCP server's response in the cassette.
      type RawItem = {
        type?: string;
        name?: string;
        arguments?: unknown;
        callId?: string;
        output?: unknown;
        result?: unknown;
      };
      type RunItem = { type?: string; rawItem?: RawItem };
      const newItems = (result.newItems ?? []) as RunItem[];
      const callItems: { name: string; input: unknown; callId?: string; idx: number }[] = [];
      const outputByCallId = new Map<string, unknown>();
      const outputByIdx = new Map<number, unknown>();
      let toolIdx = 0;
      for (const item of newItems) {
        const raw = item.rawItem ?? {};
        if (item.type === "tool_call_item") {
          let parsedInput: unknown = raw.arguments;
          if (typeof parsedInput === "string") {
            try {
              parsedInput = JSON.parse(parsedInput);
            } catch {
              // leave as string
            }
          }
          callItems.push({
            name: raw.name ?? "unknown_tool",
            input: parsedInput,
            callId: raw.callId,
            idx: toolIdx++,
          });
        } else if (item.type === "tool_call_output_item") {
          const out = raw.output ?? raw.result;
          if (raw.callId) outputByCallId.set(raw.callId, out);
          else outputByIdx.set(callItems.length - 1, out);
        }
      }
      for (const call of callItems) {
        const output =
          (call.callId && outputByCallId.get(call.callId)) ??
          outputByIdx.get(call.idx);
        recordedCalls.push({
          name: call.name,
          input: call.input,
          output,
          sequence: recordedCalls.length,
        });
      }
      const driverResult: DriverResult = {
        assistantText,
        toolCalls: recordedCalls,
        elapsedMs: Date.now() - start,
        estimatedCostUsd: estimateCost(invocation.model.model, usage.input_tokens ?? 0, usage.output_tokens ?? 0),
        totalTokens: totalTokens > 0 ? totalTokens : undefined,
      };
      writeCassette(
        invocation.cassettePath,
        buildCassetteFromResult(
          invocation.scenario.meta.id,
          PROVIDER_ID,
          invocation.model.model,
          invocation.effectiveProfile,
          invocation.scenario.user_prompt,
          invocation.scenario.system_prompt,
          driverResult
        )
      );
      return driverResult;
    }

    throw new Error(
      "Detected `openai` package but @openai/agents is required for the agent-loop driver. Install @openai/agents to record."
    );
  }
}

export const openaiAgentsDriver = new OpenAIAgentsDriver();
