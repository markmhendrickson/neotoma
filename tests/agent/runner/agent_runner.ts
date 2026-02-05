export type AgentAttachment = {
  type: "file_path" | "text";
  path?: string;
  content?: string;
  mime_type?: string;
};

export type ToolCall = {
  tool: string;
  arguments: Record<string, unknown> | null;
  result?: unknown;
};

export type AgentRunResult = {
  toolCalls: ToolCall[];
  rawOutput: string;
  tracePath?: string;
};

export type AgentRunInput = {
  prompt: string;
  attachments: AgentAttachment[];
};

export interface AgentRunner {
  runPrompt(input: AgentRunInput): Promise<AgentRunResult>;
}
