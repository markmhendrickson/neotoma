export type ChatMessage = {
  role: "system" | "user" | "assistant" | "function";
  content: string | null | undefined;
  name?: string;
};

type OpenAIChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "function"; name: string; content: string };

/**
 * Normalize chat messages (including function responses) so that the OpenAI
 * Chat Completions API receives the full conversation context.
 */
export function serializeChatMessagesForOpenAI(
  messages: ChatMessage[],
): OpenAIChatMessage[] {
  return messages.map((message, index) => {
    if (message.role === "function") {
      return {
        role: "function" as const,
        name:
          message.name && message.name.length > 0
            ? message.name
            : `function_call_${index}`,
        content: message.content ?? "",
      };
    }

    return {
      role: message.role,
      content: message.content ?? "",
    };
  });
}
