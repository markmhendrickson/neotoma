import { describe, expect, it } from "vitest";
import { serializeChatMessagesForOpenAI, type ChatMessage } from "./chat.js";

describe("serializeChatMessagesForOpenAI", () => {
  it("preserves function call outputs for the model", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "system" },
      { role: "assistant", content: "calling tool" },
      { role: "function", name: "retrieve_records", content: '[{"id":"123"}]' },
      { role: "user", content: "thanks" },
    ];

    const serialized = serializeChatMessagesForOpenAI(messages);
    expect(serialized).toHaveLength(4);
    expect(serialized[2]).toEqual({
      role: "function",
      name: "retrieve_records",
      content: '[{"id":"123"}]',
    });
  });

  it("ensures function messages always have a name and string content", () => {
    const messages: ChatMessage[] = [{ role: "function", content: null }];

    const serialized = serializeChatMessagesForOpenAI(messages);
    expect(serialized[0]).toMatchObject({
      role: "function",
      name: "function_call_0",
      content: "",
    });
  });

  it("normalizes undefined content for non-function messages", () => {
    const messages: ChatMessage[] = [{ role: "user", content: undefined }];

    const serialized = serializeChatMessagesForOpenAI(messages);
    expect(serialized[0]).toEqual({
      role: "user",
      content: "",
    });
  });
});
