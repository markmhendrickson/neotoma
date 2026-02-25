import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AnyClient = {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
  PUT: ReturnType<typeof vi.fn>;
  DELETE: ReturnType<typeof vi.fn>;
};

const remoteClient: AnyClient = {
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

const localClient: AnyClient = {
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

const createClientMock = vi.fn(() => remoteClient);
const getLocalTransportClientMock = vi.fn(async () => localClient);

vi.mock("openapi-fetch", () => ({
  default: createClientMock,
}));

vi.mock("../../src/shared/local_transport.ts", () => ({
  getLocalTransportClient: getLocalTransportClientMock,
}));

describe("api_client offline fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT;
    delete process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to local transport on network failure", async () => {
    const networkErr = new Error("fetch failed", { cause: { code: "ECONNREFUSED" } as Error });
    remoteClient.POST.mockRejectedValueOnce(networkErr);
    localClient.POST.mockResolvedValueOnce({ data: { entities: [] }, error: undefined });

    const { createApiClient } = await import("../../src/shared/api_client.ts");
    const api = createApiClient({
      baseUrl: "http://localhost:8080",
      token: "token-1",
      useOfflineFallback: true,
    });

    const result = await api.POST("/entities/query", { body: { limit: 1 } as never });
    expect(result).toEqual({ data: { entities: [] }, error: undefined });
    expect(getLocalTransportClientMock).toHaveBeenCalledWith({
      baseUrl: "http://localhost:8080",
      token: "token-1",
    });
    expect(localClient.POST).toHaveBeenCalledWith("/entities/query", { body: { limit: 1 } });
  });

  it("does not fallback for /health checks", async () => {
    remoteClient.GET.mockRejectedValueOnce(new Error("fetch failed"));

    const { createApiClient } = await import("../../src/shared/api_client.ts");
    const api = createApiClient({ baseUrl: "http://localhost:8080" });

    await expect(api.GET("/health", {} as never)).rejects.toThrow("fetch failed");
    expect(getLocalTransportClientMock).not.toHaveBeenCalled();
  });

  it("uses local transport directly when --offline mode is enabled", async () => {
    process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT = "true";
    localClient.GET.mockResolvedValueOnce({ data: { status: "ok" }, error: undefined });

    const { createApiClient } = await import("../../src/shared/api_client.ts");
    const api = createApiClient({ baseUrl: "http://localhost:8080" });
    const result = await api.GET("/stats", {} as never);

    expect(result).toEqual({ data: { status: "ok" }, error: undefined });
    expect(remoteClient.GET).not.toHaveBeenCalled();
    expect(localClient.GET).toHaveBeenCalledWith("/stats", {} as never);
  });
});
