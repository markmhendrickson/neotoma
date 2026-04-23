/**
 * Reference adapter for the Claude Agent SDK.
 *
 * The Claude Agent SDK exposes a hooks interface on `query()` and
 * `ClaudeSDKClient`. This adapter returns a set of hook callbacks ready
 * to plug into that interface. The callbacks map the SDK's lifecycle
 * events onto Neotoma's state-layer writes, following the Option C
 * architecture:
 *
 * - the adapter is the reliability floor (capture + retrieval inject)
 * - MCP remains the quality ceiling (agent-driven structured writes)
 *
 * We keep the shape loose (`unknown` in, `unknown` out) so this module
 * stays compatible across SDK versions — it is a reference, not a hard
 * binding.
 */

import { NeotomaClient } from "@neotoma/client";

export interface NeotomaSdkAdapterOptions {
  baseUrl?: string;
  token?: string;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  injectContext?: boolean;
  sessionId?: string;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const IDENTIFIER_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_.\-]{2,})/g;

function extractIdentifiers(prompt: string): string[] {
  if (!prompt) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = IDENTIFIER_PATTERN.exec(prompt)) !== null) {
    found.add(match[1]);
    if (found.size >= 5) break;
  }
  return [...found];
}

function summarize(value: unknown, maxLen = 400): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "<unserializable>";
  }
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

function formatContext(
  sections: Array<{ heading: string; body: unknown }>
): string {
  const lines: string[] = [];
  for (const { heading, body } of sections) {
    if (!body) continue;
    lines.push(`## ${heading}`);
    if (Array.isArray(body)) {
      for (const item of body.slice(0, 10)) {
        lines.push(`- ${JSON.stringify(item)}`);
      }
    } else {
      lines.push(JSON.stringify(body));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function harnessProvenance(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    data_source: "claude-agent-sdk",
    harness: "claude-agent-sdk",
    cwd: process.cwd(),
    ...(extra ?? {}),
  };
}

/**
 * Hook callbacks compatible with the Claude Agent SDK.
 *
 * Each handler matches the SDK's hook signature: it accepts an input
 * record and returns a record (possibly with `additionalContext`,
 * `hookSpecificOutput`, etc.). Unknown fields are ignored.
 */
export interface NeotomaAgentHooks {
  UserPromptSubmit: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  PostToolUse: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  PreCompact: (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  Stop: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function createNeotomaAgentHooks(
  options: NeotomaSdkAdapterOptions = {}
): NeotomaAgentHooks {
  const baseUrl =
    options.baseUrl ?? process.env.NEOTOMA_BASE_URL ?? "http://127.0.0.1:3080";
  const token = options.token ?? process.env.NEOTOMA_TOKEN ?? "dev-local";
  const logLevel =
    options.logLevel ??
    (process.env.NEOTOMA_LOG_LEVEL as NeotomaSdkAdapterOptions["logLevel"]) ??
    "warn";
  const sessionId =
    options.sessionId ?? `claude-agent-sdk-${Date.now().toString(36)}`;
  const injectContext = options.injectContext ?? true;

  const threshold = LEVEL_ORDER[logLevel] ?? 2;
  function log(level: string, message: string) {
    const requested = LEVEL_ORDER[level] ?? 3;
    if (requested >= threshold) {
      process.stderr.write(
        `[neotoma-claude-agent-sdk] ${level}: ${message}\n`
      );
    }
  }

  const client = new NeotomaClient({ transport: "http", baseUrl, token });

  function idemp(turnId: string, suffix: string): string {
    return `conversation-${sessionId}-${turnId}-${suffix}`;
  }

  return {
    async UserPromptSubmit(input) {
      const prompt =
        (input.prompt as string) ?? (input.user_prompt as string) ?? "";
      const turnId = (input.turn_id as string) ?? String(Date.now());

      try {
        await client.store({
          entities: [
            {
              entity_type: "conversation_message",
              role: "user",
              sender_kind: "user",
              content: prompt,
              turn_key: `${sessionId}:${turnId}`,
              ...harnessProvenance({ hook_event: "UserPromptSubmit" }),
            },
          ],
          idempotency_key: idemp(turnId, "user"),
        });
      } catch (err) {
        log("warn", `UserPromptSubmit store failed: ${(err as Error).message}`);
      }

      if (!injectContext) return {};

      const sections: Array<{ heading: string; body: unknown }> = [];
      for (const identifier of extractIdentifiers(prompt)) {
        try {
          const match = await client.retrieveEntityByIdentifier({ identifier });
          if (match) sections.push({ heading: `Entity: ${identifier}`, body: match });
        } catch (err) {
          log("debug", `retrieve(${identifier}) failed: ${(err as Error).message}`);
        }
      }
      try {
        const timeline = await client.listTimelineEvents({ limit: 5 });
        if (timeline) sections.push({ heading: "Recent timeline", body: timeline });
      } catch (err) {
        log("debug", `listTimelineEvents failed: ${(err as Error).message}`);
      }
      if (sections.length === 0) return {};
      return {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: formatContext(sections),
        },
      };
    },

    async PostToolUse(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const toolName =
        (input.tool_name as string) ?? (input.tool as string) ?? "unknown";
      const toolInput = (input.tool_input as unknown) ?? {};
      const toolOutput =
        (input.tool_response as unknown) ?? (input.tool_output as unknown) ?? {};

      try {
        await client.store({
          entities: [
            {
              entity_type: "tool_invocation",
              tool_name: toolName,
              turn_key: `${sessionId}:${turnId}`,
              has_error: Boolean(
                (toolOutput as { error?: unknown }).error ?? false
              ),
              input_summary: summarize(toolInput),
              output_summary: summarize(toolOutput),
              ...harnessProvenance({ hook_event: "PostToolUse" }),
            },
          ],
          idempotency_key: idemp(turnId, `tool-${toolName}-${Date.now()}`),
        });
      } catch (err) {
        log("debug", `PostToolUse store failed: ${(err as Error).message}`);
      }
      return {};
    },

    async PreCompact(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const trigger = (input.trigger as string) ?? "auto";
      try {
        await client.store({
          entities: [
            {
              entity_type: "context_event",
              event: "pre_compact",
              trigger,
              turn_key: `${sessionId}:${turnId}`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "PreCompact" }),
            },
          ],
          idempotency_key: idemp(turnId, "compact"),
        });
      } catch (err) {
        log("debug", `PreCompact store failed: ${(err as Error).message}`);
      }
      return {};
    },

    async Stop(input) {
      const turnId = (input.turn_id as string) ?? String(Date.now());
      const final =
        (input.response as string) ??
        (input.assistant_response as string) ??
        "";
      if (!final) return {};
      try {
        await client.store({
          entities: [
            {
              entity_type: "conversation_message",
              role: "assistant",
              sender_kind: "assistant",
              content: final,
              turn_key: `${sessionId}:${turnId}:assistant`,
              observed_at: new Date().toISOString(),
              ...harnessProvenance({ hook_event: "Stop" }),
            },
          ],
          idempotency_key: idemp(turnId, "assistant"),
        });
      } catch (err) {
        log("debug", `Stop store failed: ${(err as Error).message}`);
      }
      return {};
    },
  };
}

export default createNeotomaAgentHooks;
