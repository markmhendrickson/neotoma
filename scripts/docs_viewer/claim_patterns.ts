/**
 * Claim patterns for neotoma.io: one module for every claim list the site checks.
 *
 * - Docs viewer pages: the docs lint (`scripts/docs_viewer/lint.ts`, run by `npm run lint:docs-viewer`
 *   and `npm run lint:site-copy`) and the docs export check (`scripts/docs_viewer/validate_export.ts`)
 *   both scan with DOCS_CLAIM_PATTERNS.
 * - Live one-pager routes (/ and /install): section 3g of `scripts/validate_site_export.ts` scans with
 *   LIVE_PAGE_CLAIM_PATTERNS, which is DOCS_CLAIM_PATTERNS plus the NAMED extras below, so the live
 *   list is a superset of the docs list by construction (tests/unit/docs_viewer_lint.test.ts).
 * - Telemetry: both use one fragment list (TELEMETRY_REQUIRED_FRAGMENTS), so a docs page that says
 *   "no telemetry" needs the same full wording the live pages need.
 *
 * Wording rules come from the one-pager claim table: the category noun is "system of record"; the
 * retired frames and the omitted claims below must not appear on a page published under neotoma.io.
 * A per-entity as-of read exists (`at` / `at_ingested` on `retrieve_entity_snapshot`), so "as of"
 * wording is NOT banned on docs pages; only replay of any historical state across the record is.
 *
 * Every pattern is linear in the input: bounded repetition only, and the negation lookup reads a
 * bounded window (tests/unit/docs_viewer_lint.test.ts holds a time bound on pathological input).
 */

export interface ClaimPattern {
  /** Stable rule id used in reports and tests. */
  id: string;
  /** Stable name of this pattern, used to relate the docs and live lists. */
  name: string;
  re: RegExp;
  label: string;
  /**
   * When true, a match does not count if a negation sits inside the match or among the few words
   * just before it, in the same clause ("the database does not enforce append-only"). A negation
   * elsewhere in the sentence does not exempt it ("the log is append-only and never loses data").
   */
  negatable?: boolean;
}

/** Negation words. */
const NEGATION = /\b(not|never|no|isn't|aren't|doesn't|don't|cannot|can't|without|nor)\b|n't\b/i;
/** Words before a match searched for a negation, within the same clause. */
export const NEGATION_WORDS_BEFORE = 5;
/** Characters before a match read for that search (bounds the work per match). */
const NEGATION_CHAR_WINDOW = 80;

/** Retired category nouns and frames. */
export const RETIRED_NOUNS: readonly ClaimPattern[] = [
  {
    id: "retired-noun",
    name: "memory-layer",
    re: /\bmemory[- ]layer\b/i,
    label: 'retired category noun "memory layer"',
  },
  {
    id: "retired-noun",
    name: "state-layer",
    re: /\bstate[- ]layer\b/i,
    label: 'retired category noun "state layer" (use "system of record")',
  },
  {
    id: "retired-noun",
    name: "your-agents-forget",
    re: /\byour agents forget\b/i,
    label: 'retired frame "your agents forget"',
  },
  {
    id: "retired-noun",
    name: "deterministic-state",
    re: /\bdeterministic state\b/i,
    label: 'retired frame "deterministic state" (say "deterministic snapshots")',
  },
];

/** Claims the one-pager claim table omits because the build does not support them. */
export const OMITTED_CLAIMS: readonly ClaimPattern[] = [
  {
    id: "omitted-claim",
    name: "corrections-win",
    re: /\bcorrections? (always |will always )?(wins?|override|overrides|takes? precedence)\b/i,
    label: "corrections always win",
  },
  {
    id: "omitted-claim",
    name: "append-only",
    re: /\bappend[- ]only\b|\bimmutable audit trail\b/i,
    label: "database-enforced append-only",
    negatable: true,
  },
  {
    id: "omitted-claim",
    name: "hash-chain",
    re: /\bhash[- ]chain(s|ed|ing)?\b|\bprevious_event_hash\b|\btamper[- ](evident|proof)\b/i,
    label: "hash-chained or tamper-evident log",
    negatable: true,
  },
  {
    id: "omitted-claim",
    name: "time-travel",
    re: /\btime[- ]travel\b|\bhistorical replay\b|\breplay(s|ed|ing)? (of )?(any|every|all|the full) (historical |past |prior )?(state|history)\b|\bstate at any point in time\b/i,
    label: "replay of any historical state or time travel across the record",
    negatable: true,
  },
  {
    id: "omitted-claim",
    name: "export-history",
    re: /\bexport(s|ed|ing)?\b[^.\n]{0,40}\b(with|including|includes) (the )?(full |complete |entire |observation )?history\b/i,
    label: "export with history",
    negatable: true,
  },
  {
    id: "omitted-claim",
    name: "hosted-for-sale",
    re: /\bhosted neotoma (is )?(available|for sale|plans?|pricing|subscription)\b|\b(buy|purchase|subscribe to) (a )?hosted\b|\bmanaged neotoma\b/i,
    label: "hosted Neotoma for sale",
  },
  {
    id: "omitted-claim",
    name: "unified-platform",
    re: /\bunified platform\b/i,
    label: "unified platform",
  },
  {
    id: "omitted-claim",
    name: "multi-operator",
    re: /\bmulti-operator\b/i,
    label: "multi-operator authority",
  },
];

/** Everything a docs viewer page is scanned for. */
export const DOCS_CLAIM_PATTERNS: readonly ClaimPattern[] = [...RETIRED_NOUNS, ...OMITTED_CLAIMS];

/** The retired "Developer preview" label (operator ruling 2026-10-20). */
export const DEVELOPER_PREVIEW = /developer preview/i;
/**
 * "5 minutes" is an unmeasured install-time claim (the /install claim is "a few minutes"). Covers the
 * languages whose strings ship in the client bundle: English, Spanish, Catalan, French, Portuguese,
 * Italian, German, Indonesian, Chinese, Hindi, Arabic, Russian and Urdu.
 */
export const UNMEASURED_INSTALL_TIME =
  /\b(?:5|five)[- ]minutes?\b|\b5 (?:minutos|minuts|minuti|menit|Minuten)\b|5 ?分[钟鐘]|5 मिनट|5 دقائق|5 минут|5 منٹ/i;
/**
 * The overstated lede "Without one, an agent recalls only what it was last told" (and the llms.txt
 * variant "An agent's recall holds what it was last told"), in English and Spanish. The approved lede
 * says what an agent works from without a record: whatever it happens to recall.
 */
export const OLD_LEDE: readonly ClaimPattern[] = [
  {
    id: "retired-frame",
    name: "live-old-lede-en",
    re: /\blast told\b|\brecalls only\b|\brecall holds\b/i,
    label: 'overstated lede ("recalls only what it was last told")',
  },
  {
    id: "retired-frame",
    name: "live-old-lede-es",
    re: /lo [uú]ltimo que se le dijo|(?:s[oó]lo|solo) recuerda|recuerdo (?:solo |s[oó]lo )?contiene/i,
    label: 'overstated lede, Spanish ("solo recuerda lo ultimo que se le dijo")',
  },
];

/**
 * Extras for the live one-pager routes only, each named. Marketing copy is stricter than docs: it
 * may not say "append-only" at all, nor deny the per-entity as-of read, while a docs page may state
 * those limits ("the database does not enforce append-only"; "there is no as-of query across the
 * whole record").
 */
export const LIVE_PAGE_EXTRA_CLAIMS: readonly ClaimPattern[] = [
  {
    id: "omitted-claim",
    name: "live-append-only-any-mention",
    re: /\bappend-only\b/i,
    label: "database-enforced append-only",
  },
  {
    id: "omitted-claim",
    name: "live-as-of-whole-record",
    re: /\b(whole|entire|every entity|all entities)[^.]{0,60}(as[- ]of|point[- ]in[- ]time)/i,
    label: "as-of read across the whole record",
  },
  {
    id: "omitted-claim",
    name: "live-denies-as-of",
    re: /\bno (point[- ]in[- ]time|as[- ]of)|\b(cannot|can't|not) (read|query) (a )?past state/i,
    label: "denies the per-entity as-of read",
  },
  {
    id: "omitted-claim",
    name: "live-fully-reversible",
    re: /\bfully reversible\b/i,
    label: "unevidenced reversibility claim",
  },
  {
    id: "retired-frame",
    name: "live-developer-preview",
    re: DEVELOPER_PREVIEW,
    label: "developer-preview label",
  },
  {
    id: "omitted-claim",
    name: "live-unmeasured-install-time",
    re: UNMEASURED_INSTALL_TIME,
    label: "unmeasured install-time claim",
  },
  ...OLD_LEDE,
];

/**
 * Statements the claims check found wrong on the published package, or retired frames, that no served page
 * (live, held or docs viewer) may carry in its text, title, meta tags or JSON-LD. Named `served-*` so the
 * list stays distinct from the docs list and the live extras (tests/unit/docs_viewer_lint.test.ts relates
 * the three). Each says what the package does today and is meant to be relaxed when that changes.
 */
export const SERVED_PAGE_STATEMENTS: readonly ClaimPattern[] = [
  { id: "served-statement", name: "served-audit-trail", re: /Every modification records who made it/i, label: "audit-trail claim (retired auditable-change-log page)" },
  { id: "served-statement", name: "served-replayable-timeline", re: /reconstruct any historical/i, label: "replayable-timeline claim" },
  { id: "served-statement", name: "served-404-guarantees", re: /Review the state guarantees/i, label: "404 page memory-guarantees entry" },
  { id: "served-statement", name: "served-init-prompts", re: /Optional prompts (during|in) init/i, label: "init prompts claim (init runs without prompts by default)" },
  { id: "served-statement", name: "served-install-pointers", re: /pre-flight block above|activation sequence linked below/i, label: "install page pointer to a block that is elsewhere" },
  { id: "served-statement", name: "served-skills-headline", re: /Guided Workflows for Agent Memory|Guided workflows that teach your agent to remember/i, label: "retired skills headline" },
  { id: "served-statement", name: "served-persistent-memory", re: /persistent memory/i, label: "retired category wording on a skill page" },
  { id: "served-statement", name: "served-wrong-owner-link", re: /markNZed/i, label: "skills link to a repository that does not exist" },
  { id: "served-statement", name: "served-dead-skill-links", re: /googleworkspace\/mcp-(gmail|google-calendar)/i, label: "dead external skill link" },
  { id: "served-statement", name: "served-sandbox-memory", re: /your memory to persist/i, label: "sandbox memory sentence" },
  { id: "served-statement", name: "served-comparison-facets", re: /no conflict detection|deterministic state evolution|state layer on top|inference variance|log archaeology|context janitor/i, label: "retired comparison or tax facet" },
  { id: "served-statement", name: "served-reconstruct", re: /ingest -> reconstruct|reconstruct a timeline|timeline reconstruction/i, label: "reconstruct wording" },
  { id: "served-statement", name: "served-shared-record", re: /Connected agents read and write the same record|what one agent stored is what the next one reads|connected to the same instance read the same record/i, label: "shared-record claim that is not limited to one MCP entry" },
  { id: "served-statement", name: "served-sheet03-ids", re: /observation ids are from one run/i, label: "sheet 03 id sentence" },
  { id: "served-statement", name: "served-sheet03-plain-cli", re: /\$ neotoma (store|corrections|entities|observations)\b/, label: "sheet 03 command without the dev prefix (a plain npm install needs a token)" },
  { id: "served-statement", name: "served-shadow-mode", re: /shadow-mode (trial|path)/i, label: "non-destructive shadow-mode trial" },
  { id: "served-statement", name: "served-user-memory", re: /own memory system|memory pain to compound/i, label: "memory wording about users on the evaluate page" },
];

/** Live pages: the docs list plus the named extras (a superset by construction). */
export const LIVE_PAGE_CLAIM_PATTERNS: readonly ClaimPattern[] = [
  ...DOCS_CLAIM_PATTERNS,
  ...LIVE_PAGE_EXTRA_CLAIMS,
];

/** Phrases that may not appear in a live page's JSON-LD or meta keywords. */
export const LIVE_PAGE_RETIRED_META_PHRASES = [
  "append-only",
  "detect conflicts",
  "deterministic memory",
  "ships those guarantees",
  "5 minutes",
  "5-minute",
  "five minutes",
  "five-minute",
  "no cloud sync",
  "agent memory",
  "deterministic state",
  "SearchAction",
  "speakable",
  "docs?q=",
  "FAQPage",
] as const;

/** A no-telemetry or no-egress claim. */
export const TELEMETRY_CLAIM =
  /\bno (remote |opt-out )?telemetry\b|\bno network egress\b|\bphone[- ]home\b|\bnever (calls|contacts|phones) (home|the network)\b/gi;
/**
 * Every fragment must appear within TELEMETRY_WINDOW characters after the claim: the npm update
 * check, how to turn it off, the session-start check of the stdio MCP server, and what the
 * registry sees, and the npm_check_update tool that makes the same request. Shared by docs pages and live pages.
 */
export const TELEMETRY_REQUIRED_FRAGMENTS: readonly { re: RegExp; label: string }[] = [
  { re: /npm registry/i, label: "the npm registry" },
  { re: /NO_UPDATE_NOTIFIER=1/, label: "NO_UPDATE_NOTIFIER=1" },
  { re: /when a session starts/i, label: "the check when a session starts" },
  { re: /connection metadata/i, label: "connection metadata" },
  { re: /npm_check_update/, label: "the npm_check_update tool" },
];
export const TELEMETRY_WINDOW = 900;

/** Missing fragments for each telemetry claim in `text` (empty list when qualified). */
export function telemetryProblems(
  text: string
): { index: number; match: string; missing: string[] }[] {
  const out: { index: number; match: string; missing: string[] }[] = [];
  for (const m of text.matchAll(new RegExp(TELEMETRY_CLAIM.source, "gi"))) {
    const idx = m.index ?? 0;
    const after = text.slice(idx, idx + m[0].length + TELEMETRY_WINDOW);
    const missing = TELEMETRY_REQUIRED_FRAGMENTS.filter((f) => !f.re.test(after)).map(
      (f) => f.label
    );
    if (missing.length) out.push({ index: idx, match: m[0], missing });
  }
  return out;
}

export interface ClaimFinding {
  id: string;
  name: string;
  label: string;
  /** Character offset in the scanned text. */
  index: number;
  match: string;
}

/** True when a negation is inside the match or among the few words before it, in the same clause. */
export function negatedNear(text: string, index: number, match: string): boolean {
  if (NEGATION.test(match)) return true;
  const before = text.slice(Math.max(0, index - NEGATION_CHAR_WINDOW), index);
  const clause = before.split(/[.;:!?,\n()]/).pop() ?? "";
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-NEGATION_WORDS_BEFORE);
  return NEGATION.test(words.join(" "));
}

/** Scan text with a pattern list (the docs list by default), plus unqualified telemetry claims. */
export function findClaimProblems(
  text: string,
  patterns: readonly ClaimPattern[] = DOCS_CLAIM_PATTERNS
): ClaimFinding[] {
  const out: ClaimFinding[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0;
      if (p.negatable && negatedNear(text, idx, m[0])) continue;
      out.push({ id: p.id, name: p.name, label: p.label, index: idx, match: m[0] });
    }
  }
  for (const t of telemetryProblems(text)) {
    out.push({
      id: "telemetry",
      name: "telemetry",
      label: `unqualified "${t.match}" (missing: ${t.missing.join(", ")})`,
      index: t.index,
      match: t.match,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}
