// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  attemptViteChunkRecovery,
  isRecoverableViteChunkError,
} from "./vite_chunk_recovery";

describe("vite chunk recovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("detects outdated optimize dep errors", () => {
    expect(
      isRecoverableViteChunkError(
        "Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)"
      )
    ).toBe(true);
  });

  it("reloads once for recoverable errors", () => {
    const reload = vi.fn();

    const first = attemptViteChunkRecovery(
      "Failed to fetch dynamically imported module",
      reload
    );
    const second = attemptViteChunkRecovery(
      "Failed to fetch dynamically imported module",
      reload
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for unrelated errors", () => {
    const reload = vi.fn();
    const handled = attemptViteChunkRecovery("Network request failed", reload);

    expect(handled).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
