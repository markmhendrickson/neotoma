import { describe, expect, it } from "vitest";
import {
  formatRequestLogLine,
  summarizeDataOriginForLog,
} from "../../src/utils/safe_request_log_format.js";

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
        entities: [
          { entity_type: "conversation_message", content: "secret user story " + "x".repeat(500) },
        ],
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

  it("logs only kind and field lengths for data_origin, at request and entity level (#2242)", () => {
    const locator = "/Users/someone/private/ledger.xlsx";
    const url = "https://files.example.com/x?sig=abc123secret";
    const notes = "exported by hand from the finance share";
    const line = formatRequestLogLine("WARN", "ValidationError:store", {
      body: {
        data_origin: { kind: "file", locator, url, notes },
        entities: [
          {
            entity_type: "t",
            title: "a",
            data_origin: { kind: "email", locator: "msg-18c2f0a9d1" },
          },
        ],
      },
      issues: [
        { code: "invalid_enum_value", path: ["data_origin", "kind"], received: "leaky-kind-value" },
      ],
    });
    for (const secret of [
      locator,
      url,
      "sig=abc123secret",
      notes,
      "msg-18c2f0a9d1",
      "leaky-kind-value",
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain("kind: 'file'");
    expect(line).toContain(`locator_len: ${locator.length}`);
    expect(line).toContain(`url_len: ${url.length}`);
    expect(line).toContain("kind: 'email'");
  });

  it("never echoes an unknown kind or a non-object data_origin", () => {
    expect(summarizeDataOriginForLog({ kind: "/etc/passwd", locator: "x" })).toEqual({
      kind: "[omitted:kind]",
      locator_len: 1,
    });
    expect(summarizeDataOriginForLog("gmail msg-1")).toBe(
      "[omitted:data_origin type=string len=11]"
    );
    const line = formatRequestLogLine("WARN", "X", {
      body: { data_origins: { obs_1: { kind: "file", locator: "secret.xlsx" } } },
    });
    expect(line).not.toContain("secret.xlsx");
    expect(line).toContain("[omitted:data_origins count=1]");
  });
});
