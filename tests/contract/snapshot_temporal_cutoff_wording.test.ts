/**
 * Pins the public wording of the `retrieve_entity_snapshot` historical cutoffs
 * to the clocks writes actually stamp.
 *
 * Public `store` and `correct` stamp `observed_at` with the server clock at
 * write time, so `at` (which filters `observed_at`) is assertion time, not
 * event or valid time. Calling it an "event-time cutoff" that "reflects what
 * happened by T" told agents a late-arriving fact would be visible at its
 * real-world date; it is not. Every surface an agent reads the contract from
 * must say the same thing: the OpenAPI spec, the Custom GPT Actions spec, the
 * MCP tool input schema derived from it, the MCP tool description (inline
 * fallback and the YAML override the server loads), and the MCP instructions.
 * The end-to-end effect is asserted in
 * tests/integration/temporal_natural_surface_acceptance.test.ts.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import {
  CLI_DEMO_AGENTIC_SCENARIOS_EN,
  CLI_DEMO_API_SCENARIOS_EN,
  CLI_DEMO_CHAT_SCENARIOS_EN,
  CLI_DEMO_CLI_SCENARIOS_EN,
} from "../../frontend/src/i18n/locales/cli_demo_scenarios_en.js";
import {
  CLI_DEMO_AGENTIC_SCENARIOS_ES,
  CLI_DEMO_API_SCENARIOS_ES,
  CLI_DEMO_CHAT_SCENARIOS_ES,
  CLI_DEMO_CLI_SCENARIOS_ES,
} from "../../frontend/src/i18n/locales/cli_demo_scenarios_es.js";
import { FUNCTIONALITY_MATRIX } from "../../frontend/src/site/site_data.js";

import { getOpenApiInputSchemaOrThrow } from "../../src/shared/openapi_schema.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import {
  ACCEPTED_WRITE_TIME_PHRASES,
  ALLOWLIST,
  CATCH_ALL_ACCEPTED,
  CATCH_ALL_PATTERNS,
  CATCH_ALL_SEEDS,
  collapseWhitespace,
  findEventTimeOffenders,
  NOT_EXCUSED_BY_NEARBY_WORDS,
  SEEDED_EVENT_TIME_PHRASES,
  WRITE_TIME_CONTEXT,
} from "../helpers/temporal_wording_patterns.js";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** Wording that describes `at` as world/event time. */
const EVENT_TIME_CLAIM =
  /event[- ]time|what \*?happened\*?|regardless of when the observation was ingested/i;

function snapshotCutoffDescriptions(specPath: string): { at: string; at_ingested: string } {
  const spec = yaml.load(read(specPath)) as {
    paths: Record<
      string,
      {
        post: {
          requestBody: {
            content: Record<
              string,
              { schema: { properties: Record<string, { description?: string }> } }
            >;
          };
        };
      }
    >;
  };
  const props =
    spec.paths["/get_entity_snapshot"]!.post.requestBody.content["application/json"]!.schema
      .properties;
  return { at: props.at!.description ?? "", at_ingested: props.at_ingested!.description ?? "" };
}

function expectAssertionTimeWording(label: string, at: string, atIngested: string) {
  expect(at, `${label}: at`).toMatch(/observed_at/);
  expect(at, `${label}: at`).toMatch(/server clock at write time/);
  expect(at, `${label}: at`).toMatch(/valid-time queries are not supported/);
  expect(at, `${label}: at`).not.toMatch(EVENT_TIME_CLAIM);
  expect(atIngested, `${label}: at_ingested`).toMatch(/created_at/);
  expect(atIngested, `${label}: at_ingested`).toMatch(/not guaranteed to be identical/);
  expect(atIngested, `${label}: at_ingested`).not.toMatch(EVENT_TIME_CLAIM);
}

describe("retrieve_entity_snapshot cutoff wording matches the stamped clocks", () => {
  it("the site snapshot row uses the generic CLI JSON body, including both cutoffs", () => {
    const row = FUNCTIONALITY_MATRIX.find((r) => r.openapi === "POST /get_entity_snapshot");
    expect(row?.cli).toBe("request --operation getEntitySnapshot");
    expect(row?.cliParameters).toEqual(["--body JSON: entity_id, at?, at_ingested?"]);
    const source = read("src/cli/index.ts");
    const requestCommand = source.slice(source.indexOf('.command("request")'));
    expect(requestCommand).toContain('.option("--body <json>", "JSON body override")');
  });
  it.each(["openapi.yaml", "openapi_actions.yaml"])(
    "%s describes `at` as assertion time",
    (spec) => {
      const d = snapshotCutoffDescriptions(spec);
      expectAssertionTimeWording(spec, d.at, d.at_ingested);
    }
  );

  it("openapi.yaml and openapi_actions.yaml carry identical cutoff descriptions", () => {
    expect(snapshotCutoffDescriptions("openapi_actions.yaml")).toEqual(
      snapshotCutoffDescriptions("openapi.yaml")
    );
  });

  it("the MCP input schema derived from OpenAPI carries the same wording", () => {
    const props = (
      getOpenApiInputSchemaOrThrow("retrieve_entity_snapshot") as {
        properties: Record<string, { description?: string }>;
      }
    ).properties;
    expectAssertionTimeWording(
      "mcp inputSchema",
      props.at!.description ?? "",
      props.at_ingested!.description ?? ""
    );
  });

  it("the MCP tool description (inline fallback and YAML override) agree and make no event-time claim", () => {
    const inline = buildToolDefinitions().find(
      (t) => t.name === "retrieve_entity_snapshot"
    )!.description;
    const overrides = yaml.load(read("docs/developer/mcp/tool_descriptions.yaml")) as Record<
      string,
      Record<string, string>
    >;
    const yamlText = Object.values(overrides)
      .map((section) => section?.retrieve_entity_snapshot)
      .find((v): v is string => typeof v === "string");
    expect(yamlText).toBeDefined();
    expect(yamlText!.trim()).toBe(inline);
    expect(inline).toMatch(/observed_at/);
    expect(inline).toMatch(/server clock at write time/);
    expect(inline).toMatch(/at_ingested' filters on created_at/);
    expect(inline).not.toMatch(EVENT_TIME_CLAIM);
  });

  it("the MCP instructions make no event-time claim for `at`", () => {
    const line = read("docs/developer/mcp/instructions.md")
      .split("\n")
      .find((l) => l.includes("use retrieve_entity_snapshot for current or historical"));
    expect(line).toBeDefined();
    expect(line).toMatch(/observed_at/);
    expect(line).toMatch(/server clock at write time: assertion time, not world time/);
    expect(line).toMatch(/at_ingested.*created_at/);
    expect(line).toMatch(/both bounds AND/);
    expect(line).toMatch(/measured_at.*ordinary fields/);
    expect(line).toMatch(/native valid-time queries are not supported/);
    expect(line).not.toMatch(EVENT_TIME_CLAIM);

    const limitations = read("docs/known_limitations.md").split("### Export carries current state only")[0]!;
    expect(limitations).toMatch(/`at` filters `observed_at`/);
    expect(limitations).toMatch(/server clock when they write the observation/);
    expect(limitations).toMatch(/\[#2700\]\([^)]*\) for record-wide as-of reads/);
    expect(limitations).toMatch(/\[#2034\]\([^)]*\) for valid-time intervals/);
    expect(limitations).not.toMatch(/`at` \(event time\)/);
  });
});

/**
 * Public replay demos show `at` on the home CLI/agent/API/chat demos. They must
 * describe what had been recorded by a write-time checkpoint, never the world
 * state at an event time.
 */
describe("public replay demos describe `at` as assertion time", () => {
  const replayDemos = (
    label: string,
    sets: Record<string, Array<{ label: string }>>,
    recorded: RegExp,
    eventTimeClaim: RegExp
  ) => {
    describe(label, () => {
      it.each(Object.entries(sets))("%s replay scenario", (name, scenarios) => {
        const replay = scenarios.filter((s) => /replay|reproducci/i.test(s.label));
        expect(replay.length, `${name}: replay scenario present`).toBeGreaterThan(0);
        for (const scenario of replay) {
          const text = JSON.stringify(scenario);
          expect(text, `${name}: states what was recorded`).toMatch(recorded);
          expect(text, `${name}: no event-time claim`).not.toMatch(eventTimeClaim);
        }
      });
    });
  };

  replayDemos(
    "en",
    {
      cli: CLI_DEMO_CLI_SCENARIOS_EN,
      agentic: CLI_DEMO_AGENTIC_SCENARIOS_EN,
      api: CLI_DEMO_API_SCENARIOS_EN,
      chat: CLI_DEMO_CHAT_SCENARIOS_EN,
    },
    /recorded by/,
    /State at \d|state at that time|at a specific point in time|what did the agent (believe|see)|At the time of run/
  );
  replayDemos(
    "es",
    {
      cli: CLI_DEMO_CLI_SCENARIOS_ES,
      agentic: CLI_DEMO_AGENTIC_SCENARIOS_ES,
      api: CLI_DEMO_API_SCENARIOS_ES,
      chat: CLI_DEMO_CHAT_SCENARIOS_ES,
    },
    /registrad/,
    /Estado en \d|en ese momento|instante concreto|cre[\u00ed]a el agente|vio el agente|En el momento de/
  );
});

/**
 * Sweep of every shipped copy surface (all of frontend/src and docs/site, every
 * locale). `at` filters write time, so no copy may promise that a query returns
 * what was TRUE, VALID or IN EFFECT at a past date (event time). A phrase that
 * is true under write-time semantics ("as recorded by", "had been recorded")
 * stays; a phrase that promises event time fails here. Event-time queries are
 * not supported (#2034), see docs/known_limitations.md.
 */
describe("public copy never promises event-time (valid-time) answers", () => {
  const COPY_ROOTS = ["frontend/src", "docs/site"];
  const COPY_EXT = /\.(tsx?|mdx?|ya?ml|json)$/;
  const SKIP_DIR = /(^|\/)(node_modules|generated|dist)(\/|$)/;

  const walk = (rel: string): string[] =>
    readdirSync(join(root, rel), { withFileTypes: true }).flatMap((entry) => {
      const child = `${rel}/${entry.name}`;
      if (SKIP_DIR.test(child)) return [];
      if (entry.isDirectory()) return walk(child);
      return COPY_EXT.test(entry.name) ? [child] : [];
    });

  const files = COPY_ROOTS.flatMap(walk).sort();

  it("scans a non-trivial set of copy files, including Spanish and docs", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("frontend/src/components/subpages/TradingLandingPage.tsx");
    expect(files).toContain("frontend/src/site/faq_items_es.ts");
    expect(files).toContain("docs/site/pages/en/replayable-timeline.md");
    expect(files).toContain("docs/site/pages/en/faq.md");
  });

  it("the pattern set fires on every event-time phrase reviewers quoted", () => {
    for (const phrase of SEEDED_EVENT_TIME_PHRASES) {
      expect(findEventTimeOffenders(phrase).length, `pattern set must catch: ${phrase}`).toBeGreaterThan(0);
    }
  });

  it("the catch-all family alone flags every seeded promise-verb plus event-anchor line", () => {
    for (const phrase of CATCH_ALL_SEEDS) {
      expect(
        findEventTimeOffenders(phrase, CATCH_ALL_PATTERNS).length,
        `catch-all must catch: ${phrase}`
      ).toBeGreaterThan(0);
    }
  });

  it("the catch-all family leaves write-time and promise-free lines alone", () => {
    for (const phrase of CATCH_ALL_ACCEPTED) {
      expect(findEventTimeOffenders(phrase, CATCH_ALL_PATTERNS), `must accept: ${phrase}`).toEqual([]);
    }
  });

  it("write-time wording is accepted", () => {
    for (const phrase of ACCEPTED_WRITE_TIME_PHRASES) {
      expect(findEventTimeOffenders(phrase), `must accept: ${phrase}`).toEqual([]);
    }
  });

  it("a nearby unrelated 'stored' or 'recorded' in another clause cannot excuse an event-time promise", () => {
    for (const phrase of NOT_EXCUSED_BY_NEARBY_WORDS) {
      expect(findEventTimeOffenders(phrase).length, `must still flag: ${phrase}`).toBeGreaterThan(0);
    }
  });

  it("every reviewed exemption still matches a real copy line (no stale or broad exemption)", () => {
    const corpus = files.map((f) => collapseWhitespace(read(f))).join("\n");
    for (const entry of ALLOWLIST) {
      expect(entry.test(corpus), `exemption matches no copy line: ${entry}`).toBe(true);
    }
  });

  it("no copy file promises event-time (valid-time) answers", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const o of findEventTimeOffenders(read(file))) {
        offenders.push(`${file} [${o.label}]: ...${o.context}...`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every 'Temporal snapshots so ...' guarantee bullet itself states write-time semantics", () => {
    const bullets: Array<{ file: string; line: string }> = [];
    for (const file of files) {
      if (!/\.tsx?$/.test(file)) continue;
      for (const line of read(file).split("\n")) {
        if (/Temporal snapshots so/.test(line)) bullets.push({ file, line: line.trim() });
      }
    }
    expect(bullets.length).toBeGreaterThanOrEqual(8);
    expect(bullets.map((b) => b.file)).toContain(
      "frontend/src/components/subpages/TradingLandingPage.tsx"
    );
    expect(bullets.map((b) => b.file)).toContain(
      "frontend/src/components/subpages/agent_auth_landing_body.tsx"
    );
    for (const { file, line } of bullets) {
      expect(line, `${file}: bullet must state recorded-by semantics`).toMatch(WRITE_TIME_CONTEXT);
    }
  });
});
