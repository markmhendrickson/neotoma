import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  missing: [] as Array<{ id: string; user_id: string; entity_type: string }>,
  orphan: undefined as unknown,
  get: vi.fn(),
  all: vi.fn(),
  prepare: vi.fn(),
  getDb: vi.fn(),
  attached: vi.fn(),
  deciding: vi.fn(),
  resolve: vi.fn(),
  cutover: vi.fn(),
  hiddenAfter: vi.fn(),
  context: vi.fn(),
}));
vi.mock("../../src/repositories/db/connection.js", () => ({ getDb: state.getDb }));
vi.mock("../../src/services/attachment_resolution.js", () => ({
  resolveAttachedObservations: state.attached,
  resolveAttachmentTarget: state.resolve,
}));
vi.mock("../../src/services/entity_lifecycle_storage.js", () => ({
  acquireEntityLifecycleContext: state.context,
  hasRecordedEntityLifecycleCutover: state.cutover,
}));
// Hidden-entity proof reads only the rows that decide visibility (#2792).
vi.mock("../../src/services/current_state_reads.js", () => ({
  readDecidingObservations: state.deciding,
  selectHiddenAfterCutover: state.hiddenAfter,
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
  state.deciding.mockImplementation(async () => acquisition().observations);
  state.resolve.mockImplementation(async (id: string) => ({
    resolvedEntityId: id,
    path: [id],
    truncated: false,
  }));
  state.cutover.mockResolvedValue(false);
  state.hiddenAfter.mockResolvedValue(new Set<string>());
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
    expect(state.resolve).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
    expect(state.deciding).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
    expect(state.attached).not.toHaveBeenCalled();
  });
  it("falls back to the full history only when the deciding run is too large to bound", async () => {
    state.deciding.mockResolvedValue(null);
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(true);
    expect(state.attached).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
  });
  it("after a recorded cutover, certifies from the authority rows without legacy replay", async () => {
    state.cutover.mockResolvedValue(true);
    state.hiddenAfter.mockResolvedValue(new Set([target.id]));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(true);
    expect(state.hiddenAfter).toHaveBeenCalledExactlyOnceWith([target]);
    expect(state.deciding).not.toHaveBeenCalled();
    expect(state.attached).not.toHaveBeenCalled();
    expect(state.context).not.toHaveBeenCalled();
    state.hiddenAfter.mockResolvedValue(new Set<string>());
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
  it("certifies empty or fully materialized membership without acquiring visible histories", async () => {
    state.missing = [];
    expect(await certifySnapshotPopulation(target.user_id, [])).toBe(true);
    expect(state.attached).not.toHaveBeenCalled();
    expect(state.deciding).not.toHaveBeenCalled();
    expect(state.context).not.toHaveBeenCalled();
    expect(state.prepare).toHaveBeenCalledTimes(2);
  });
  it("keeps orphan refusal global even for an empty filtered candidate subset", async () => {
    state.orphan = { mismatch: 1 };
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [])).toBe(false);
    expect(state.deciding).not.toHaveBeenCalled();
  });
  it("honors an already scoped candidate subset without inspecting excluded histories", async () => {
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [])).toBe(true);
    expect(state.deciding).not.toHaveBeenCalled();
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type], [target.id])).toBe(
      true
    );
    expect(state.deciding).toHaveBeenCalledExactlyOnceWith(target.id, target.user_id);
  });
  it.each([{ truncated: true }, { resolvedEntityId: "synthetic-redirect" }])(
    "refuses an incomplete or redirected/cyclic attachment: %j",
    async (change) => {
      state.resolve.mockResolvedValue({
        resolvedEntityId: target.id,
        path: [target.id],
        truncated: false,
        ...change,
      });
      expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
      expect(state.deciding).not.toHaveBeenCalled();
    }
  );
  it("refuses an empty deciding history, bounded or from the full fallback", async () => {
    state.deciding.mockResolvedValue([]);
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.deciding.mockResolvedValue(null);
    state.attached.mockResolvedValue({ ...acquisition(), observations: [] });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
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
    state.deciding.mockResolvedValue([{ ...hidden(), ...change }]);
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
  it("refuses duplicate identities and a later winning restoration", async () => {
    state.deciding.mockResolvedValue([hidden(), hidden()]);
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.deciding.mockResolvedValue([
      hidden(),
      {
        ...hidden(),
        id: "synthetic-restore",
        fields: { _deleted: false },
        source_priority: 1001,
      },
    ]);
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
  });
  it("refuses corrupt authority and acquisition/query errors without certifying", async () => {
    state.context.mockResolvedValue({ acquisition: "complete", mode: "current", target });
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.context.mockRejectedValue(new Error("synthetic authority acquisition failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.deciding.mockRejectedValue(new Error("synthetic deciding-row acquisition failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.resolve.mockRejectedValue(new Error("synthetic attachment resolution failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.cutover.mockRejectedValue(new Error("synthetic cutover read failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.get.mockRejectedValue(new Error("synthetic membership query failure"));
    expect(await certifySnapshotPopulation(target.user_id, [target.entity_type])).toBe(false);
    state.getDb.mockRejectedValue(new Error("synthetic connection failure"));
    await expect(certifySnapshotPopulation(target.user_id, [target.entity_type])).rejects.toThrow(
      "synthetic connection failure"
    );
  });
});
