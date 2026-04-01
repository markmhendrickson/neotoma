// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRealtimeEntities } from "./useRealtimeEntities";

const subscribeMock = vi.fn();

vi.mock("../contexts/RealtimeContext", () => ({
  useRealtime: () => ({ subscribe: subscribeMock }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

describe("useRealtimeEntities", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
  });

  it("updates entities for insert, update, and delete events", () => {
    let realtimeCallback: ((payload: any) => void) | undefined;
    subscribeMock.mockImplementation(({ callback }) => {
      realtimeCallback = callback;
      return vi.fn();
    });

    const onInsert = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    const initial = [{ id: "ent-1", entity_type: "task", canonical_name: "first" }] as any[];

    const { result } = renderHook(() =>
      useRealtimeEntities(initial, { entityType: "task", onInsert, onUpdate, onDelete }),
    );

    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "entities",
        event: "*",
        filter: "entity_type=eq.task,user_id=eq.user-1",
      }),
    );

    act(() => {
      realtimeCallback?.({ eventType: "INSERT", new: { id: "ent-2", canonical_name: "second" } });
    });
    expect(result.current.map((entity) => entity.id)).toEqual(["ent-1", "ent-2"]);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: "ent-2" }));

    act(() => {
      realtimeCallback?.({ eventType: "UPDATE", new: { id: "ent-1", canonical_name: "first-updated" } });
    });
    expect(result.current[0]).toEqual(expect.objectContaining({ canonical_name: "first-updated" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "ent-1" }));

    act(() => {
      realtimeCallback?.({ eventType: "DELETE", old: { id: "ent-2" } });
    });
    expect(result.current.map((entity) => entity.id)).toEqual(["ent-1"]);
    expect(onDelete).toHaveBeenCalledWith("ent-2");
  });

  it("resets state when initial entities change", () => {
    subscribeMock.mockImplementation(() => vi.fn());

    const { result, rerender } = renderHook(
      ({ initial }) => useRealtimeEntities(initial as any[]),
      {
        initialProps: {
          initial: [{ id: "ent-1", canonical_name: "first" }],
        },
      },
    );

    expect(result.current.map((entity) => entity.id)).toEqual(["ent-1"]);

    rerender({
      initial: [{ id: "ent-9", canonical_name: "replacement" }],
    });

    expect(result.current).toEqual([expect.objectContaining({ id: "ent-9" })]);
  });
});
