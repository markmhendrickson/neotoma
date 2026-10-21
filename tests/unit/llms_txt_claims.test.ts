import { existsSync, readFileSync } from "node:fs";
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
 *
 * Specific, issue-level limits live in one place, docs/known_limitations.md. The README and both
 * llms.txt copies link to it exactly once and must not carry those limits inline, so a limit is
 * removed in one file when its fix ships.
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

/** The one place specific limits live. README and llms.txt link here exactly once. */
export const KNOWN_LIMITATIONS_PATH = "docs/known_limitations.md";
const KNOWN_LIMITATIONS_URL = `https://github.com/markmhendrickson/neotoma/blob/main/${KNOWN_LIMITATIONS_PATH}`;

/**
 * Issue-level limits that moved to docs/known_limitations.md: the correction-override clause
 * (#2033) and the wrong-type write line. Neither may come back inline in README or llms.txt.
 */
const INLINE_LIMIT_PATTERNS: readonly RegExp[] = [
  /issues\/2033\b/,
  /#2033\b/,
  /later write can (still )?override a correction/i,
  /not checked against (their|its) types?/i,
  /value of the wrong type/i,
];

function inlineLimitMatches(text: string): string[] {
  return INLINE_LIMIT_PATTERNS.filter((re) => re.test(text)).map((re) => String(re));
}

/** The maturity label retired by operator ruling; state the facts instead. */
const PREVIEW_LABEL = /developer preview/i;

/** The lede contrast (operator-approved wording). README and both llms.txt copies carry it. */
export const LEDE_CONTRAST =
  "Without one, an agent works from whatever it happens to recall: part of the last session, a note its tool saved, or nothing. With one, it reads what was stored, from which source, and what is current now, so the agents you connect can defer to one answer.";

/** The retired contrast overstated recall ("recalls only what it was last told"). */
const OLD_CONTRAST = /last told|recalls only|recall holds/i;

/**
 * The unscoped observation-ID claim (#2681): source and observation IDs can differ between
 * instances (the CLI's per-install user, interpretation runs), so no surface may say they match.
 */
const UNSCOPED_OBSERVATION_ID_CLAIMS: readonly RegExp[] = [
  /(same|identical|stable|portable|matching) (source and )?observation ids?[^.]{0,60}\b(across|between|in (two|separate|every|each|different))\b[^.]{0,30}\b(instances?|installs?|data directories|runs?)/i,
  /observation ids?[^.]{0,40}\b(are|stay|remain|is) (the same|identical|stable|portable)\b[^.]{0,30}\b(across|between)\b/i,
  /ordinary structured store (also )?gives the same observation id/i,
];

function unscopedObservationIdClaims(text: string): string[] {
  return UNSCOPED_OBSERVATION_ID_CLAIMS.filter((re) => re.test(text)).map((re) => String(re));
}

/**
 * Surface-parity and attribution overclaims a claims check found false: the MCP and REST store
 * handlers are separate implementations, and attribution is self-reported or absent unless the
 * writer signs its requests.
 */
const SURFACE_AND_ATTRIBUTION_OVERCLAIMS: readonly RegExp[] = [
  /all backed by the same operations/i,
  /same contract across (CLI and MCP|MCP and CLI)/i,
  /every write is attributed/i,
  /answerable rather than asserted/i,
  /agents perform the same operations/i,
];

/**
 * The inverted ID-condition sentence arch caught: the HTTP server (and so the CLI) runs in
 * `local_sandbox` mode by default with a per-install user; only the stdio MCP server uses the
 * shared local development user.
 */
const INVERTED_ID_CONDITION: readonly RegExp[] = [
  /ordinary local run[^.]{0,120}shared local development user/i,
  /(HTTP server|CLI)\b(?:(?!MCP)[^.]){0,60}\b(writes|runs|requests?) (as|under|with) the shared (local development|default) user/i,
  /when the HTTP server resolves its mode to `local_sandbox`/i,
];

function invertedIdCondition(text: string): string[] {
  return INVERTED_ID_CONDITION.filter((re) => re.test(text)).map((re) => String(re));
}

/** Count the paths under `paths:` in openapi.yaml (two-space-indented keys starting with `/`). */
function openApiPathCount(yaml: string): number {
  const body = yaml.slice(yaml.indexOf("\npaths:\n") + 1);
  const end = body.search(/\n\S/);
  return (body.slice(0, end === -1 ? undefined : end).match(/^  \//gm) ?? []).length;
}

function surfaceOverclaims(text: string): string[] {
  return SURFACE_AND_ATTRIBUTION_OVERCLAIMS.filter((re) => re.test(text)).map((re) => String(re));
}

const OLD_OBSERVATION_ID_SENTENCES = [
  "An ordinary structured store also gives the same observation ID for the same input.",
  "Observation IDs are the same across instances for the same input.",
  "The same input gives identical observation IDs in two separate data directories.",
];

/** GitHub's heading anchor: lowercase, drop punctuation except hyphens and spaces, spaces to hyphens. */
function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 \-_]/g, "")
    .replace(/ /g, "-");
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
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
  /`npm_check_update` MCP tool/,
  /not turned off by `NO_UPDATE_NOTIFIER`/,
];

/** Every "no telemetry" statement must sit in a line that carries all the fragments above. */
function telemetryLinesMissingUpdateCheck(body: string): string[] {
  return body
    .split("\n")
    .filter(
      (l) => /no telemetry/i.test(l) && !TELEMETRY_REQUIRED_FRAGMENTS.every((re) => re.test(l))
    );
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
    expect(
      telemetryLinesMissingUpdateCheck(`${body}\n- Local-first. No telemetry.\n`)
    ).toHaveLength(1);
    // The earlier wording named only the CLI and the 6-hour MCP check: it must now fail.
    const old =
      "- Local-first. No telemetry. The interactive CLI checks the npm registry for a newer version once a day (off with `--no-update-check` or `NO_UPDATE_NOTIFIER=1`), and the MCP server over stdio checks about every 6 hours (off with `NO_UPDATE_NOTIFIER=1`). Only the package name is sent.";
    expect(telemetryLinesMissingUpdateCheck(`${body}\n${old}\n`)).toHaveLength(1);
  });

  it("links the known-limitations doc exactly once, from the Limits section", () => {
    expect(countOccurrences(raw, KNOWN_LIMITATIONS_URL)).toBe(1);
    expect(existsSync(join(root, KNOWN_LIMITATIONS_PATH))).toBe(true);
    const limits = body.slice(body.indexOf("## Limits"));
    expect(limits).toMatch(/^- Known limitations\b.*$/m);
    expect(limits).toContain(KNOWN_LIMITATIONS_URL);
  });

  it("carries no issue-level limit inline, and goes red when one comes back", () => {
    expect(inlineLimitMatches(raw)).toEqual([]);
    for (const old of [
      "- A later write can override a correction in the current snapshot (open issue https://github.com/markmhendrickson/neotoma/issues/2033)",
      "- Field values are not checked against their types on write today; a value of the wrong type can be accepted into the snapshot",
    ]) {
      expect(inlineLimitMatches(`${body}\n${old}\n`).length, old).toBeGreaterThan(0);
    }
  });

  it("does not claim observation IDs match across instances", () => {
    expect(unscopedObservationIdClaims(raw)).toEqual([]);
  });

  it("makes no surface-parity or attribution overclaim", () => {
    expect(surfaceOverclaims(raw)).toEqual([]);
  });

  it("does not use the developer preview label", () => {
    expect(raw).not.toMatch(PREVIEW_LABEL);
    expect(PREVIEW_LABEL.test(`${body}\n- Neotoma is in developer preview.\n`)).toBe(true);
  });

  it("keeps the category line, the lead contrast and the stated limits", () => {
    expect(body).toContain("The system of record for AI agents");
    expect(body).toContain("A record, not recall");
    expect(body).toContain(`A record, not recall. ${LEDE_CONTRAST}`);
    expect(body).not.toMatch(OLD_CONTRAST);
    expect(OLD_CONTRAST.test(`${body}\nAn agent's recall holds what it was last told.\n`)).toBe(
      true
    );
    expect(body).toMatch(/^## Limits$/m);
    const limits = body.slice(body.indexOf("## Limits"));
    expect(limits).toMatch(/Export writes current state/);
    expect(limits).toMatch(/for one entity/);
  });

  it("does not claim the record shows who corrected a value", () => {
    expect(body).not.toMatch(/who corrected it/i);
  });

  it("is byte-identical to the copy served from site_pages", () => {
    expect(readFileSync(join(root, "site_pages/llms.txt"), "utf-8")).toBe(raw);
  });
});

describe("README checkable claims", () => {
  const readme = readFileSync(join(root, "README.md"), "utf-8");

  it("states the MCP tool count on main and names the published version it differs from", () => {
    const m = /exposes (\d+) MCP tools on `main` \((\d+) in the published v(\d+\.\d+\.\d+)\)/.exec(
      readme
    );
    expect(
      m,
      "README must state the MCP tool count on main and in the published release"
    ).not.toBeNull();
    expect(Number(m![1])).toBe(NEOTOMA_TOOL_NAMES.length);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
      version: string;
    };
    expect(m![3]).toBe(pkg.version);
    // The old wording claimed main's count for the published release.
    expect(readme).not.toMatch(/MCP tools \(as of v\d/);
  });

  it("opens with the lead contrast and the category sentence", () => {
    const head = readme.slice(0, 600);
    expect(head).toContain("**A record, not recall.**");
    expect(head).toContain("Neotoma is the system of record for AI agents.");
    expect(head).toContain(`Neotoma is the system of record for AI agents. ${LEDE_CONTRAST}`);
    expect(readme).not.toMatch(OLD_CONTRAST);
    expect(
      OLD_CONTRAST.test(`${readme}\nWithout one, an agent recalls only what it was last told.\n`)
    ).toBe(true);
  });

  it("states no telemetry only with the full update-check wording", () => {
    const lines = readme.split("\n").filter((l) => /no telemetry/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const re of TELEMETRY_REQUIRED_FRAGMENTS)
        expect(re.test(l), `${re}: ${l.slice(0, 80)}`).toBe(true);
    }
  });

  it("says no observation is overwritten, not that nothing is", () => {
    expect(readme).toContain("No observation is overwritten by a later write.");
    expect(readme).not.toContain("Nothing is overwritten by a later write.");
  });

  it("explains what setup writes for Claude Code and Cursor permissions", () => {
    expect(readme).toMatch(
      /`neotoma setup --tool claude-code --yes` writes the MCP entries and more/
    );
    expect(readme).toContain(".claude/settings.local.json");
    expect(readme).toContain(".cursor/allowlist.json");
    expect(readme).toContain("`--skip-permissions`");
  });

  it("has no em dash and no retired category frame", () => {
    expect(readme).not.toMatch(/—/);
    expect(readme).not.toMatch(/memory layer|a state layer|your agents forget/i);
  });

  it("links the known-limitations doc twice: under the install block and in Status", () => {
    const linkLine =
      /^\*\*Known limitations:\*\* \[docs\/known_limitations\.md\]\(docs\/known_limitations\.md\)/gm;
    const hits = [...readme.matchAll(linkLine)].map((m) => m.index!);
    expect(hits).toHaveLength(2);
    expect(countOccurrences(readme, `](${KNOWN_LIMITATIONS_PATH})`)).toBe(2);
    expect(countOccurrences(readme, "known_limitations.md")).toBe(4); // link text + target, twice
    expect(hits[0]).toBeLessThan(readme.indexOf("## What Neotoma is"));
    expect(hits[1]).toBeGreaterThan(readme.indexOf("## Status"));
  });

  it("says the setup allow rule covers any neotoma command, destructive ones included", () => {
    expect(readme).toContain("runs any `neotoma` command without asking");
    for (const cmd of [
      "neotoma reset",
      "neotoma storage merge-db",
      "neotoma backup restore",
      "neotoma processes kill",
    ]) {
      expect(readme).toContain(`\`${cmd}\``);
    }
    expect(readme).toContain("`~/.codex/config.toml`");
    expect(readme).not.toMatch(/runs Neotoma commands without asking/);
  });

  it("states the REST path count that openapi.yaml has", () => {
    const m = /and (\d+) REST paths in its OpenAPI spec on `main` \((\d+) in v\d+\.\d+\.\d+\)/.exec(
      readme
    );
    expect(m, "README must state the REST path count").not.toBeNull();
    expect(Number(m![1])).toBe(openApiPathCount(readFileSync(join(root, "openapi.yaml"), "utf-8")));
    expect(readme).not.toMatch(/about \d+ REST endpoints/);
  });

  it("makes no surface-parity or attribution overclaim, and says the surfaces are separate", () => {
    expect(surfaceOverclaims(readme)).toEqual([]);
    expect(readme).toContain(
      "the MCP server, the REST API, and the CLI are separate implementations"
    );
    expect(readme).toContain(
      "Unless an agent signs its requests, the name is the writer's own claim"
    );
    expect(readme).toContain("including the CLI, record no writer");
  });

  it("does not claim observation IDs match across instances, and goes red when it does", () => {
    expect(unscopedObservationIdClaims(readme)).toEqual([]);
    expect(readme).toContain("Do not rely on source or observation IDs matching across instances");
    expect(readme).toContain(
      "The stdio MCP server writes as the shared local development user, but the HTTP server, and therefore the CLI, runs by default in `local_sandbox` mode with a per-install user"
    );
    expect(invertedIdCondition(readme)).toEqual([]);
    for (const old of OLD_OBSERVATION_ID_SENTENCES) {
      expect(unscopedObservationIdClaims(`${readme}\n${old}\n`).length, old).toBeGreaterThan(0);
    }
  });

  it("carries no issue-level limit inline, and goes red when one comes back", () => {
    expect(inlineLimitMatches(readme)).toEqual([]);
    for (const old of [
      "The same observations and rules give the same snapshot; a later write can still override a correction today ([#2033](https://github.com/markmhendrickson/neotoma/issues/2033)).",
      "Field values are not checked against their types on write today.",
    ]) {
      expect(inlineLimitMatches(`${readme}\n${old}\n`).length, old).toBeGreaterThan(0);
    }
  });

  it("states the project's maturity as facts, without the developer preview label", () => {
    expect(readme).not.toMatch(PREVIEW_LABEL);
    expect(readme).not.toMatch(/expect breaking changes/i);
    expect(readme).toContain("used daily in real agent workflows");
    expect(PREVIEW_LABEL.test(`${readme}\nNeotoma is in developer preview.\n`)).toBe(true);
  });

  it("opens with the same three-line install block as the one-pager, then the permissions note", () => {
    const block = /```bash\n([\s\S]*?)```/.exec(readme);
    expect(block).not.toBeNull();
    const onepager = readFileSync(
      join(root, "frontend/src/components/onepager/onepager_copy.ts"),
      "utf-8"
    );
    const m = /export const INSTALL_COMMANDS = `([^`]*)`/.exec(onepager);
    expect(m).not.toBeNull();
    expect(block![1].trim()).toBe(m![1].trim());
    expect(block![1]).not.toContain("neotoma mcp config");
    const after = readme.slice(block!.index + block![0].length).trimStart();
    expect(
      after.startsWith("`neotoma setup --tool claude-code --yes` writes the MCP entries and more")
    ).toBe(true);
  });

  it("does not claim the record shows who corrected a value", () => {
    expect(readme.slice(0, 600)).not.toMatch(/who corrected it/i);
  });
});

/**
 * Statements a claims check found false on the published neotoma@0.25.0. Each must stay out of
 * README.md and llms.txt; the copy describes current behaviour and relaxes when the fix ships.
 */
const V0250_OVERCLAIMS: readonly RegExp[] = [
  /writes the MCP entry to `\.mcp\.json`/,
  /through (that observation|it) to its source/i,
  /source, interpretation, agent, and timestamp/i,
  /no `?Math\.random\(\)`? or wall-clock values enter/i,
  /same guarantees are reachable/i,
  /OpenAPI-backed contract/i,
  /guaranteed capture/i,
  /immutable observations/i,
  /Shipped and stable/i,
  /Ateles answers who was authorized/i,
];

function v0250Overclaims(text: string): string[] {
  return V0250_OVERCLAIMS.filter((re) => re.test(text)).map((re) => String(re));
}

describe("claims true on the published v0.25.0", () => {
  const readme = readFileSync(join(root, "README.md"), "utf-8");
  const llms = readFileSync(join(root, "frontend/public/llms.txt"), "utf-8");
  const docsReadme = readFileSync(join(root, "docs/README.md"), "utf-8");

  it("README and llms.txt carry none of the overclaims", () => {
    expect(v0250Overclaims(readme)).toEqual([]);
    expect(v0250Overclaims(llms)).toEqual([]);
  });

  it("README lists everything setup writes", () => {
    for (const s of [
      "`neotoma-dev`",
      "`neotoma.prod.db`",
      "They use separate databases",
      "`.claude/rules/neotoma_cli.mdc`",
      "`.cursor/rules/neotoma_cli.mdc`",
      "`.codex/neotoma_cli.md`",
      "`claude plugin install`",
      "(five hooks)",
      "exits with status 1",
      "`~/.claude/skills`",
    ])
      expect(readme, s).toContain(s);
  });

  it("names the observation and its source without claiming every field reaches a source", () => {
    expect(readme).toContain(
      "Each current field names the observation that set it, and a stored observation names its source."
    );
    expect(readme).toContain(
      "A correction observation has no source, and a write from the CLI records no writer."
    );
    expect(llms).toContain(
      "- Provenance: each current field names the observation that set it, and a stored observation names its source"
    );
  });

  it("qualifies idempotent writes for v0.25.0 in README and llms.txt", () => {
    expect(readme).toContain(
      "retrying a write that stopped partway with the same key reports success without finishing it"
    );
    expect(llms).toContain(
      "a same-key retry of a write that stopped partway reports success without finishing it"
    );
  });

  it("states timestamps are wall-clock and hooks capture only while the API runs", () => {
    expect(readme).toContain(
      "observation timestamps are wall-clock, and the default merge rule orders by them"
    );
    expect(readme).toContain("which capture turns automatically when the local API is running");
    expect(readme).toContain("fail quietly when nothing is listening there");
  });

  it("marks atomic corrections as main-only in docs/README.md", () => {
    expect(docsReadme).toMatch(/one transaction \(main; not in v0\.25\.0\)/);
  });
});

describe("docs/known_limitations.md", () => {
  const doc = readFileSync(join(root, KNOWN_LIMITATIONS_PATH), "utf-8");
  const entries = doc.split(/^## /m).slice(1);

  it("says entries are removed when their fix ships", () => {
    expect(doc.slice(0, doc.indexOf("\n## "))).toMatch(/removed from this page when its fix ships/);
  });

  it("gives every entry the behaviour, a workaround and a tracking line", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const title = e.split("\n")[0];
      expect(e, title).toContain("**What you will observe.**");
      expect(e, title).toContain("**Workaround.**");
      expect(e, title).toMatch(/\*\*Tracking\.\*\* /);
    }
  });

  it("links every entry to its tracking issue by full GitHub URL", () => {
    expect(doc).not.toMatch(/No open issue/i);
    for (const e of entries) {
      const t = /\*\*Tracking\.\*\* (.*)/.exec(e)![1];
      expect(t, e.split("\n")[0]).toMatch(
        /^\[#(\d+)\]\(https:\/\/github\.com\/markmhendrickson\/neotoma\/issues\/\1\)/
      );
    }
  });

  it("opens with an applicability line and a list of every entry, in order", () => {
    const intro = doc.slice(0, doc.indexOf("\n## "));
    expect(intro).toMatch(
      /^Applies to the published `neotoma@\d+\.\d+\.\d+` and to `main` as of \d{4}-\d{2}-\d{2}\./m
    );
    const listed = [...intro.matchAll(/^- \[(.+)\]\(#([^)]+)\)$/gm)].map((m) => [m[1], m[2]]);
    const headings = entries.map((e) => e.split("\n")[0].trim());
    expect(listed.map(([t]) => t)).toEqual(headings);
    for (const [title, anchor] of listed) expect(anchor).toBe(githubSlug(title));
  });

  it("makes no surface-parity or attribution overclaim", () => {
    expect(surfaceOverclaims(doc)).toEqual([]);
  });

  it("names the stdio MCP shared user and the HTTP server's per-install user the right way round", () => {
    expect(invertedIdCondition(doc)).toEqual([]);
    expect(doc).toContain(
      "The stdio MCP server writes as the shared local development user, so its source and observation IDs repeat across installs."
    );
    expect(doc).toContain(
      "The HTTP server, and therefore the CLI, runs by default (a loopback bind with no auth, outside production) in `local_sandbox` mode"
    );
  });

  it("does not claim observation IDs match across instances", () => {
    expect(unscopedObservationIdClaims(doc)).toEqual([]);
    expect(doc).toMatch(/Do not rely on source or observation IDs matching across instances/);
    for (const old of OLD_OBSERVATION_ID_SENTENCES) {
      expect(unscopedObservationIdClaims(`${doc}\n${old}\n`).length, old).toBeGreaterThan(0);
    }
  });

  it("uses no em dash, no retired frame and no claim that corrections always win", () => {
    expect(doc).not.toMatch(/—|&mdash;/);
    for (const re of [/memory layer/i, /state layer/i, /truth layer/i, /deterministic state/i]) {
      expect(re.test(doc), String(re)).toBe(false);
    }
    expect(doc).not.toMatch(/corrections? always win/i);
    expect(doc).not.toMatch(PREVIEW_LABEL);
  });
});
