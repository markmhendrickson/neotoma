import type { AgentRunInput, AgentRunResult, AgentRunner } from "./agent_runner.js";

export class CursorCliRunner implements AgentRunner {
  async runPrompt(_input: AgentRunInput): Promise<AgentRunResult> {
    throw new Error("Cursor CLI runner is not configured. Provide a wrapper command and update this runner.");
  }
}
