/**
 * Regression: every schema read path must resolve the SAME active row that the
 * write path does, for the same caller (#2356).
 *
 * Two rows can be simultaneously active for one `entity_type`: a global row and
 * a user-scoped row overriding it for one principal. That is the registry's
 * multi-tenancy model — `register` and `activate` partition their deactivation
 * by scope on purpose, so activating a global version never touches a user's
 * override, and vice versa. It is reachable through the ordinary API: an
 * `update_schema_incremental` with `user_specific: false` (the HTTP default)
 * writes a new GLOBAL version while a user's older override stays active.
 *
 * The defect was that resolvers disagreed about which of the pair wins.
 * `loadActiveSchema` prefers the user row and falls back to global — and the
 * write path resolves through exactly that call (`interpretation.ts`), so it is
 * the reference. `listEntityTypes` did not select `scope` at all and collapsed
 * the pair with a last-write-wins Map, so the version it reported depended on
 * row arrival order.
 *
 * The direction of the resulting disagreement FLIPS by entity type, which is
 * why "make the per-type read agree with the list" is the wrong repair: for a
 * type whose user override is NEWER, deferring to the list would regress the
 * caller to an older schema. Both directions are pinned below; `describe`,
 * `list` and the write path must agree with each other in each.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

const USER = "00000000-0000-0000-0000-000000002356";
const OTHER_USER = "00000000-0000-0000-0000-000000002399";

/** Type whose user-scoped override is OLDER than the global row (the `contact` shape). */
const SCOPED_OLDER = `scope_parity_older_${Date.now()}`;
/** Type whose user-scoped override is NEWER than the global row (the `person` shape). */
const SCOPED_NEWER = `scope_parity_newer_${Date.now()}`;
/** Type owned by a DIFFERENT user, used to pin the cross-user disclosure guard. */
const FOREIGN = `scope_parity_foreign_${Date.now()}`;

const DUP_GLOBAL = `scope_parity_dupglobal_${Date.now()}`;
const ALL_TYPES = [SCOPED_OLDER, SCOPED_NEWER, FOREIGN, DUP_GLOBAL];

function fields(names: string[]): Record<string, { type: "string"; required: boolean }> {
  return Object.fromEntries(
    names.map((n) => [n, { type: "string" as const, required: false }])
  ) as Record<string, { type: "string"; required: boolean }>;
}

async function seedRow(opts: {
  entity_type: string;
  schema_version: string;
  field_names: string[];
  scope: "global" | "user";
  user_id: string | null;
}): Promise<void> {
  const { error } = await db.from("schema_registry").insert({
    entity_type: opts.entity_type,
    schema_version: opts.schema_version,
    schema_definition: {
      fields: fields(opts.field_names),
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: Object.fromEntries(
        opts.field_names.map((n) => [n, { strategy: "last_write" }])
      ),
    },
    active: true,
    scope: opts.scope,
    user_id: opts.user_id,
  });
  expect(error).toBeFalsy();
}

/** The version `list_entity_types` reports for one type, for one caller. */
async function listedVersion(entityType: string, userId?: string): Promise<string | undefined> {
  const listed = await schemaRegistry.listEntityTypes(undefined, userId);
  return listed.find((e) => e.entity_type === entityType)?.schema_version;
}

/**
 * The version the WRITE path resolves. `interpretation.ts` resolves the schema
 * it validates against via `loadActiveSchema(entityType, userId)`, so this is
 * the same call the write actually makes — the reference every read must match.
 */
async function writePathVersion(entityType: string, userId?: string): Promise<string | undefined> {
  const schema = await schemaRegistry.loadActiveSchema(entityType, userId);
  return schema?.schema_version;
}

describe("schema scope resolution parity (#2356)", () => {
  beforeAll(async () => {
    // `contact` shape: global 6.4.0 is NEWER, user override 6.2.0 is stale.
    // Global seeded LAST so the pre-fix last-write-wins dedupe picks it and the
    // scoped list disagrees with the scoped write path (see the note below).
    await seedRow({
      entity_type: SCOPED_OLDER,
      schema_version: "6.2.0",
      field_names: ["a"],
      scope: "user",
      user_id: USER,
    });
    await seedRow({
      entity_type: SCOPED_OLDER,
      schema_version: "6.4.0",
      field_names: ["a", "prospect_tier"],
      scope: "global",
      user_id: null,
    });

    // `person` shape: global 1.3.0 is OLDER, user override 1.18.0 is newer.
    // This is the pair that the naive "per-type defers to list" repair regresses.
    //
    // Seed the GLOBAL row LAST here, on purpose. The pre-fix dedupe was a
    // last-write-wins Map over rows in arrival order, so this ordering is what
    // makes the stale global row win and the defect deterministic. With the
    // opposite ordering the old code lands on the right answer by luck, which
    // is precisely why the bug presented as intermittent and why a fixture that
    // did not control ordering would pass against the broken resolver.
    await seedRow({
      entity_type: SCOPED_NEWER,
      schema_version: "1.18.0",
      field_names: ["a", "nickname"],
      scope: "user",
      user_id: USER,
    });
    await seedRow({
      entity_type: SCOPED_NEWER,
      schema_version: "1.3.0",
      field_names: ["a"],
      scope: "global",
      user_id: null,
    });

    // A type that exists ONLY as another user's private override.
    await seedRow({
      entity_type: FOREIGN,
      schema_version: "9.0.0",
      field_names: ["secret_field"],
      scope: "user",
      user_id: OTHER_USER,
    });
  });

  afterAll(async () => {
    for (const t of ALL_TYPES) {
      await db.from("schema_registry").delete().eq("entity_type", t);
    }
  });

  describe("user override is OLDER than global (the `contact` shape)", () => {
    it("list agrees with the write path for the scoped caller", async () => {
      const write = await writePathVersion(SCOPED_OLDER, USER);
      // The write path resolves the user override even though it is older —
      // that is what `store` validates against, so reads must say the same.
      expect(write).toBe("6.2.0");
      expect(await listedVersion(SCOPED_OLDER, USER)).toBe(write);
    });

    it("list reports the global row for a caller with no override", async () => {
      const write = await writePathVersion(SCOPED_OLDER, OTHER_USER);
      expect(write).toBe("6.4.0");
      expect(await listedVersion(SCOPED_OLDER, OTHER_USER)).toBe(write);
    });
  });

  describe("user override is NEWER than global (the `person` shape — the regression trap)", () => {
    it("list agrees with the write path and does NOT regress to the older global row", async () => {
      const write = await writePathVersion(SCOPED_NEWER, USER);
      expect(write).toBe("1.18.0");

      const listed = await listedVersion(SCOPED_NEWER, USER);
      expect(listed).toBe(write);
      // Stated as its own assertion because this is the trap: a fix that made
      // the per-type read defer to the list would land 1.3.0 here and tick
      // every "the two agree" box while silently regressing the caller.
      expect(listed).not.toBe("1.3.0");
    });

    it("exposes the newer override's fields, so a pre-store introspection is not a false negative", async () => {
      const listed = await schemaRegistry.listEntityTypes(undefined, USER);
      const entry = listed.find((e) => e.entity_type === SCOPED_NEWER);
      // `nickname` exists only on the 1.18.0 override. Reporting 1.3.0 told the
      // caller this field did not exist when the write path accepts it — the
      // directionally unsafe failure the issue reports.
      expect(entry?.field_names).toContain("nickname");
    });
  });

  it("an unscoped list reports global rows, never another user's private override", async () => {
    // No principal means no override can apply, so the global row is correct...
    expect(await listedVersion(SCOPED_NEWER)).toBe("1.3.0");
    expect(await listedVersion(SCOPED_OLDER)).toBe("6.4.0");
    // ...and a type that exists only as a foreign user's private schema must not
    // appear at all. Before the fix the unscoped branch applied no scope filter,
    // so it returned every user's rows and let a foreign row win the dedupe.
    expect(await listedVersion(FOREIGN)).toBeUndefined();
  });

  it("does not leak a foreign override to a scoped caller either", async () => {
    expect(await listedVersion(FOREIGN, USER)).toBeUndefined();
  });

  describe("dual-active audit", () => {
    it("reports both seeded pairs and flags only the one whose override is stale", async () => {
      const report = await schemaRegistry.auditDualActiveSchemas();

      const older = report.find((r) => r.entity_type === SCOPED_OLDER);
      expect(older?.global_version).toBe("6.4.0");
      expect(older?.overrides.map((o) => o.schema_version)).toEqual(["6.2.0"]);
      // 6.2.0 < 6.4.0, so this is the shape that made a landed update look
      // like a no-op — the audit must call it out.
      expect(older?.overrides_older_than_global).toBe(true);

      const newer = report.find((r) => r.entity_type === SCOPED_NEWER);
      expect(newer?.global_version).toBe("1.3.0");
      expect(newer?.overrides.map((o) => o.schema_version)).toEqual(["1.18.0"]);
      // 1.18.0 > 1.3.0 — an intentional-looking override, not flagged.
      // A lexical compare would rank "1.18.0" BELOW "1.3.0" and wrongly flag it.
      expect(newer?.overrides_older_than_global).toBe(false);
    });

    it("surfaces duplicate ACTIVE global rows instead of collapsing them", async () => {
      // Two active GLOBAL rows for one type is corruption, not a scope pair —
      // and it is the state the resolver handles worst: `expectSingle` in this
      // adapter errors only on ZERO rows, so `loadGlobalSchema` serves
      // whichever row the unordered SELECT returns first.
      //
      // The audit previously collapsed these last-write-wins, which let it
      // report a `global_version` the resolver does not serve and then flag a
      // healthy override as stale against a version no caller ever sees.
      const DUP = DUP_GLOBAL;
      await seedRow({
        entity_type: DUP, schema_version: "2.0.0",
        field_names: ["a"], scope: "global", user_id: null,
      });
      await seedRow({
        entity_type: DUP, schema_version: "9.0.0",
        field_names: ["a", "b"], scope: "global", user_id: null,
      });
      await seedRow({
        entity_type: DUP, schema_version: "3.0.0",
        field_names: ["a", "c"], scope: "user", user_id: USER,
      });

      const report = await schemaRegistry.auditDualActiveSchemas();
      const dup = report.find((r) => r.entity_type === DUP);

      // Both duplicates reported, ascending, so an operator can see WHICH rows
      // collide rather than only that something is wrong.
      expect(dup?.duplicate_global_versions).toEqual(["2.0.0", "9.0.0"]);
      // Deterministic collapse: highest, not "last row the DB happened to
      // return". Stable across runs regardless of insertion order.
      expect(dup?.global_version).toBe("9.0.0");
      // A type with exactly one global row must NOT carry the field at all.
      expect(
        report.find((r) => r.entity_type === SCOPED_OLDER)?.duplicate_global_versions
      ).toBeUndefined();
    });

    it("ignores an override that has no global row to shadow", async () => {
      const report = await schemaRegistry.auditDualActiveSchemas();
      // FOREIGN exists only as one user's override, so it is not a dual-active
      // pair and must not be reported as one.
      expect(report.find((r) => r.entity_type === FOREIGN)).toBeUndefined();
    });
  });
});

/**
 * `activate` used to run a scope-partitioned deactivation followed by an
 * UNSCOPED activation, so activating a version that exists in both scopes
 * switched BOTH rows on — manufacturing the dual-active pair this issue is
 * about. These pin each half of the partition.
 */
describe("activate stays inside one scope partition (#2356)", () => {
  const T = `activate_scope_${Date.now()}`;

  beforeAll(async () => {
    // Same version string present in BOTH scopes, both inactive.
    for (const [scope, user_id] of [
      ["global", null],
      ["user", USER],
    ] as const) {
      const { error } = await db.from("schema_registry").insert({
        entity_type: T,
        schema_version: "2.0.0",
        schema_definition: {
          fields: fields(["a"]),
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: { merge_policies: {} },
        active: false,
        scope,
        user_id,
      });
      expect(error).toBeFalsy();
    }
  });

  afterAll(async () => {
    await db.from("schema_registry").delete().eq("entity_type", T);
  });

  it("activating the global row leaves the same-version user row inactive", async () => {
    await schemaRegistry.activate(T, "2.0.0");

    const rows = (await db.from("schema_registry").select("scope, active").eq("entity_type", T))
      .data as Array<{ scope: string; active: unknown }>;

    const globalRow = rows.find((r) => r.scope === "global");
    const userRow = rows.find((r) => r.scope === "user");
    // SQLite stores booleans as 0/1, so compare truthiness rather than identity.
    expect(Boolean(globalRow?.active)).toBe(true);
    // The bug: this came back active too, because the activate UPDATE matched
    // on (entity_type, schema_version) with no scope filter.
    expect(Boolean(userRow?.active)).toBe(false);
  });
});
