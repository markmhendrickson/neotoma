// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeProvider, useRealtime } from "./RealtimeContext";

const realtimeAuthMock = vi.hoisted(() => {
  let statusHandler: ((status: string) => void) | undefined;
  let payloadHandler: ((payload: unknown) => void) | undefined;
  const unsubscribe = vi.fn();

  return {
    channel: vi.fn(() => ({
      on: vi.fn((_event, _config, callback) => {
        payloadHandler = callback;
        return {
          subscribe(callback: (status: string) => void) {
            statusHandler = callback;
            callback("SUBSCRIBED");
            return { unsubscribe };
          },
        };
      }),
    })),
    emitPayload(payload: unknown) {
      payloadHandler?.(payload);
    },
    emitStatus(status: string) {
      statusHandler?.(status);
    },
    reset() {
      statusHandler = undefined;
      payloadHandler = undefined;
      unsubscribe.mockClear();
      this.channel.mockClear();
    },
    unsubscribe,
  };
});

vi.mock("../lib/auth", () => ({
  auth: {
    channel: realtimeAuthMock.channel,
  },
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

describe("RealtimeProvider", () => {
  beforeEach(() => {
    realtimeAuthMock.reset();
    vi.restoreAllMocks();
  });

  it("warns on duplicate subscriptions and cleans up channels", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RealtimeProvider>{children}</RealtimeProvider>
    );
    const { result } = renderHook(() => useRealtime(), { wrapper });

    let unsubscribe!: () => void;
    act(() => {
      unsubscribe = result.current.subscribe({
        table: "entities",
        callback: vi.fn(),
      });
      result.current.subscribe({
        table: "entities",
        callback: vi.fn(),
      });
    });

    expect(warn).toHaveBeenCalledWith("Channel already exists: entities-*-");

    act(() => unsubscribe());
    expect(realtimeAuthMock.unsubscribe).toHaveBeenCalled();
  });

  it("debounces callbacks and reports connection errors", async () => {
    const callback = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RealtimeProvider>{children}</RealtimeProvider>
    );
    const { result } = renderHook(() => useRealtime(), { wrapper });

    act(() => {
      result.current.subscribe({
        table: "timeline_events",
        debounceMs: 5,
        callback,
      });
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      realtimeAuthMock.emitPayload({ eventType: "INSERT", new: { id: "first" } });
      realtimeAuthMock.emitPayload({ eventType: "INSERT", new: { id: "second" } });
    });

    expect(callback).not.toHaveBeenCalled();

    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ eventType: "INSERT", new: { id: "second" } });

    act(() => {
      realtimeAuthMock.emitStatus("CHANNEL_ERROR");
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe("Realtime connection error");
  });
});
