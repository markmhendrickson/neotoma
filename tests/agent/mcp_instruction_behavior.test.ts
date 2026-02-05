import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { AgentRunInput, AgentRunner, ToolCall } from "./runner/agent_runner.js";
import { ClaudeCodeRunner } from "./runner/claude_code_runner.js";
import { CursorCliRunner } from "./runner/cursor_cli_runner.js";
import {
  validateRelationshipSignals,
  validateStoredEntities,
  validateToolCallsInclude,
  type ExpectedEntitySpec,
  type ExpectedRelationshipSpec,
} from "../helpers/mcp_spec_validators.js";

type AgentMcpCase = {
  id: string;
  prompt: string;
  attachments: Array<{
    type: "file_path" | "text";
    path?: string;
    content?: string;
    mime_type?: string;
  }>;
  required_actions: string[];
  optional_actions: string[];
  expected_entities: ExpectedEntitySpec[];
  expected_relationships: ExpectedRelationshipSpec[];
};

function loadCases(): AgentMcpCase[] {
  const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "agent_mcp_cases.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw) as AgentMcpCase[];
}

function createRunner(): AgentRunner {
  const runner = (process.env.AGENT_TEST_RUNNER || "claude_code").toLowerCase();
  if (runner === "claude_code") return new ClaudeCodeRunner();
  if (runner === "cursor_cli") return new CursorCliRunner();
  throw new Error(`Unknown AGENT_TEST_RUNNER: ${runner}`);
}

function resolveAttachments(attachments: AgentRunInput["attachments"]): AgentRunInput["attachments"] {
  return attachments.map((attachment) => {
    if (attachment.type === "file_path" && attachment.path) {
      return { ...attachment, path: path.resolve(process.cwd(), attachment.path) };
    }
    return attachment;
  });
}

const cases = loadCases();
const enabled = process.env.AGENT_TEST_ENABLED === "true";
const suite = enabled ? describe : describe.skip;

suite("agent MCP instruction behavior", () => {
  const runner = createRunner();

  for (const testCase of cases) {
    it(testCase.id, async () => {
      const result = await runner.runPrompt({
        prompt: testCase.prompt,
        attachments: resolveAttachments(testCase.attachments),
      });

      validateToolCallsInclude(result.toolCalls, testCase.required_actions);
      validateStoredEntities(result.toolCalls, testCase.expected_entities);
      validateRelationshipSignals(result.toolCalls, testCase.expected_relationships);
    });
  }
});
