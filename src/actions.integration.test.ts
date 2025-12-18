import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import type { Application } from "express";
import { supabase } from "./db.js";

let testApp: Application;

const createBearerToken = () => Buffer.from(randomBytes(32)).toString("base64url");

// Mock OpenAI for embedding and comparison tests
const mockOpenAI = {
  embeddings: {
    create: vi.fn(),
  },
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

describe("HTTP actions endpoints", () => {
  let server: ReturnType<Application["listen"]> | null = null;
  let baseUrl = "";
  let bearerToken = "";

  beforeAll(async () => {
    const originalAutostart = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
    process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
    const actionsModule = await import("./actions.js");
    testApp = actionsModule.app;
    if (originalAutostart === undefined) {
      delete process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
    } else {
      process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = originalAutostart;
    }
    server = testApp.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    bearerToken = createBearerToken();
  });

  afterAll(() => {
    server?.close();
  });

  it("retrieves records explicitly by ids in the provided order", async () => {
    const inserts = [
      { type: "chat_test_alpha", properties: { label: "first" } },
      { type: "chat_test_alpha", properties: { label: "second" } },
    ];
    const { data } = await supabase.from("records").insert(inserts).select();
    expect(data).toBeTruthy();
    const [first, second] = data!;

    const response = await fetch(`${baseUrl}/retrieve_records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ ids: [second.id, first.id] }),
    });

    expect(response.status).toBe(200);
    const records = (await response.json()) as Array<{
      id: string;
      properties: Record<string, unknown>;
    }>;
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(second.id);
    expect(records[1].id).toBe(first.id);

    await supabase.from("records").delete().in("id", [first.id, second.id]);
  });

  it("uses recent_records for chat follow-ups without extra search terms", async () => {
    const { data: created } = await supabase
      .from("records")
      .insert({
        type: "chat_recent_record",
        properties: { title: "Inline session record" },
      })
      .select()
      .single();
    expect(created).toBeTruthy();

    const openAIResponses = [
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              function_call: {
                name: "retrieve_records",
                arguments: JSON.stringify({ ids: [created!.id], limit: 1 }),
              },
            },
          },
        ],
      },
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Here is the record you just added.",
            },
          },
        ],
      },
    ];

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("api.openai.com/v1/chat/completions")) {
          const payload = openAIResponses.shift();
          if (!payload) {
            throw new Error("No stubbed OpenAI response remaining");
          }
          return Promise.resolve(
            new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return originalFetch(input as any, init);
      });

    try {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "tell me about it" }],
          recent_records: [{ id: created!.id, persisted: true }],
        }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.records_queried?.[0]?.id).toBe(created!.id);
      expect(openAIResponses).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
      await supabase.from("records").delete().eq("id", created!.id);
    }
  });

  it("omits records_queried when assistant never calls retrieve_records", async () => {
    const { data: created } = await supabase
      .from("records")
      .insert({
        type: "chat_recent_record_skip",
        properties: { title: "Context only record" },
      })
      .select()
      .single();
    expect(created).toBeTruthy();

    const openAIResponses = [
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Noted. Let me know if you need anything else.",
            },
          },
        ],
      },
    ];

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("api.openai.com/v1/chat/completions")) {
          const payload = openAIResponses.shift();
          if (!payload) {
            throw new Error("No stubbed OpenAI response remaining");
          }
          return Promise.resolve(
            new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return originalFetch(input as any, init);
      });

    try {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "acknowledge the last upload" }],
          recent_records: [{ id: created!.id, persisted: true }],
        }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.records_queried).toBeUndefined();
      expect(openAIResponses).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
      await supabase.from("records").delete().eq("id", created!.id);
    }
  });

  describe("generate_embedding endpoint", () => {
    it("requires authentication", async () => {
      const response = await fetch(`${baseUrl}/generate_embedding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "test_record",
          properties: { label: "test" },
        }),
      });

      expect(response.status).toBe(401);
    });

    it("validates request payload", async () => {
      const response = await fetch(`${baseUrl}/generate_embedding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it("returns 503 when OpenAI API key is not configured", async () => {
      // Skip if OpenAI is actually configured (module is cached)
      const { config } = await import("./config.js");
      if (config.openaiApiKey) {
        console.warn("Skipping test: OPENAI_API_KEY is configured (module cached)");
        return;
      }

      const response = await fetch(`${baseUrl}/generate_embedding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          type: "test_record",
          properties: { label: "test" },
        }),
      });

      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error.error).toContain("OpenAI API key");
    });

    it("generates embedding when OpenAI is configured", async () => {
      const { config } = await import("./config.js");
      if (!config.openaiApiKey) {
        console.warn("Skipping test: OPENAI_API_KEY not configured");
        return;
      }

      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());

      // Mock the OpenAI embeddings.create method
      const embeddingsModule = await import("./embeddings.js");
      const originalGenerate = embeddingsModule.generateEmbedding;

      vi.spyOn(embeddingsModule, "generateEmbedding").mockResolvedValue(mockEmbedding);

      try {
        const response = await fetch(`${baseUrl}/generate_embedding`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            type: "test_record",
            properties: { label: "test", amount: 100 },
          }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.embedding).toBeDefined();
        expect(Array.isArray(data.embedding)).toBe(true);
        expect(data.embedding.length).toBe(1536);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("record_comparison endpoint", () => {
    it("requires authentication", async () => {
      const response = await fetch(`${baseUrl}/record_comparison`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          new_record: {
            id: "new-1",
            type: "transaction",
            summary: "New transaction",
            properties: { amount: 100 },
          },
          similar_records: [
            {
              id: "similar-1",
              type: "transaction",
              summary: "Similar transaction",
              properties: { amount: 90 },
            },
          ],
        }),
      });

      expect(response.status).toBe(401);
    });

    it("validates request payload", async () => {
      const response = await fetch(`${baseUrl}/record_comparison`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it("returns 503 when OpenAI API key is not configured", async () => {
      // Skip if OpenAI is actually configured (module is cached)
      const { config } = await import("./config.js");
      if (config.openaiApiKey) {
        console.warn("Skipping test: OPENAI_API_KEY is configured (module cached)");
        return;
      }

      const response = await fetch(`${baseUrl}/record_comparison`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          new_record: {
            id: "new-1",
            type: "transaction",
            summary: "New transaction",
            properties: { amount: 100 },
          },
          similar_records: [
            {
              id: "similar-1",
              type: "transaction",
              summary: "Similar transaction",
              properties: { amount: 90 },
            },
          ],
        }),
      });

      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error.error).toContain("OpenAI API key");
    });

    it("generates comparison analysis when OpenAI is configured", async () => {
      const { config } = await import("./config.js");
      if (!config.openaiApiKey) {
        console.warn("Skipping test: OPENAI_API_KEY not configured");
        return;
      }

      const mockAnalysis = "This transaction is higher than similar transactions.";

      // Mock the record comparison service
      const comparisonModule = await import("./services/record_comparison.js");
      const originalGenerate = comparisonModule.generateRecordComparisonInsight;

      vi.spyOn(comparisonModule, "generateRecordComparisonInsight").mockResolvedValue(mockAnalysis);

      try {
        const response = await fetch(`${baseUrl}/record_comparison`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            new_record: {
              id: "new-1",
              type: "transaction",
              summary: "New transaction",
              properties: { amount: 100 },
              metrics: { amount: 100, currency: "USD" },
            },
            similar_records: [
              {
                id: "similar-1",
                type: "transaction",
                summary: "Similar transaction",
                properties: { amount: 90 },
                metrics: { amount: 90, currency: "USD" },
              },
            ],
          }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.analysis).toBe(mockAnalysis);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
