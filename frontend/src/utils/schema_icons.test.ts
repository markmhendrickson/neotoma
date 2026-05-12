import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { fetchSchemaMetadata, fetchSchemaMetadataBatch, getIconComponent } from "./schema_icons";

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

describe("schemaIcons rendering", () => {
  it("ignores raw SVG metadata and returns an allow-listed Lucide fallback", () => {
    const Icon = getIconComponent({
      icon_type: "svg",
      icon_name: "custom",
      icon_svg: `<svg><script>alert("xss")</script></svg>`,
    });

    expect(Icon).not.toBeNull();
    const element = React.createElement(Icon!);
    expect(element.props).not.toHaveProperty("dangerouslySetInnerHTML");
  });
});
