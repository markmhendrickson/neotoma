import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  incrementStorageUsage,
  incrementInterpretationCount,
} from "./storage_usage.js";

const rpcMocks = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  supabase: {
    rpc: rpcMocks.rpcMock,
  },
}));

describe("storage_usage service", () => {
  beforeEach(() => {
    rpcMocks.rpcMock.mockReset();
  });

  it("increments storage usage via RPC", async () => {
    rpcMocks.rpcMock.mockResolvedValue({ data: null, error: null });

    await incrementStorageUsage("user-1", 512);

    expect(rpcMocks.rpcMock).toHaveBeenCalledWith("increment_storage_usage", {
      p_user_id: "user-1",
      p_bytes: 512,
    });
  });

  it("throws when storage usage RPC fails", async () => {
    rpcMocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    await expect(incrementStorageUsage("user-1", 100)).rejects.toThrow(
      /increment_storage_usage failed/,
    );
  });

  it("increments interpretation count via RPC", async () => {
    rpcMocks.rpcMock.mockResolvedValue({ data: null, error: null });

    await incrementInterpretationCount("user-42");

    expect(rpcMocks.rpcMock).toHaveBeenCalledWith(
      "increment_interpretation_count",
      {
        p_user_id: "user-42",
      },
    );
  });

  it("throws when interpretation RPC fails", async () => {
    rpcMocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: "nope" },
    });

    await expect(incrementInterpretationCount("user-42")).rejects.toThrow(
      /increment_interpretation_count failed/,
    );

    expect(rpcMocks.rpcMock).toHaveBeenCalledWith(
      "increment_interpretation_count",
      {
        p_user_id: "user-42",
      },
    );
  });
});
