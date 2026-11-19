import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";

const fromMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/db.js", () => ({ db: { from: fromMock } }));

import {
  confirmStoreWriteComplete,
  storeWriteCompletionResponseFields,
} from "../../src/services/store_write_state.js";

describe("storeWriteCompletionResponseFields", () => {
  it("is empty for a confirmed store", () => {
    expect(storeWriteCompletionResponseFields({ state: "complete" })).toEqual({});
  });

  it("carries the three fields for an unconfirmed store", () => {
    const fields = storeWriteCompletionResponseFields({ state: "unconfirmed", reason: "x" });
    expect(fields).toMatchObject({
      write_committed: true,
      store_write_completion: "unconfirmed",
    });
    expect(String(fields.store_write_completion_note)).toMatch(/optional replay/);
  });

  it("promises no replay for a store with an interpretation", () => {
    const note = String(
      storeWriteCompletionResponseFields(
        { state: "unconfirmed", reason: "x" },
        { hasInterpretation: true, hasIdempotencyKey: true }
      ).store_write_completion_note
    );
    expect(note).toMatch(/No replay is needed/);
    expect(note).not.toMatch(/optional replay/);
  });

  it("says no action is needed for a store without an idempotency key", () => {
    const note = String(
      storeWriteCompletionResponseFields(
        { state: "unconfirmed", reason: "x" },
        { hasInterpretation: false, hasIdempotencyKey: false }
      ).store_write_completion_note
    );
    expect(note).toMatch(/no action is needed/);
    expect(note).not.toMatch(/replay/);
  });
});

describe("confirmStoreWriteComplete", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns unconfirmed, not a throw, when the marker step fails", async () => {
    const failing: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) failing[m] = () => failing;
    failing.maybeSingle = () => Promise.reject(new Error("db unavailable"));
    fromMock.mockReturnValue(failing);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      await expect(confirmStoreWriteComplete("src", "user")).resolves.toEqual({
        state: "unconfirmed",
        reason: "db unavailable",
      });
      // The log names the source and reason, and no idempotency key (it is never passed in).
      expect(String(warn.mock.calls[0][0])).toContain("source src");
    } finally {
      warn.mockRestore();
    }
  });

  it("returns complete when the marker is already recorded", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({
      data: { provenance: { store_write: { state: "complete" } } },
      error: null,
    });
    fromMock.mockReturnValue(chain);
    await expect(confirmStoreWriteComplete("src", "user")).resolves.toEqual({
      state: "complete",
    });
  });
});
