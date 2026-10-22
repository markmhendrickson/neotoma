import { describe, expect, it } from "vitest";
import { formatRequestLogLine } from "../../src/utils/safe_request_log_format.js";

describe("formatRequestLogLine", () => {
  it("expands nested entities instead of collapsing to [Object]", () => {
    const line = formatRequestLogLine("WARN", "AuthInvalidToken", {
      method: "POST",
      path: "/store",
      body: {
        entities: [
          { entity_type: "conversation_message", turn_key: "c:1", role: "user" },
          { entity_type: "conversation", title: "T" },
        ],
        idempotency_key: "conversation-x-turn",
      },
    });
    expect(line).toContain("entity_type: 'conversation_message'");
    expect(line).toContain("idempotency_key: 'conversation-x-turn'");
    expect(line).not.toMatch(/\[\s*Object\s*\]/);
  });

  it("omits high-risk string fields by length placeholder", () => {
    const line = formatRequestLogLine("WARN", "AuthInvalidToken", {
      body: {
        entities: [{ entity_type: "conversation_message", content: "secret user story " + "x".repeat(500) }],
      },
    });
    expect(line).toContain("[omitted:content len=");
    expect(line).not.toContain("secret user story");
  });

  it("redacts emails and phones inside allowed short strings", () => {
    const line = formatRequestLogLine("DEBUG", "Sample", {
      body: { note: "Contact me at user@example.com or 415-555-0100" },
    });
    expect(line).toContain("[REDACTED:email]");
    expect(line).toContain("[REDACTED:phone]");
    expect(line).not.toContain("user@example.com");
  });

  it("replaces api_response_data without recursing", () => {
    const line = formatRequestLogLine("ERROR", "Err", {
      body: { api_response_data: { list: [{ secret: "nope" }] } },
    });
    expect(line).toContain("[REDACTED:payload_field]");
    expect(line).not.toContain("nope");
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const line = formatRequestLogLine("WARN", "Circ", { body: a });
    expect(line).toContain("[Circular]");
  });
});
