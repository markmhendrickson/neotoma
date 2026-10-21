import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isRetiredRoute,
  resolveDestination,
} from "../../frontend/src/site/route_retirement";
import { resolveSeoMetadata } from "../../frontend/src/site/seo_metadata";
import {
  EVALUATE_SUBPAGE_EN,
  EVALUATE_SUBPAGE_ES,
} from "../../frontend/src/i18n/locales/evaluate_subpage_strings";

/**
 * Guards for the served-site statements the shipping-commit claims check found wrong on the published
 * package (neotoma@0.25.0). Each one states current behaviour in plain words, so it is easy to relax
 * when the product behaviour changes. scripts/validate_site_export.ts repeats the page-level checks on the
 * built HTML. Revert-check: put any retired statement back into its source and the matching test goes red.
 */
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf-8");

describe("one-pager sheets 02 to 04", () => {
  const page = read("frontend", "src", "components", "onepager", "NeotomaOnePager.tsx");
  const copy = read("frontend", "src", "components", "onepager", "onepager_copy.ts");
  it("prints the sheet 03 commands with the dev prefix and does not claim ids from one run", () => {
    for (const cmd of ["neotoma dev store", "neotoma dev corrections create", "neotoma dev entities get", "neotoma dev observations list"]) {
      expect(copy, cmd).toContain(cmd);
    }
    expect(copy).not.toMatch(/^\$ neotoma (store|corrections|entities|observations)/m);
    expect(page).toContain("Store observation ids differ");
    expect(page).not.toMatch(/ids are from one run/i);
  });
  it("limits the shared record to agents on the same MCP entry", () => {
    expect(page).toContain("Agents connected to the same MCP entry");
    expect(copy).toContain("when it is connected to the same MCP entry");
    expect(page + copy).not.toMatch(/what one agent stored is what the next one reads/i);
    expect(page + copy).not.toMatch(/same instance/i);
  });
});

describe("/install", () => {
  const strings = read("frontend", "src", "i18n", "locales", "install_page_strings.ts");
  const en = strings.slice(strings.indexOf("export const INSTALL_PAGE_EN"), strings.indexOf("export const INSTALL_PAGE_ES"));
  it("describes what init and setup write, and the npm_check_update tool", () => {
    expect(en).not.toMatch(/Optional prompts/i);
    expect(en).toContain("two local SQLite databases");
    expect(en).toContain("~/.cursor/mcp.json");
    expect(en).toContain("neotoma init --interactive");
    expect(en).toContain("two MCP entries (neotoma-dev and neotoma");
    expect(en).toContain("5 hooks");
    expect(en).toContain("12 user-level skills");
    expect(en).toContain("~/.claude/settings.json");
    expect(en).toContain("npm_check_update");
    expect(en).toContain("is not turned off by NO_UPDATE_NOTIFIER");
  });
  it("points at blocks that exist", () => {
    expect(strings).not.toMatch(/pre-flight block above|activation sequence linked below/i);
  });
  it("keeps the HowTo to the three visible install lines", () => {
    const steps = resolveSeoMetadata("/install").jsonLd.flatMap((e) => (e["@type"] === "HowTo" ? (e["step"] as { text: string }[]) : []));
    expect(steps).toHaveLength(3);
    const joined = steps.map((s) => s.text).join(" ");
    expect(joined).toContain("neotoma init");
    expect(joined).toContain("--tool claude-code");
    expect(joined).not.toContain("--tool cursor");
  });
});

describe("/evaluate below the first screen and the agent instructions page", () => {
  const retired =
    /reconstruct|state layer|replay|conflict detection|deterministic state evolution|audit trail|inference variance|log archaeology|context janitor|shadow-mode|non-destructive|memory guarantees/i;
  it("carries none of the retired comparison, facets or reconstruct wording in either locale", () => {
    for (const [name, pack] of [["EN", EVALUATE_SUBPAGE_EN], ["ES", EVALUATE_SUBPAGE_ES]] as const) {
      // The scorecard template stays English in both packs and is checked as text like the rest.
      expect(JSON.stringify(pack), name).not.toMatch(retired);
      expect("taxHeading" in pack, name).toBe(false);
      expect("comparesHeading" in pack, name).toBe(false);
    }
  });
  it("renders no comparison, tax or memory-guarantees section", () => {
    const page = read("frontend", "src", "components", "subpages", "EvaluatePage.tsx");
    expect(page).not.toMatch(/taxHeading|comparesHeading|memory-guarantees|non-destructive-testing/);
  });
  it("sends agents to the README and known limitations, not to retired pages", () => {
    const page = read("frontend", "src", "components", "subpages", "EvaluateAgentInstructionsPage.tsx");
    expect(page).not.toMatch(/reconstruct|memory-guarantees|non-destructive-testing|shadow-mode|shadow mode/i);
    expect(page).toContain("docs/known_limitations.md");
    const nav = read("frontend", "src", "site", "site_data.ts") + read("src", "services", "root_landing", "site_nav.ts");
    expect(nav).not.toContain("Where the tax shows up");
    expect(read("frontend", "src", "site", "site_data.ts")).not.toContain("ingest -> reconstruct");
  });
});

describe("404 page and the old shell footer", () => {
  it("do not offer the memory guarantees page", () => {
    const notFound = read("frontend", "src", "components", "NotFound.tsx");
    expect(notFound).not.toMatch(/Memory guarantees|state guarantees|memory-guarantees/i);
    expect(read("frontend", "src", "components", "SiteTailpiece.tsx")).not.toMatch(/MemoryGuarantees|memory-guarantees/);
  });
});

describe("skills and sandbox", () => {
  it("retitle the skills pages, drop the dead links and say record, not memory", () => {
    expect(resolveSeoMetadata("/skills").title).not.toMatch(/Agent Memory/i);
    expect(resolveSeoMetadata("/skills").description).not.toMatch(/memory/i);
    for (const slug of ["remember-email", "remember-calendar"]) {
      expect(resolveSeoMetadata(`/skills/${slug}`).description, slug).not.toMatch(/memory/i);
    }
    const catalog = read("frontend", "src", "site", "skills_catalog.ts");
    expect(catalog).not.toMatch(/googleworkspace\/mcp-|persistent memory/);
    const index = read("frontend", "src", "components", "subpages", "SkillsIndexPage.tsx");
    expect(index).not.toMatch(/markNZed|teach your agent to remember|Neotoma memory/);
    expect(index).toContain("github.com/markmhendrickson/neotoma/tree/main/skills");
    // The page every skill links to as a related skill is generated, so the internal link resolves.
    expect(resolveSeoMetadata("/skills/recover-sqlite-database").title).toContain("Recover SQLite Database");
    expect(read("frontend", "src", "components", "subpages", "SandboxLandingPage.tsx")).not.toContain("your memory to persist");
  });
});

describe("markdown mirrors of retired pages", () => {
  it("are redirect stubs that go where the source page goes", () => {
    for (const source of ["/auditable-change-log", "/replayable-timeline", "/deterministic-memory", "/memory-guarantees"]) {
      expect(isRetiredRoute(source), source).toBe(true);
      expect(isRetiredRoute(`/markdown${source}`), `/markdown${source}`).toBe(true);
      expect(resolveDestination(`/markdown${source}`).url).toBe(resolveDestination(source).url);
    }
  });
  it("stay served while the source page is served", () => {
    for (const route of ["/markdown", "/markdown/install", "/markdown/evaluate", "/markdown/evaluate/agent-instructions", "/markdown/skills", "/markdown/skills/ensure-neotoma", "/markdown/privacy", "/markdown/terms", "/markdown/sandbox", "/markdown/meet"]) {
      expect(isRetiredRoute(route), route).toBe(false);
    }
  });
});

describe("sheet 06 limits", () => {
  const copy = read("frontend", "src", "components", "onepager", "onepager_copy.ts");
  const expect_ = copy.slice(copy.indexOf("export const EXPECTATIONS"), copy.indexOf("export const NOT_BUILT_YET"));
  const gaps = copy.slice(copy.indexOf("export const NOT_BUILT_YET"), copy.indexOf("/** Scope, stated"));
  const page = read("frontend", "src", "components", "onepager", "NeotomaOnePager.tsx");
  it("keeps what Neotoma is and how it is used apart from the gaps", () => {
    for (const title of ["A record is a working commitment.", "Provenance is a trail, not a verdict.", "Not a chat log or a vector store."]) {
      expect(expect_, title).toContain(title);
      expect(gaps, title).not.toContain(title);
    }
    expect(page).toContain("What to expect");
    expect(page).toContain("Not built yet");
  });
  it("names the four gaps in the essay's order, with their substance", () => {
    const order = [
      "Reading the whole record as it stood at a past date.",
      "Moving a record between instances with its history.",
      "Corrections that always hold.",
      "Verified authorship for every write.",
    ].map((title) => gaps.indexOf(title));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(gaps).toContain("One entity can be read as of a past time today.");
    expect(gaps).toContain("Observation history stays in the instance it was recorded in.");
    expect(gaps).toContain("A later ordinary write can replace a correction.");
    expect(gaps).toContain("Attribution is verified only for signed requests.");
    expect(gaps).toContain("the name is the writer's own report");
    expect(gaps).toContain("some write paths, such as the CLI, record no writer");
  });
  it("states one operator per instance as scope, not as a gap, and carries no issue numbers", () => {
    expect(copy).toContain('SCOPE_SENTENCE = "One operator per instance is the scope today."');
    expect(gaps).not.toMatch(/one operator|organizations, workspaces|rules for who may correct|Authority over the record/i);
    expect(page).toContain("known_limitations.md");
    expect(expect_ + gaps).not.toMatch(/#\d{3,}|issue \d{3,}/i);
  });
});
