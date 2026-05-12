import { describe, expect, it, vi } from "vitest";

const mockCreateOperations = vi.fn(() => ({ marker: "ops" }));
const mockSubmitIssue = vi.fn();

vi.mock("../../src/core/operations.js", () => ({
  createOperations: (...args: unknown[]) => mockCreateOperations(...args),
}));

vi.mock("../../src/services/issues/issue_operations.js", () => ({
  submitIssue: (...args: unknown[]) => mockSubmitIssue(...args),
  addIssueMessage: vi.fn(),
  getIssueStatus: vi.fn(),
}));

describe("submit_issue advisory visibility alias", () => {
  it("keeps the MCP inputSchema visibility enum documented as public/private only", async () => {
    const { buildToolDefinitions } = await import("../../src/tool_definitions.js");
    const submitIssue = buildToolDefinitions().find((tool) => tool.name === "submit_issue");
    const visibility = (submitIssue?.inputSchema as {
      properties?: { visibility?: { enum?: unknown[] } };
    }).properties?.visibility;

    expect(visibility?.enum).toEqual(["public", "private"]);
  });

  it("maps MCP visibility advisory to private and returns a deprecation field", async () => {
    mockSubmitIssue.mockResolvedValue({
      issue_number: 0,
      github_url: "",
      entity_id: "ent_issue_advisory",
      conversation_id: "ent_conversation_advisory",
      remote_entity_id: "",
      pushed_to_github: false,
      submitted_to_neotoma: true,
      github_mirror_guidance: null,
    });

    const { NeotomaServer } = await import("../../src/server.js");
    const server = new NeotomaServer() as unknown as {
      handleSubmitIssue(
        args: unknown,
        userId: string,
      ): Promise<{ content: Array<{ type: string; text: string }> }>;
    };

    const response = await server.handleSubmitIssue(
      {
        title: "Advisory alias",
        body: "Legacy caller still sends advisory.",
        visibility: "advisory",
      },
      "user-1",
    );
    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;

    expect(mockCreateOperations).toHaveBeenCalledWith({ server, userId: "user-1" });
    expect(mockSubmitIssue).toHaveBeenCalledWith(
      { marker: "ops" },
      expect.objectContaining({ visibility: "private" }),
    );
    expect(payload._deprecation).toBe(
      "visibility 'advisory' is deprecated; use 'private' instead.",
    );
  });
});
