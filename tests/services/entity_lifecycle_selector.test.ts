import { describe, expect, it } from "vitest";
import {
  ENTITY_LIFECYCLE_CUTOVER_ID,
  ENTITY_LEGACY_SELECTOR_VERSION,
  selectEntityLifecycleVisibility,
  selectLegacyEntityVisibility,
  legacyMembershipDigest,
  type LifecycleObservation,
  type EntityLifecycleContext,
} from "../../src/services/entity_lifecycle_authority.js";
const target = {
  id: "ent_synthetic_target",
  user_id: "synthetic-owner",
  entity_type: "synthetic_type",
};
const when = "2026-01-01T00:00:00Z";
function row(id: string, changes: Partial<LifecycleObservation> = {}): LifecycleObservation {
  return {
    id,
    entity_id: target.id,
    entity_type: target.entity_type,
    user_id: target.user_id,
    observed_at: when,
    created_at: when,
    source_priority: 10,
    fields: { title: id },
    ...changes,
  };
}
function action(
  id: string,
  sequence: number,
  kind: "delete" | "restore",
  changes: Partial<LifecycleObservation> = {}
) {
  return row(id, {
    entity_lifecycle_kind: kind,
    entity_lifecycle_sequence: sequence,
    entity_lifecycle_target_id: target.id,
    fields: { _deleted: kind === "delete" },
    ...changes,
  });
}
function context(changes: Record<string, unknown> = {}): EntityLifecycleContext {
  return {
    acquisition: "complete",
    target,
    mode: "current",
    cutover_id: ENTITY_LIFECYCLE_CUTOVER_ID,
    selector_version: ENTITY_LEGACY_SELECTOR_VERSION,
    recorded_at: when,
    legacy_memberships: [],
    authority_targets: [target],
    ...changes,
  } as EntityLifecycleContext;
}
describe("context-explicit entity lifecycle selector", () => {
  it("orders equal/backdated action times by serialized sequence and excludes authority from facts", () => {
    const result = selectEntityLifecycleVisibility(
      [
        row("fact"),
        action("delete1", 1, "delete"),
        action("restore2", 2, "restore"),
        action("delete3", 3, "delete", { observed_at: "2020-01-01T00:00:00Z" }),
      ],
      context()
    );
    expect(result.hidden).toBe(true);
    expect(result.selected_authority_id).toBe("delete3");
    expect(result.factual_observations.map((x) => x.id)).toEqual(["fact"]);
  });
  it("keeps ordinary marker values as facts without giving them authority", () => {
    const result = selectEntityLifecycleVisibility(
      [row("ordinary", { source_priority: 999999, fields: { _deleted: true } })],
      context()
    );
    expect(result.hidden).toBe(false);
    expect(result.factual_observations[0].fields).toEqual({ _deleted: true });
  });
  it("pre-migration uses the frozen reducer rank and stable id tie rule", () => {
    const rows = [
      row("b", { fields: { _deleted: false } }),
      row("a", { fields: { _deleted: true } }),
    ];
    expect(selectLegacyEntityVisibility(rows)).toEqual({
      hidden: true,
      selected_observation_id: "a",
    });
    expect(
      selectEntityLifecycleVisibility(rows, {
        acquisition: "complete",
        target,
        mode: "pre_migration",
      }).hidden
    ).toBe(true);
  });
  it("pre-migration refuses populated authority without a cutover", () => {
    expect(() =>
      selectEntityLifecycleVisibility([action("delete", 1, "delete")], {
        acquisition: "complete",
        target,
        mode: "pre_migration",
      })
    ).toThrow(/acquisition/);
  });
  it("cannot transfer another owned target's authority through factual attachment", () => {
    const source = { ...target, id: "ent_source" };
    const result = selectEntityLifecycleVisibility(
      [
        action("source-delete", 1, "delete", { entity_lifecycle_target_id: source.id }),
        row("survivor"),
      ],
      context({ authority_targets: [target, source] })
    );
    expect(result.hidden).toBe(false);
    expect(result.selected_authority_id).toBeNull();
  });
  it.each([
    { entity_lifecycle_kind: null },
    { entity_lifecycle_sequence: -1 },
    { entity_lifecycle_sequence: 1.5 },
    { entity_lifecycle_sequence: Number.MAX_SAFE_INTEGER + 1 },
    { entity_lifecycle_kind: "legacy_hidden" },
    { entity_lifecycle_target_id: "ent_foreign" },
    { user_id: "foreign-owner" },
    { entity_type: "foreign-type" },
    { fields: { _deleted: false } },
  ])("refuses malformed/foreign/contradictory authority %#", (tamper) => {
    expect(() =>
      selectEntityLifecycleVisibility(
        [action("delete", 1, "delete", tamper as Partial<LifecycleObservation>)],
        context()
      )
    ).toThrow(/acquisition/);
  });
  it("refuses duplicate serialized sequence rather than choosing a tie winner", () => {
    expect(() =>
      selectEntityLifecycleVisibility(
        [action("a", 1, "delete"), action("b", 1, "restore")],
        context()
      )
    ).toThrow(/acquisition/);
  });
  it("supports event-only, ingestion-only and mixed AND without applying current state to the past", () => {
    const old = row("fact", {
      observed_at: "2020-01-01T00:00:00Z",
      created_at: "2020-01-01T00:00:00Z",
    });
    const late = action("late", 1, "delete", {
      observed_at: "2021-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
    const base = { mode: "historical", at: "2022-01-01T00:00:00Z" };
    expect(selectEntityLifecycleVisibility([old, late], context(base)).hidden).toBe(true);
    expect(
      selectEntityLifecycleVisibility(
        [old, late],
        context({ mode: "historical", at_ingested: "2022-01-01T00:00:00Z" })
      ).hidden
    ).toBe(false);
    expect(
      selectEntityLifecycleVisibility(
        [old, late],
        context({ ...base, at_ingested: "2022-01-01T00:00:00Z" })
      ).hidden
    ).toBe(false);
  });
  it("fallback admits only immutable legacy membership, not a post-cutover backdated spoof", () => {
    const legacy = row("legacy", {
      observed_at: "2020-01-01T00:00:00Z",
      created_at: "2020-01-01T00:00:00Z",
    });
    const spoof = row("spoof", {
      observed_at: "2020-01-01T00:00:00Z",
      created_at: "2020-01-01T00:00:00Z",
      fields: { _deleted: true },
      source_priority: 9000,
    });
    const certificate = {
      target,
      observation_ids: [legacy.id],
      count: 1,
      sha256: legacyMembershipDigest([legacy.id]),
    };
    const result = selectEntityLifecycleVisibility(
      [legacy, spoof],
      context({ mode: "historical", at: "2022-01-01T00:00:00Z", legacy_memberships: [certificate] })
    );
    expect(result.hidden).toBe(false);
    expect(result.factual_observations).toHaveLength(2);
  });
  it("missing captured legacy member or wrong membership digest refuses historical proof", () => {
    const certificate = {
      target,
      observation_ids: ["erased"],
      count: 1,
      sha256: legacyMembershipDigest(["erased"]),
    };
    expect(() =>
      selectEntityLifecycleVisibility(
        [],
        context({ mode: "historical", legacy_memberships: [certificate] })
      )
    ).toThrow(/acquisition/);
    expect(() =>
      selectEntityLifecycleVisibility(
        [row("erased")],
        context({ mode: "historical", legacy_memberships: [{ ...certificate, sha256: "wrong" }] })
      )
    ).toThrow(/acquisition/);
  });
  it("current acquisition cannot carry historical filters", () => {
    expect(() => selectEntityLifecycleVisibility([], context({ at: when }))).toThrow(/acquisition/);
  });
});
