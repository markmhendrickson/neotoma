import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchSchemaMetadata, fetchSchemaMetadataBatch } from "./schema_icons";

const originalFetch = globalThis.fetch;

describe("schemaIcons metadata fetch", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("returns metadata for exact schema match", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        schemas: [
          { entity_type: "conversation", metadata: { label: "Conversation" } },
        ],
      }),
    });

    const result = await fetchSchemaMetadata("conversation", "token", "user-1");

    expect(result).toEqual({ label: "Conversation" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/schemas"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("returns batch metadata only for requested types", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        schemas: [
          { entity_type: "conversation", metadata: { label: "Conversation" } },
          { entity_type: "invoice", metadata: { label: "Invoice" } },
        ],
      }),
    });

    const result = await fetchSchemaMetadataBatch(
      ["conversation", "agent_message"],
      "token",
      "user-1"
    );

    expect(result.get("conversation")).toEqual({ label: "Conversation" });
    expect(result.has("agent_message")).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
