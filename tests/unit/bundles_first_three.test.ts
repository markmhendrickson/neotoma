/**
 * The first three opt-in schema bundles: crm, engineering, communications.
 *
 * Covers, per bundle:
 *  - the real manifest parses and declares the audited type set (and none of
 *    the zero-usage types the audit excluded);
 *  - every shipped schema passes the schema registry's own registration
 *    validators (R2 identity, reducer/field consistency);
 *  - seeding is idempotent, through the shipped seeder logic;
 *  - in `guided` mode the bundle's types are allowed when the bundle is enabled
 *    and rejected when it is not.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bundlesRootDir,
  bundlesWithSchemas,
  checkAutoCreateAllowed,
  getBundleSchemas,
  parseManifest,
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
  seedBundleSchemas,
  seedEnabledBundleSchemas,
  setBundleEnabled,
} from "../../src/services/bundles/index.js";
import {
  ENTITY_SCHEMAS,
  getSchemaDefinition,
  resolveEntityTypeFromAlias,
  resolveEntityTypeFromRegisteredAliases,
} from "../../src/services/schema_definitions.js";
import {
  SchemaRegistryService,
  type ReducerConfig,
  type SchemaDefinition,
} from "../../src/services/schema_registry.js";
import { resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";

const EXPECTED: Record<string, { provides: string[]; references: string[] }> = {
  crm: {
    provides: [
      "company",
      "person",
      "lead_update",
      "lead_evaluation",
      "opportunity",
      "contact_group",
      "icp",
      "category_membership",
      "outreach_interaction",
    ],
    references: ["contact"],
  },
  engineering: {
    provides: [
      "repository",
      "pull_request",
      "pr_review",
      "pr_comment",
      "issue_spec",
      "security_finding",
      "release_result",
      "deployment_configuration",
      "architectural_decision",
      "bug_report",
    ],
    references: ["issue"],
  },
  communications: {
    provides: ["email_message", "email_thread", "email_draft", "email"],
    references: [],
  },
};

/** Types with built-in definitions in schema_definitions.ts that bundles reuse. */
const REUSED_BUILT_INS = ["company", "person", "pull_request", "issue_spec", "email"];

function readManifest(bundle: string) {
  const file = path.join(bundlesRootDir(), bundle, "manifest.yaml");
  return parseManifest(fs.readFileSync(file, "utf8"), file);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundles-first-three-"));
  process.env.NEOTOMA_BUNDLE_STATE_PATH = path.join(tmpDir, "bundle_state.json");
  delete process.env.NEOTOMA_SCHEMA_MODE;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  resetSchemaModeCacheForTesting();
});

afterEach(() => {
  delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
  delete process.env.NEOTOMA_SCHEMA_MODE;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  resetSchemaModeCacheForTesting();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.each(Object.keys(EXPECTED))("bundle %s", (bundle) => {
  const expected = EXPECTED[bundle];

  it("manifest parses as a schema bundle with the audited type set", () => {
    const m = readManifest(bundle);
    expect(m.name).toBe(bundle);
    expect(m.bundle_type).toBe("schema");
    expect([...m.provides_entity_types].sort()).toEqual([...expected.provides].sort());
    expect(m.references_shared_schemas).toEqual(expected.references);
    expect(m.compatible_modes).toEqual(["evolving", "guided", "locked"]);
    expect(m.serves_use_cases.length).toBeGreaterThan(0);
    // Rules come in a later PR; skills only where an existing one fits.
    expect(m.provides_skills).toEqual([]);
  });

  it("ships exactly one schema per provided type", () => {
    const types = getBundleSchemas(bundle).map((s) => s.entity_type);
    expect([...types].sort()).toEqual([...expected.provides].sort());
  });

  it("every schema passes the registry's registration validators", () => {
    const service = new SchemaRegistryService() as unknown as {
      validateSchemaDefinition(d: SchemaDefinition): void;
      validateReducerConfig(c: ReducerConfig, d: SchemaDefinition): void;
    };
    for (const schema of getBundleSchemas(bundle)) {
      expect(() => service.validateSchemaDefinition(schema.schema_definition)).not.toThrow();
      expect(() =>
        service.validateReducerConfig(schema.reducer_config, schema.schema_definition)
      ).not.toThrow();
    }
  });

  it("reuses built-in definitions instead of duplicating them", () => {
    for (const schema of getBundleSchemas(bundle)) {
      if (REUSED_BUILT_INS.includes(schema.entity_type)) {
        expect(schema).toBe(ENTITY_SCHEMAS[schema.entity_type]);
      } else {
        // Bundle-originated types must NOT be code-level built-ins: a built-in
        // is always present and would bypass the guided-mode gate.
        expect(getSchemaDefinition(schema.entity_type)).toBeNull();
      }
    }
  });

  it("every bundle-originated type has a record-type doc naming each field", () => {
    for (const schema of getBundleSchemas(bundle)) {
      if (REUSED_BUILT_INS.includes(schema.entity_type)) continue;
      const doc = path.join(bundlesRootDir(), bundle, "record_types", `${schema.entity_type}.md`);
      expect(fs.existsSync(doc), `missing ${doc}`).toBe(true);
      const body = fs.readFileSync(doc, "utf8");
      for (const field of Object.keys(schema.schema_definition.fields)) {
        if (field === "schema_version") continue;
        expect(body, `${schema.entity_type}.md lacks field ${field}`).toContain(`\`${field}\``);
      }
    }
  });

  it("seeding is idempotent (second run registers nothing)", async () => {
    const registry = fakeRegistry();
    const first = await seedBundleSchemas(bundle, { registry });
    expect(first.failed).toEqual([]);
    expect([...first.registered].sort()).toEqual([...expected.provides].sort());

    const second = await seedBundleSchemas(bundle, { registry });
    expect(second.registered).toEqual([]);
    expect(second.failed).toEqual([]);
    expect([...second.preserved].sort()).toEqual([...expected.provides].sort());
    expect(registry.registerCalls).toBe(expected.provides.length);
  });

  it("seeding stamps the originating bundle and version on registered rows", async () => {
    const registry = fakeRegistry();
    await seedBundleSchemas(bundle, { registry });
    for (const row of registry.rows.values()) {
      expect(row.metadata?.bundle).toBe(bundle);
      expect(row.metadata?.bundle_version).toBe(readManifest(bundle).version);
    }
  });

  it("guided: the bundle's types are rejected while disabled and allowed once enabled", () => {
    for (const type of expected.provides) {
      const blocked = checkAutoCreateAllowed(type, "guided");
      expect(blocked.allowed, `${type} should be rejected while ${bundle} is disabled`).toBe(false);
      if (!blocked.allowed) expect(blocked.reason).toBe("guided_unprovided");
    }

    setBundleEnabled(bundle, true);
    resetBundleRegistryForTesting();
    for (const type of expected.provides) {
      expect(checkAutoCreateAllowed(type, "guided").allowed, `${type} after enable`).toBe(true);
    }

    setBundleEnabled(bundle, false);
    resetBundleRegistryForTesting();
    for (const type of expected.provides) {
      expect(checkAutoCreateAllowed(type, "guided").allowed, `${type} after disable`).toBe(false);
    }
  });
});

describe("scope exclusions from the usage audit", () => {
  it("crm ships no zero-usage pipeline types", () => {
    const provided = readManifest("crm").provides_entity_types;
    for (const t of ["deal", "account", "engagement", "pipeline_stage"]) {
      expect(provided).not.toContain(t);
    }
  });

  it("communications is email-only (no post/social types)", () => {
    for (const t of readManifest("communications").provides_entity_types) {
      expect(t).toMatch(/^email/);
    }
  });

  it("engineering references issue without taking it from infrastructure", () => {
    expect(readManifest("engineering").provides_entity_types).not.toContain("issue");
    expect(readManifest("infrastructure").provides_entity_types).toContain("issue");
  });
});

describe("store-path interaction with built-in aliases", () => {
  // Without the bundle's registered schema, these names resolve to a built-in
  // via that built-in's alias list before the guided gate is consulted.
  // Seeding on enable is what makes them first-class types. Pinned so a change
  // to the alias lists is a visible, reviewed decision.
  it("only email_message, email_thread and bug_report are shadowed by a built-in alias", () => {
    const shadowed: Record<string, string> = {};
    for (const bundle of bundlesWithSchemas()) {
      for (const schema of getBundleSchemas(bundle)) {
        if (getSchemaDefinition(schema.entity_type)) continue;
        const target = resolveEntityTypeFromAlias(schema.entity_type);
        if (target) shadowed[schema.entity_type] = target;
      }
    }
    expect(shadowed).toEqual({
      email_message: "email",
      email_thread: "email",
      bug_report: "product_feedback",
    });
  });
});

describe("bundle aliases live in the registry's alias field", () => {
  const cases: Array<[bundle: string, alias: string, canonical: string]> = [
    ["crm", "contact_list", "contact_group"],
    ["crm", "outreach_activity", "outreach_interaction"],
    ["engineering", "decision_record", "architectural_decision"],
  ];

  it.each(cases)("%s: %s is on %s's schema_definition.aliases", (bundle, alias, canonical) => {
    const schema = getBundleSchemas(bundle).find((s) => s.entity_type === canonical)!;
    expect(schema.schema_definition.aliases).toContain(alias);
  });

  it.each(cases)(
    "%s: extraction-time resolution maps %s to %s once registered",
    (bundle, alias, canonical) => {
      const registered = getBundleSchemas(bundle);
      expect(resolveEntityTypeFromRegisteredAliases(alias, registered)).toBe(canonical);
      // And not before: built-in alias resolution does not know the name.
      expect(resolveEntityTypeFromAlias(alias)).toBeNull();
    }
  );

  it("registered-alias resolution is case-insensitive and returns null on no match", () => {
    const registered = getBundleSchemas("crm");
    expect(resolveEntityTypeFromRegisteredAliases("Contact_List", registered)).toBe(
      "contact_group"
    );
    expect(resolveEntityTypeFromRegisteredAliases("no_such_alias", registered)).toBeNull();
  });
});

describe("guided rejection names the bundle to enable", () => {
  it("names the declaring bundle when it is not enabled", () => {
    const d = checkAutoCreateAllowed("lead_update", "guided");
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.providingBundle).toBe("crm");
      expect(d.message).toMatch(/bundle "crm", which is not enabled/);
      expect(d.message).toMatch(/manage_bundles/);
    }
  });

  it("keeps the generic message for a type no bundle declares", () => {
    const d = checkAutoCreateAllowed("totally_new_type", "guided");
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.providingBundle).toBeUndefined();
      expect(d.message).toMatch(/no bundle provides this type/i);
    }
  });
});

describe("schema notes the review asked for", () => {
  it("email_message.cc is an array like to_addresses", () => {
    const schema = getBundleSchemas("communications").find(
      (s) => s.entity_type === "email_message"
    )!;
    expect(schema.schema_definition.fields.cc.type).toBe("array");
    expect(schema.schema_definition.fields.to_addresses.type).toBe("array");
  });

  it("deployment_configuration warns about deploy_command provenance and secrets in build_args", () => {
    const fields = getBundleSchemas("engineering").find(
      (s) => s.entity_type === "deployment_configuration"
    )!.schema_definition.fields;
    expect(fields.deploy_command.description).toMatch(/not trusted input/i);
    expect(fields.build_args.description).toMatch(/never store secret values/i);
  });
});

describe("seedEnabledBundleSchemas", () => {
  it("seeds only enabled bundles", async () => {
    setBundleEnabled("crm", true);
    resetBundleRegistryForTesting();
    const registry = fakeRegistry();
    const results = await seedEnabledBundleSchemas({ registry });
    expect(results.map((r) => r.bundle)).toEqual(["crm"]);
    expect(registry.rows.has("lead_update")).toBe(true);
    expect(registry.rows.has("repository")).toBe(false);
    expect(registry.rows.has("email_message")).toBe(false);
  });

  it("seeds nothing when no opt-in bundle is enabled", async () => {
    const registry = fakeRegistry();
    expect(await seedEnabledBundleSchemas({ registry })).toEqual([]);
    expect(registry.registerCalls).toBe(0);
  });
});

/**
 * In-memory stand-in for the schema registry's two seeding methods. `register`
 * runs the REAL registration validators, so a schema that would be refused by
 * a live registry fails here too.
 */
function fakeRegistry() {
  const validators = new SchemaRegistryService() as unknown as {
    validateSchemaDefinition(d: SchemaDefinition): void;
    validateReducerConfig(c: ReducerConfig, d: SchemaDefinition): void;
  };
  const rows = new Map<
    string,
    { schema_version: string; metadata?: { bundle?: string; bundle_version?: string } }
  >();
  const state = {
    rows,
    registerCalls: 0,
    async loadGlobalSchema(entityType: string) {
      return (rows.get(entityType) ?? null) as never;
    },
    async register(config: {
      entity_type: string;
      schema_version: string;
      schema_definition: SchemaDefinition;
      reducer_config: ReducerConfig;
      metadata?: { bundle?: string; bundle_version?: string };
    }) {
      state.registerCalls += 1;
      validators.validateSchemaDefinition(config.schema_definition);
      validators.validateReducerConfig(config.reducer_config, config.schema_definition);
      rows.set(config.entity_type, {
        schema_version: config.schema_version,
        metadata: config.metadata,
      });
      return {} as never;
    },
  };
  return state;
}
