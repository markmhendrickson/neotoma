import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import type { AgentRunInput, AgentRunResult, AgentRunner, ToolCall } from "./agent_runner.js";

type RunnerConfig = {
  command: string;
  args: string[];
  traceFormat: "ndjson";
};

const DEFAULT_TRACE_FORMAT: RunnerConfig["traceFormat"] = "ndjson";

function parseArgsEnv(): string[] {
  const raw = process.env.AGENT_CLI_ARGS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function parseTraceFile(tracePath: string): Promise<ToolCall[]> {
  const raw = await fs.readFile(tracePath, "utf-8");
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const toolCalls: ToolCall[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as ToolCall;
    if (parsed && typeof parsed.tool === "string") {
      toolCalls.push({
        tool: parsed.tool,
        arguments: parsed.arguments ?? null,
        result: parsed.result,
      });
    }
  }
  return toolCalls;
}

function resolveConfig(): RunnerConfig | null {
  const command = process.env.AGENT_CLI_COMMAND || "";
  if (!command) return null;
  return {
    command,
    args: parseArgsEnv(),
    traceFormat: DEFAULT_TRACE_FORMAT,
  };
}

export class ClaudeCodeRunner implements AgentRunner {
  async runPrompt(input: AgentRunInput): Promise<AgentRunResult> {
    const config = resolveConfig();
    if (!config) {
      throw new Error(
        "AGENT_CLI_COMMAND is not set. Provide a wrapper command that emits a trace file in NDJSON format."
      );
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-agent-"));
    const promptPath = path.join(tempDir, "prompt.txt");
    const attachmentsPath = path.join(tempDir, "attachments.json");
    const tracePath = path.join(tempDir, "trace.ndjson");
    await fs.writeFile(promptPath, input.prompt, "utf-8");
    await fs.writeFile(attachmentsPath, JSON.stringify(input.attachments, null, 2), "utf-8");

    const env = {
      ...process.env,
      AGENT_PROMPT_PATH: promptPath,
      AGENT_ATTACHMENTS_PATH: attachmentsPath,
      AGENT_TRACE_PATH: tracePath,
      AGENT_TRACE_FORMAT: config.traceFormat,
    };

    const { stdout, stderr, exitCode } = await runCommand(
      config.command,
      config.args,
      env,
      input.prompt,
    );

    if (exitCode !== 0) {
      throw new Error(`Agent runner failed (exit ${exitCode}).\nSTDERR: ${stderr}`);
    }

    const toolCalls = await parseTraceFile(tracePath);
    return {
      toolCalls,
      rawOutput: stdout,
      tracePath,
    };
  }
}
