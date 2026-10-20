import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

/**
 * Text guards for the agent-facing llms.txt body and the README's checkable claims.
 *
 * The body of llms.txt is read by agents without a browser, so a claim in it that the build
 * does not support is repeated as fact. These checks fail when a retired frame or an
 * unsupported claim returns. The Links block has its own checks in site_route_retirement.test.ts.
 *
 * Deliberately no pattern for "as of" or "point in time": llms.txt states that a snapshot can
 * be read as of a past time for one entity, which is true, and that wording must stay allowed.
 */

const root = join(__dirname, "..", "..");

function llmsBody(text: string): string {
  const i = text.indexOf("## Links");
  return i < 0 ? text : text.slice(0, i);
}

const BANNED_BODY_PATTERNS: readonly RegExp[] = [
  /malformed writes/i,
  /append-only/i,
  /\bimmutable\b/i,
  /\breplay/i,
  /state layer/i,
  /memory layer/i,
  /deterministic state/i,
  /reproducible/i,
  /never (silently )?mutat/i,
  /silent mutation/i,
  /same observations always/i,
  /no cloud sync/i,
];

function bannedBodyMatches(body: string): string[] {
  return BANNED_BODY_PATTERNS.filter((re) => re.test(body)).map((re) => String(re));
}

/** Fragments every "no telemetry" statement must carry: both update checks, both opt-outs, what is sent. */
export const TELEMETRY_REQUIRED_FRAGMENTS: readonly RegExp[] = [
  /npm registry/i,
  /about once a day/i,
  /when a session starts/i,
  /about every 6 hours/i,
  /NO_UPDATE_NOTIFIER=1/,
  /--no-update-check/,
  /applies to the CLI only/i,
  /only the package name/i,
  /connection metadata/i,
];

/** Every "no telemetry" statement must sit in a line that carries all the fragments above. */
function telemetryLinesMissingUpdateCheck(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => /no telemetry/i.test(l) && !TELEMETRY_REQUIRED_FRAGMENTS.every((re) => re.test(l)));
}

describe("llms.txt body claims", () => {
  const raw = readFileSync(join(root, "frontend/public/llms.txt"), "utf-8");
  const body = llmsBody(raw);

  it("contains no retired frame or unsupported claim", () => {
    expect(bannedBodyMatches(body)).toEqual([]);
  });

  it("goes red when an old claim comes back", () => {
    for (const old of [
      "Schema constraints: entities validated against defined types, malformed writes rejected",
      "Neotoma uses append-only observation logs",
      "An immutable, timestamped fact",
      "Replayable timeline: replay observations to reconstruct any historical state",
      "Deterministic state layer for long-running AI agents",
      "a persistent memory layer",
      "Same observations always produce the same entity state",
      "Local-first: data stays on your machine, no cloud sync",
    ]) {
      expect(bannedBodyMatches(`${body}\n- ${old}\n`).length, old).toBeGreaterThan(0);
    }
  });

  it("states no telemetry only together with the npm update check", () => {
    expect(body).toMatch(/no telemetry/i);
    expect(telemetryLinesMissingUpdateCheck(body)).toEqual([]);
    expect(telemetryLinesMissingUpdateCheck(`${body}\n- Local-first. No telemetry.\n`)).toHaveLength(1);
    // The earlier wording named only the CLI and the 6-hour MCP check: it must now fail.
    const old =
      "- Local-first. No telemetry. The interactive CLI checks the npm registry for a newer version once a day (off with `--no-update-check` or `NO_UPDATE_NOTIFIER=1`), and the MCP server over stdio checks about every 6 hours (off with `NO_UPDATE_NOTIFIER=1`). Only the package name is sent.";
    expect(telemetryLinesMissingUpdateCheck(`${body}\n${old}\n`)).toHaveLength(1);
  });

  it("links the override issue by full URL", () => {
    expect(body).toContain("https://github.com/markmhendrickson/neotoma/issues/2033");
    expect(body).not.toMatch(/issue #2033/);
  });

  it("keeps the category line, the lead contrast and the stated limits", () => {
    expect(body).toContain("The system of record for AI agents");
    expect(body).toContain("A record, not recall");
    expect(body).toMatch(/^## Limits$/m);
    const limits = body.slice(body.indexOf("## Limits"));
    expect(limits).toMatch(/Export writes current state/);
    expect(limits).toMatch(/for one entity/);
    expect(limits).toMatch(/not checked against their types/);
  });

  it("is byte-identical to the copy served from site_pages", () => {
    expect(readFileSync(join(root, "site_pages/llms.txt"), "utf-8")).toBe(raw);
  });
});

describe("README checkable claims", () => {
  const readme = readFileSync(join(root, "README.md"), "utf-8");

  it("states the MCP tool count the build exposes", () => {
    const m = /exposes (\d+) MCP tools/.exec(readme);
    expect(m, "README must state the MCP tool count").not.toBeNull();
    expect(Number(m![1])).toBe(NEOTOMA_TOOL_NAMES.length);
  });

  it("opens with the lead contrast and the category sentence", () => {
    const head = readme.slice(0, 600);
    expect(head).toContain("**A record, not recall.**");
    expect(head).toContain("Neotoma is the system of record for AI agents.");
  });

  it("states no telemetry only with the full update-check wording", () => {
    const lines = readme.split("\n").filter((l) => /no telemetry/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const re of TELEMETRY_REQUIRED_FRAGMENTS) expect(re.test(l), `${re}: ${l.slice(0, 80)}`).toBe(true);
    }
  });

  it("says no observation is overwritten, not that nothing is", () => {
    expect(readme).toContain("No observation is overwritten by a later write.");
    expect(readme).not.toContain("Nothing is overwritten by a later write.");
  });

  it("explains what setup writes for Claude Code and Cursor permissions", () => {
    expect(readme).toMatch(/`neotoma setup --tool claude-code --yes` writes the MCP entry/);
    expect(readme).toContain(".claude/settings.local.json");
    expect(readme).toContain(".cursor/allowlist.json");
    expect(readme).toContain("`--skip-permissions`");
  });

  it("has no em dash and no retired category frame", () => {
    expect(readme).not.toMatch(/—/);
    expect(readme).not.toMatch(/memory layer|a state layer|your agents forget/i);
  });
});
