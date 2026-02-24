import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchemaDetail } from "./SchemaDetail";

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: { bearerToken: "" } }),
}));

vi.mock("@/hooks/useKeys", () => ({
  useKeys: () => ({ bearerToken: "token", loading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ sessionToken: null, user: { id: "user-1" } }),
}));

describe("SchemaDetail", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "schema_1",
        entity_type: "agent_message",
        schema_version: "1.0",
        schema_definition: { fields: {} },
        reducer_config: {},
        active: true,
        created_at: "2024-01-01T00:00:00Z",
      }),
    });
    vi.clearAllMocks();
  });

  it("includes user_id when fetching schema detail", async () => {
    render(<SchemaDetail entityType="agent_message" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/schemas/agent_message");
    expect(url).toContain("user_id=user-1");
    expect(options).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });
});
