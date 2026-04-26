/**
 * Claude Agent SDK driver.
 *
 * In `replay` mode this driver simply re-applies the recorded tool calls
 * against the isolated Neotoma server (no API key required). In
 * `record` mode it instantiates `@anthropic-ai/claude-agent-sdk` with
 * the local Neotoma MCP server registered, supplies host-tool stubs as
 * MCP tools backed by the registry, and waits for the assistant's
 * final text. The SDK is loaded lazily so that replay-only operators
 * (CI, contributors without an Anthropic key) never hit the import.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LLMDriver, DriverInvocation, DriverResult, RunMode } from "../types.js";
import { loadCassetteOrThrow, makeRegistryFor, replayCassetteAgainstServer } from "./base.js";
import { describeStub } from "../host_tools.js";
import { writeCassette, buildCassetteFromResult } from "../cassette.js";

const PROVIDER_ID = "claude" as const;

const POSTED_PRICES_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-20250929": { input: 0.8, output: 4 },
  "claude-opus-4-7-20251015": { input: 15, output: 75 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = POSTED_PRICES_PER_1M_TOKENS[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

async function loadSdk(): Promise<unknown | null> {
  try {
    // The SDK is an optional peer dependency. We use a dynamic specifier so
    // TypeScript does not try to resolve it at build time when the package
    // is not installed (replay-only operators / CI).
    const specifier = "@anthropic-ai/claude-agent-sdk";
    const mod = await import(/* @vite-ignore */ specifier);
    return mod;
  } catch {
    return null;
  }
}

export class ClaudeAgentSdkDriver implements LLMDriver {
  readonly id = PROVIDER_ID;
  readonly capabilities = { live: true, replay: true };

  preflight(mode: RunMode): { ok: boolean; reason?: string } {
    if (mode === "replay") return { ok: true };
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok: false,
        reason: "ANTHROPIC_API_KEY is required for record mode (Claude driver).",
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
    const sdk = (await loadSdk()) as
      | {
          query?: (opts: Record<string, unknown>) => AsyncIterable<unknown>;
          tool?: (name: string, description: string, schema: unknown, fn: (args: unknown) => Promise<unknown>) => unknown;
          createSdkMcpServer?: (opts: { name: string; tools: unknown[] }) => unknown;
        }
      | null;
    if (!sdk?.query) {
      throw new Error(
        "@anthropic-ai/claude-agent-sdk is not installed; run `npm i -D @anthropic-ai/claude-agent-sdk` before recording."
      );
    }
    const start = Date.now();
    const registry = makeRegistryFor(invocation);
    const recordedCalls: import("../types.js").ToolCall[] = [];

    // Build host-tool MCP tools backed by the registry.
    const sdkTools: unknown[] = [];
    if (sdk.tool && sdk.createSdkMcpServer) {
      for (const stub of invocation.scenario.host_tools) {
        sdkTools.push(
          sdk.tool(
            stub.name,
            describeStub(stub),
            { type: "object", additionalProperties: true },
            async (args: unknown) => {
              const result = await registry.invoke(stub.name, args);
              recordedCalls.push({
                name: stub.name,
                input: args,
                output: result.output,
                error: result.error,
                sequence: recordedCalls.length,
              });
              return {
                content: [
                  {
                    type: "text",
                    text:
                      result.error ??
                      (typeof result.output === "string"
                        ? result.output
                        : JSON.stringify(result.output ?? null)),
                  },
                ],
              };
            }
          )
        );
      }
    }

    const mcpServers: Record<string, unknown> = {
      neotoma: {
        type: "http",
        url: `${invocation.neotomaBaseUrl}/mcp`,
        headers: { authorization: `Bearer ${invocation.neotomaToken}` },
      },
    };
    const hostStubServerName = "neotoma-eval-stubs";
    if (sdkTools.length > 0 && sdk.createSdkMcpServer) {
      const stubServer = sdk.createSdkMcpServer({
        name: hostStubServerName,
        tools: sdkTools,
      });
      mcpServers[hostStubServerName] = {
        type: "sdk",
        name: hostStubServerName,
        instance: stubServer,
      };
    }

    const isolatedCwd = mkdtempSync(join(tmpdir(), "neotoma-eval-cwd-"));
    const queryOpts: Record<string, unknown> = {
      prompt: invocation.scenario.user_prompt,
      systemPrompt: invocation.scenario.system_prompt,
      model: invocation.model.model,
      cwd: isolatedCwd,
      mcpServers,
      tools: [],
      settingSources: [],
      allowedTools: ["mcp__neotoma", `mcp__${hostStubServerName}`],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: isolatedCwd,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        CLAUDE_CONFIG_DIR: isolatedCwd,
      },
      extraArgs: { "strict-mcp-config": null },
      maxTokens: invocation.scenario.driver_options?.max_tokens ?? 4096,
      temperature: invocation.scenario.driver_options?.temperature ?? 0,
    };

    let assistantText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    type ContentBlock =
      | { type: "text"; text?: string }
      | { type: "tool_use"; name?: string; input?: unknown; id?: string };
    type AssistantEvent = {
      type?: string;
      message?: { content?: ContentBlock[] };
      subtype?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      total_cost_usd?: number;
      result?: string;
    };
    const stream = sdk.query(queryOpts) as AsyncIterable<AssistantEvent>;
    let recordedCost: number | undefined;
    const verbose = process.env.NEOTOMA_EVAL_VERBOSE === "1";
    for await (const event of stream) {
      const type = event.type;
      if (verbose) {
        const summary: Record<string, unknown> = { type };
        if ((event as { subtype?: string }).subtype) summary.subtype = (event as { subtype?: string }).subtype;
        if ((event as { mcp_servers?: unknown[] }).mcp_servers) {
          summary.mcp_servers = (event as { mcp_servers?: unknown[] }).mcp_servers;
        }
        if ((event as { tools?: unknown[] }).tools) {
          const tools = (event as { tools?: unknown[] }).tools as unknown[];
          summary.toolCount = tools.length;
          summary.toolSample = tools.slice(0, 8);
        }
        // eslint-disable-next-line no-console
        console.error("[claude-driver]", JSON.stringify(summary));
      }
      if (type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text" && typeof block.text === "string") {
            assistantText += block.text;
          } else if (block.type === "tool_use") {
            recordedCalls.push({
              name: block.name ?? "unknown_tool",
              input: block.input,
              sequence: recordedCalls.length,
            });
          }
        }
      } else if (type === "result") {
        const usage = event.usage;
        if (usage) {
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
        }
        if (typeof event.total_cost_usd === "number") {
          recordedCost = event.total_cost_usd;
        }
        if (event.subtype === "success" && typeof event.result === "string" && assistantText.length === 0) {
          assistantText = event.result;
        }
      }
    }

    const totalTokens = inputTokens + outputTokens;
    const result: DriverResult = {
      assistantText,
      toolCalls: recordedCalls,
      elapsedMs: Date.now() - start,
      estimatedCostUsd:
        recordedCost ?? estimateCost(invocation.model.model, inputTokens, outputTokens),
      totalTokens: totalTokens > 0 ? totalTokens : undefined,
    };

    const cassette = buildCassetteFromResult(
      invocation.scenario.meta.id,
      PROVIDER_ID,
      invocation.model.model,
      invocation.effectiveProfile,
      invocation.scenario.user_prompt,
      invocation.scenario.system_prompt,
      result
    );
    writeCassette(invocation.cassettePath, cassette);
    return result;
  }
}

export const claudeAgentSdkDriver = new ClaudeAgentSdkDriver();
