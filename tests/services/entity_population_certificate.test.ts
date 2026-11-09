import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  missing: [] as Array<{ id: string; user_id: string; entity_type: string }>,
  orphan: undefined as unknown,
  get: vi.fn(),
  all: vi.fn(),
  prepare: vi.fn(),
  getDb: vi.fn(),
  attached: vi.fn(),
  context: vi.fn(),
}));
vi.mock("../../src/repositories/db/connection.js", () => ({ getDb: state.getDb }));
vi.mock("../../src/services/attachment_resolution.js", () => ({
  resolveAttachedObservations: state.attached,
}));
vi.mock("../../src/services/entity_lifecycle_storage.js", () => ({
  acquireEntityLifecycleContext: state.context,
}));
import { certifySnapshotPopulation } from "../../src/services/entity_population_certificate.js";

const target = { id: "synthetic-missing", user_id: "synthetic-owner", entity_type: "note" };
const hidden = () => ({
  id: "synthetic-observation",
  entity_id: target.id,
  user_id: target.user_id,
  entity_type: target.entity_type,
  fields: { _deleted: true },
  observed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  source_priority: 1000,
});
const acquisition = () => ({
  truncated: false,
  resolvedEntityId: target.id,
  observations: [hidden()],
});

beforeEach(() => {
  vi.resetAllMocks();
  state.missing = [target];
  state.orphan = undefined;
  state.get.mockImplementation(async () => state.orphan);
  state.all.mockImplementation(async () => state.missing);
  state.prepare.mockReturnValue({ get: state.get, all: state.all });
  state.getDb.mockResolvedValue({ prepare: state.prepare });
  state.attached.mockImplementation(async () => acquisition());
  state.context.mockImplementation(async (_connection, acquiredTarget) => ({
    acquisition: "complete",
    mode: "pre_migration",
    target: acquiredTarget,
  }));
});

describe("snapshot population certificate proof boundary", () => {
  it("certifies hidden missing membership using the existing strict legacy/current selector", async () => {
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(true);
    expect(state.get).toHaveBeenCalledWith(target.user_id, target.entity_type);
    expect(state.all).toHaveBeenCalledWith(target.user_id, target.entity_type);
    expect(state.attached).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
  });
  it("certifies empty or fully materialized membership without acquiring visible histories", async () => {
    state.missing = [];
    expect(await certifySnapshotPopulation(target.user_id, [])).toBe(true);
    expect(state.attached).not.toHaveBeenCalled();
    expect(state.context).not.toHaveBeenCalled();
    expect(state.prepare).toHaveBeenCalledTimes(2);
  });
  it("keeps orphan refusal global even for an empty filtered candidate subset", async () => {
    state.orphan = { mismatch: 1 };
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [])).toBe(false);
    expect(state.attached).not.toHaveBeenCalled();
  });
  it("honors an already scoped candidate subset without inspecting excluded histories", async () => {
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [])).toBe(true);
    expect(state.attached).not.toHaveBeenCalled();
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [target.id])).toBe(
      true
    );
    expect(state.attached).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
  });
  it.each([{ truncated: true }, { resolvedEntityId: "synthetic-redirect" }, { observations: [] }])(
    "refuses incomplete, redirected/cyclic or empty acquisitions: %j",
    async (change) => {
      state.attached.mockResolvedValue({ ...acquisition(), ...change });
      expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    }
  );
  it.each([
    { user_id: "synthetic-other-owner" },
    { entity_type: "synthetic-other-type" },
    { fields: null },
    { fields: [] },
    { observed_at: "malformed" },
    { source_priority: NaN },
    { id: "" },
    { fields: { _deleted: "true" } },
    { entity_lifecycle_kind: "delete" },
  ])("refuses malformed, unproved or foreign deletion history: %j", async (change) => {
    state.attached.mockResolvedValue({
      ...acquisition(),
      observations: [{ ...hidden(), ...change }],
    });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
  it("refuses duplicate identities and a later winning restoration", async () => {
    state.attached.mockResolvedValue({ ...acquisition(), observations: [hidden(), hidden()] });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.attached.mockResolvedValue({
      ...acquisition(),
      observations: [
        hidden(),
        {
          ...hidden(),
          id: "synthetic-restore",
          fields: { _deleted: false },
          source_priority: 1001,
        },
      ],
    });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
  it("refuses corrupt authority and acquisition/query errors without certifying", async () => {
    state.context.mockResolvedValue({ acquisition: "complete", mode: "current", target });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.context.mockRejectedValue(new Error("synthetic authority acquisition failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.attached.mockRejectedValue(new Error("synthetic attachment acquisition failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.get.mockRejectedValue(new Error("synthetic membership query failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.getDb.mockRejectedValue(new Error("synthetic connection failure"));
    await expect(certifySnapshotPopulation(target.user_id, [target.entity_type])).rejects.toThrow(
      "synthetic connection failure"
    );
  });
});
