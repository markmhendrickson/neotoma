/**
 * Claim patterns for repository markdown that neotoma.io publishes as docs viewer pages.
 *
 * One module, shared by the docs lint (`scripts/docs_viewer/lint.ts`, run by `npm run lint:docs-viewer`
 * and by `npm run lint:site-copy`) and by the export validator (`scripts/docs_viewer/validate_export.ts`,
 * run by `npm run validate:site-export`), so the source check and the built-page check cannot drift.
 *
 * Wording rules come from the one-pager claim table: the category noun is "system of record"; the
 * retired frames and the omitted claims below must not appear on a page published under neotoma.io.
 * A per-entity as-of read exists (`at` / `at_ingested` on `retrieve_entity_snapshot`), so "as of"
 * wording is NOT banned; only replay of any historical state across the record is.
 */

export interface ClaimPattern {
  /** Stable rule id used in reports and tests. */
  id: string;
  re: RegExp;
  label: string;
  /**
   * When set, a match does not count if the sentence it sits in matches this pattern
   * (for example "the database does not enforce append-only").
   */
  unlessSentence?: RegExp;
}

const NEGATED = /\b(not|never|no|isn't|doesn't|does not|cannot|can't|without)\b/i;

/** Retired category nouns and frames. */
export const RETIRED_NOUNS: readonly ClaimPattern[] = [
  { id: "retired-noun", re: /\bmemory[- ]layer\b/i, label: 'retired category noun "memory layer"' },
  {
    id: "retired-noun",
    re: /\bstate[- ]layer\b/i,
    label: 'retired category noun "state layer" (use "system of record")',
  },
  {
    id: "retired-noun",
    re: /\byour agents forget\b/i,
    label: 'retired frame "your agents forget"',
  },
  {
    id: "retired-noun",
    re: /\bdeterministic state\b/i,
    label: 'retired frame "deterministic state" (say "deterministic snapshots")',
  },
];

/** Claims the one-pager claim table omits because the build does not support them. */
export const OMITTED_CLAIMS: readonly ClaimPattern[] = [
  {
    id: "omitted-claim",
    re: /\bcorrections? (always|will always) (wins?|override|takes? precedence)\b/i,
    label: "corrections always win",
  },
  {
    id: "omitted-claim",
    re: /\b(database|db|storage|sqlite|ledger|log)[^.\n]{0,40}\bappend[- ]only\b|\bappend[- ]only\b[^.\n]{0,40}\b(enforced|guaranteed?|database|storage)\b|\bimmutable audit trail\b/i,
    label: "database-enforced append-only",
    unlessSentence: NEGATED,
  },
  {
    id: "omitted-claim",
    re: /\btime[- ]travel\b|\bhistorical replay\b|\breplay(s|ed|ing)? (of )?(any|every|all|the full) (historical |past |prior )?(state|history)\b|\bstate at any point in time\b/i,
    label: "replay of any historical state or time travel across the record",
    unlessSentence: NEGATED,
  },
  {
    id: "omitted-claim",
    re: /\bexport(s|ed|ing)?\b[^.\n]{0,40}\b(with|including|includes) (the )?(full |complete |entire |observation )?history\b/i,
    label: "export with history",
    unlessSentence: NEGATED,
  },
  {
    id: "omitted-claim",
    re: /\bhosted neotoma (is )?(available|for sale|plans?|pricing|subscription)\b|\b(buy|purchase|subscribe to) (a )?hosted\b|\bmanaged neotoma\b/i,
    label: "hosted Neotoma for sale",
  },
  { id: "omitted-claim", re: /\bunified platform\b/i, label: "unified platform" },
  { id: "omitted-claim", re: /\bmulti-operator\b/i, label: "multi-operator authority" },
];

/** A no-telemetry or no-egress claim must name the CLI update check in the same passage. */
export const TELEMETRY_CLAIM =
  /\bno (remote |opt-out )?telemetry\b|\bno network egress\b|\bphone[- ]home\b|\bnever (calls|contacts|phones) (home|the network)\b/gi;
export const TELEMETRY_QUALIFIER =
  /update[- ]check|npm registry|--no-update-check|NO_UPDATE_NOTIFIER/i;
/** Characters on either side of a telemetry claim searched for the qualifier. */
export const TELEMETRY_WINDOW = 400;

export interface ClaimFinding {
  id: string;
  label: string;
  /** Character offset in the scanned text. */
  index: number;
  match: string;
}

function sentenceAt(text: string, index: number): string {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n\n"), -1) + 1;
  const rest = text.slice(index);
  const endRel = rest.search(/\.(\s|$)|\n\n/);
  return text.slice(start, endRel < 0 ? text.length : index + endRel + 1);
}

/** Scan text for retired nouns, omitted claims and unqualified telemetry claims. */
export function findClaimProblems(text: string): ClaimFinding[] {
  const out: ClaimFinding[] = [];
  for (const p of [...RETIRED_NOUNS, ...OMITTED_CLAIMS]) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0;
      if (p.unlessSentence && p.unlessSentence.test(sentenceAt(text, idx))) continue;
      out.push({ id: p.id, label: p.label, index: idx, match: m[0] });
    }
  }
  for (const m of text.matchAll(new RegExp(TELEMETRY_CLAIM.source, "gi"))) {
    const idx = m.index ?? 0;
    const around = text.slice(
      Math.max(0, idx - TELEMETRY_WINDOW),
      idx + m[0].length + TELEMETRY_WINDOW
    );
    if (!TELEMETRY_QUALIFIER.test(around)) {
      out.push({
        id: "telemetry",
        label: `unqualified "${m[0]}" (name the CLI update check and how to turn it off)`,
        index: idx,
        match: m[0],
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
