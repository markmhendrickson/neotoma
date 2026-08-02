import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "../../src/cli/transcript_parser.js";

// Live Codex rollouts encode user turns as `input_text` content blocks and
// assistant turns as `output_text`. Before the fix the parser accepted only
// `text`/`output_text`, so every user message was silently dropped — a
// 57-rollout corpus parsed to zero messages.
function writeRollout(lines: unknown[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-rollout-"));
  const file = path.join(dir, "rollout-2026-08-02T09-20-00-019e2a99.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  return file;
}

const SESSION_META = {
  timestamp: "2026-08-02T07:20:00.000Z",
  type: "session_meta",
  payload: { id: "019e2a99-0000-7000-8000-000000000001", cwd: "/tmp/work" },
};

describe("parseCodexTranscript — live rollout content blocks", () => {
  it("captures user turns encoded as input_text", async () => {
    const file = writeRollout([
      SESSION_META,
      {
        timestamp: "2026-08-02T07:20:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "what was this about?" }],
        },
      },
    ]);

    const result = await parseTranscript({ filePath: file });

    expect(result.totalMessages).toBe(1);
    expect(result.conversations[0].messages[0]).toMatchObject({
      role: "user",
      content: "what was this about?",
    });
  });

  it("captures assistant turns encoded as output_text and preserves session id", async () => {
    const file = writeRollout([
      SESSION_META,
      {
        timestamp: "2026-08-02T07:20:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "ping" }],
        },
      },
      {
        timestamp: "2026-08-02T07:20:02.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "pong" }],
        },
      },
    ]);

    const result = await parseTranscript({ filePath: file });

    expect(result.totalMessages).toBe(2);
    expect(result.conversations[0].id).toBe("019e2a99-0000-7000-8000-000000000001");
    expect(result.conversations[0].messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("still accepts the legacy plain `text` block type", async () => {
    const file = writeRollout([
      SESSION_META,
      {
        timestamp: "2026-08-02T07:20:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "legacy block" }],
        },
      },
    ]);

    const result = await parseTranscript({ filePath: file });

    expect(result.totalMessages).toBe(1);
    expect(result.conversations[0].messages[0].content).toBe("legacy block");
  });
});
