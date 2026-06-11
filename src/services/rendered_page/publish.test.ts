import { afterEach, describe, it, expect, vi } from "vitest";

// --- mocks -----------------------------------------------------------------

const mockState = vi.hoisted(() => ({
  generatedToken: "test-token-uuid",
  entities: new Map<string, { entity_type: string; user_id: string }>(),
}));

vi.mock("../../config.js", () => ({
  config: { apiBase: "https://neotoma.example.com", httpPort: 3000 },
}));

vi.mock("../guest_access_token.js", () => ({
  generateGuestAccessToken: vi.fn(async (params: { entityIds: string[] }) => {
    mockState.lastTokenEntityIds = params.entityIds;
    return mockState.generatedToken;
  }),
}));

// Mock the owner-scoped entities lookup: db.from("entities").select(...).eq("id",…).eq("user_id",…).maybeSingle()
vi.mock("../../db.js", () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: (_col1: string, idVal: string) => ({
          eq: (_col2: string, userVal: string) => ({
            maybeSingle: async () => {
              const e = mockState.entities.get(idVal);
              // Only return the row when the owner matches (tenant isolation).
              if (e && e.user_id === userVal) {
                return {
                  data: { id: idVal, user_id: userVal, entity_type: e.entity_type },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    }),
  },
}));

import { publishRenderedPage } from "./publish.js";

afterEach(() => {
  mockState.entities.clear();
  delete (mockState as Record<string, unknown>).lastTokenEntityIds;
  vi.clearAllMocks();
});

// --- tests -----------------------------------------------------------------

describe("publishRenderedPage", () => {
  const noopCreate = vi.fn(async () => "should-not-be-called");

  it("publishes an existing rendered_page and returns a guest URL", async () => {
    mockState.entities.set("ent_page1", { entity_type: "rendered_page", user_id: "u1" });

    const result = await publishRenderedPage({ entityId: "ent_page1", userId: "u1" }, noopCreate);

    expect(result.entity_id).toBe("ent_page1");
    expect(result.created).toBe(false);
    expect(result.access_token).toBe("test-token-uuid");
    expect(result.share_url).toBe(
      "https://neotoma.example.com/entities/ent_page1/html?access_token=test-token-uuid"
    );
    expect(result.ttl_seconds).toBeGreaterThan(0);
    expect(noopCreate).not.toHaveBeenCalled();
    expect(mockState.lastTokenEntityIds).toEqual(["ent_page1"]);
  });

  it("creates a new rendered_page from inline content then publishes it", async () => {
    const create = vi.fn(async () => "ent_new");

    const result = await publishRenderedPage(
      { title: "Preview", htmlBody: "<h1>Hi</h1>", customCss: "h1{color:red}", userId: "u1" },
      create
    );

    expect(create).toHaveBeenCalledWith({
      title: "Preview",
      html_body: "<h1>Hi</h1>",
      custom_css: "h1{color:red}",
      meta_description: undefined,
      userId: "u1",
      idempotencyKey: undefined,
    });
    expect(result.created).toBe(true);
    expect(result.entity_id).toBe("ent_new");
    expect(result.share_url).toContain("/entities/ent_new/html?access_token=test-token-uuid");
  });

  it("404s when the target entity does not exist", async () => {
    await expect(
      publishRenderedPage({ entityId: "ent_missing", userId: "u1" }, noopCreate)
    ).rejects.toThrow(/not found/i);
  });

  it("rejects publishing a non-rendered_page entity", async () => {
    mockState.entities.set("ent_contact", { entity_type: "contact", user_id: "u1" });

    await expect(
      publishRenderedPage({ entityId: "ent_contact", userId: "u1" }, noopCreate)
    ).rejects.toThrow(/not a rendered_page/i);
  });

  it("does NOT publish another user's rendered_page (tenant isolation)", async () => {
    // Page owned by u2; u1 must not be able to mint a token for it.
    mockState.entities.set("ent_other", { entity_type: "rendered_page", user_id: "u2" });

    await expect(
      publishRenderedPage({ entityId: "ent_other", userId: "u1" }, noopCreate)
    ).rejects.toThrow(/not found/i);
    // No token minted for a cross-user entity.
    expect(mockState.lastTokenEntityIds).not.toEqual(["ent_other"]);
  });

  it("pipes idempotency_key into the create path", async () => {
    const create = vi.fn(async () => "ent_idem");
    await publishRenderedPage(
      { title: "t", htmlBody: "<p>x</p>", userId: "u1", idempotencyKey: "key-123" },
      create
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-123" }));
  });

  it("requires either entity_id or inline content", async () => {
    await expect(publishRenderedPage({ userId: "u1" }, noopCreate)).rejects.toThrow(
      /existing entity_id or inline content/i
    );
  });

  it("strips a trailing slash from the base URL", async () => {
    const create = vi.fn(async () => "ent_x");
    const result = await publishRenderedPage(
      { title: "t", htmlBody: "<p>x</p>", userId: "u1" },
      create
    );
    // base url mock has no trailing slash; assert no double slash before /entities
    expect(result.share_url).not.toContain("com//entities");
  });
});
