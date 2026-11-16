/**
 * Shared wording rules for the `at` / `at_ingested` snapshot cutoffs.
 *
 * `at` filters `observed_at`, which public `store` and `correct` stamp from the
 * server clock at write time, and `at_ingested` filters `created_at`. Both are
 * write time (state as recorded by a cutoff), never event or valid time. No
 * public copy may promise that a query returns what was true, valid, active or
 * in effect at a past date. Event-time queries are not supported (#2034), see
 * docs/known_limitations.md.
 *
 * The contract test walks every copy root with `findEventTimeOffenders`; the
 * same function is exercised on seeded phrases so a weakened pattern fails.
 */

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const ISO_DATE = "\\d{4}-\\d{2}-\\d{2}";

/** Phrases that say or imply the cutoff returns state as it was true at an event date. */
export const EVENT_TIME_PATTERNS: Array<[string, RegExp]> = [
  [
    "at any <point|moment|date|timestamp|instant>",
    /\bat any (?:[a-z-]+ ){0,3}(?:timestamp|moment|date|instant|point(?: in time)?)\b/gi,
  ],
  [
    "state (valid) at/on/as of a date; entity state at",
    new RegExp(
      `\\bstate (?:valid )?(?:at|as of) |\\bstate on (?:${MONTH}|\\d)|\\bentity state at\\b|\\bhistorical snapshot state\\b`,
      "gi"
    ),
  ],
  ["what was true / when it happened", /\bwhat (?:was|were) (?:\w+ )?true\b|\bwhen it happened\b|\bwhat was known at (?:any|decision)/gi],
  ["time travel", /\btime[- ]travel/gi],
  [
    "as-of date/timestamp/view/query/answer",
    /\bas[- ]of (?:any |a |the |and |snapshots?|date|timestamp|time|view|quer|answer|reconstruction|state)|\bany as-of\b|\bas-of\b(?=["' ]*[,.;)])/gi,
  ],
  [
    "as of <literal date>",
    new RegExp(`\\bas of (?:${ISO_DATE}|${MONTH}\\.? \\d{1,2}\\b|\\d{1,2} ${MONTH}\\b)`, "gi"),
  ],
  [
    "<question> on <Month day>?",
    new RegExp(`\\bwhat (?:was|were|is|are)\\b[^.?]{0,100}\\b(?:on|as of) ${MONTH}\\.? \\d{1,2}(?:, \\d{4})?\\s*\\?`, "gi"),
  ],
  [
    "in effect / valid / active / live at|during|on|as of",
    /\b(?:in effect|in force|valid|active|effective) (?:at|during|on|as of) |\blive (?:on|as of) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/gi,
  ],
  [
    "<noun> at the time of / at <decision|trade|...> time",
    /\b(?:version|state|status|policy|rules?|terms|limits?|data|inputs?) (?:at|as of) the (?:time|moment) of\b|\bat (?:decision|trade|determination|approval|signing|execution|vote|performance|transaction) time\b|\b(?:when|as) (?:it|they) (?:was|were) (?:performed|signed|decided|approved|executed)\b|\bwhen performed\b/gi,
  ],
  [
    "as it existed / stood at",
    /\bas (?:it|they|that) (?:existed|stood|was|were) (?:at|on|as of|during|when|by)\b|\bagainst (?:its|their) original (?:rules|polic)/gi,
  ],
  [
    "what was/were <noun> when we|I|it <verb>",
    /\bwhat (?:was|were) (?!known\b)(?:the |my |our |its |their )?[\w' -]{1,40} when (?:we|I|it|they|the \w+) /gi,
  ],
  ["point-in-time", /\bpoint[- ]in[- ]time\b/gi],
  ["when we signed", /\bwhen we signed\b/gi],
  [
    "what did we know on <date>",
    new RegExp(`\\bwhat did we know [^.?'"]{0,60}\\b(?:on|by) ${MONTH} \\d`, "g"),
  ],
  [
    "on/at any calendar, close, filing, audit or prior date",
    /\b(?:on|at|as of) any (?:calendar |historical |close |prior |filing |audit |regulatory )+date\b/gi,
  ],
  ["valid at the as-of / event time", /\bvalid (?:at|on) the as-of|\bevent[- ]time\b/gi],
  ["award-time truth/views", /\baward-time (?:truth|views?)\b/gi],
  [
    "vote-time / signing-time replay",
    /\b(?:vote|signing|decision|trade)-time (?:state|snapshots?|reconstruction|replay|truth)\b/gi,
  ],
  [
    "Spanish: que era cierto / punto en el tiempo / viaje en el tiempo / vigente en",
    /qu[ée] era cierto|punto en el tiempo|viaje en el tiempo|\bvigente (?:en|el|al) /gi,
  ],
];

/**
 * Wording that is correct under write time. It exempts a match only when it
 * appears in the same clause and within a short window of the match, and only
 * as cutoff wording: "as recorded", "recorded by / up to / as of", "had been
 * recorded", or the Spanish "registrad...". Generic verbs such as "stored" or
 * "asserted" do not count.
 */
export const WRITE_TIME_CONTEXT =
  /\bas recorded\b|\brecorded (?:by|up to|until|as of)\b|\bhad (?:been )?recorded\b|\bregistrad[oa]s?\b/i;

/** Reviewed lines where the match is not a temporal-query claim. */
export const ALLOWLIST: RegExp[] = [
  // Not a temporal-query claim: a backup instruction, and the definition of an observation.
  /copy aside at any point/i,
  /statement about an entity at a point in time/i,
  // Definition of an observation (what one source said at a specific point in time).
  /said about the \[entity\]\(\S*\) at a specific point in time/i,
  // Backup and recovery, not a temporal query.
  /point-in-time (?:recovery|backup)|not a point-in-time backup/i,
  // "As of" introducing a subsystem, not a date.
  /As of the markdown-mirror subsystem/i,
  // Retention and lifecycle wording, not a temporal query.
  /excluded at any point|active at a time/i,
  // Correct negations that state the event-time reading is not what the cutoff does.
  /not the event time|not 'what was true in the world at T'/i,
  // Documented failure example: a stale answer from a store that overwrites.
  /Unpaid as of Feb 2/i,
];

const WINDOW_BEFORE = 60;
const WINDOW_AFTER = 30;

export const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ");

/** Clause bounds around a match: sentence punctuation, quotes and backticks end a clause. */
function clauseWindow(text: string, start: number, end: number): string {
  const before = text.slice(Math.max(0, start - WINDOW_BEFORE), start);
  const after = text.slice(end, end + WINDOW_AFTER);
  const left = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("? "),
    before.lastIndexOf("! "),
    before.lastIndexOf("; "),
    before.lastIndexOf('"'),
    before.lastIndexOf("`")
  );
  const rightCuts = [". ", "? ", "! ", "; ", '"', "`"]
    .map((c) => after.indexOf(c))
    .filter((i) => i >= 0);
  const right = rightCuts.length ? Math.min(...rightCuts) : after.length;
  return before.slice(left + 1) + text.slice(start, end) + after.slice(0, right);
}

export interface Offender {
  label: string;
  context: string;
}

/** Every event-time promise in `rawText` that no write-time wording in its own clause excuses. */
export function findEventTimeOffenders(rawText: string): Offender[] {
  const text = collapseWhitespace(rawText);
  const offenders: Offender[] = [];
  for (const [label, re] of EVENT_TIME_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const window = clauseWindow(text, start, end);
      if (WRITE_TIME_CONTEXT.test(window)) continue;
      const wide = text.slice(Math.max(0, start - WINDOW_BEFORE), end + WINDOW_AFTER);
      const allowWindow = text.slice(Math.max(0, start - 160), end + 60);
      if (ALLOWLIST.some((a) => a.test(allowWindow))) continue;
      offenders.push({ label, context: wide });
    }
  }
  return offenders;
}

/**
 * Every phrase a reviewer quoted on #2857, plus the earlier rounds' phrases.
 * Each must be flagged on its own.
 */
export const SEEDED_EVENT_TIME_PHRASES: string[] = [
  "at any historical timestamp",
  "what was the diagnosis at any historical moment",
  "what were the terms when we signed?",
  "Reconstruct exhibit sets as of any filing date",
  "for any as-of timestamp",
  "Risk state time travel",
  "what was true then",
  "reconstruct award-time and as-of views",
  "As of 2025-03-03 close of business ... Point-in-time answer",
  "reconstruct state at any timestamp",
  "what did we know about NovaPay on February 15?",
  "reconstruct belief at IC vote, signing, or any regulatory as-of date",
  // Round 3 review quotes
  "what was our fully diluted ownership in CloudVector as of June 30, 2025?",
  "As of 2025-06-30 23:59 UTC (portfolio_state q2-2025): 18.4% FD",
  "excluded from this snapshot per LP reporting policy, as of June 30",
  "What were the payment terms for the order form on February 15, 2025?",
  "As of 2025-02-15, Sterling order form OF-884 showed net-60",
  "prove what limits, caps, and kill switch states were active during any market event",
  "uses the strategy, risk state, and market data in effect at trade time, not current values",
  "uses the consent and policy state in effect at that moment",
  "the exact policy version in effect at decision time. Reconstruct any past determination against its original rules",
  "The commitment was valid at decision time.",
  "The temporal record shows it was approved when performed",
  "Vote-time and signing-time snapshots so materials match the exact entity versions in effect",
  "Current diligence memo, not vote-time state",
  "which policy version was in effect on March 12",
  "the ticket state and policy version at the time of the interaction",
  "what was true at any point in the past?",
  "What was true (composed state) when it happened?",
  "reconstruct the exact contractual state at any point in time",
  "the exact information landscape at any historical moment",
  "reconstructable at any point for audit",
  "at any routing choice point",
  "at any approval decision point",
  "at any point in a case timeline",
  "time-travel queries",
  "What was the valuation when we made the follow-on?",
  "what was my financial state when I made that decision?",
  "Neotoma answers: What was true (composed state) when it happened?",
  "reconstruct what an agent knew at decision time",
  "entity state at any point in time",
  "ISO 8601 timestamp to get historical snapshot state",
  "view entity state at any point in time",
  "list red flags as they existed on a given Monday",
];

/**
 * Phrases that must NOT be flagged: they describe write time, or are
 * log-replay statements qualified "as recorded".
 */
export const ACCEPTED_WRITE_TIME_PHRASES: string[] = [
  "State as recorded by 2025-06-30 23:59 UTC.",
  "what had we recorded by February 15, 2025?",
  "reconstruct state as recorded up to any timestamp",
  "queryable as recorded up to any point in time",
  "Snapshots as recorded by the vote and by signing",
  "the observation log reconstructs any past state as recorded",
  "cases decided in December cannot be re-evaluated against the rules recorded with each decision.",
];

/**
 * Lines that carry an event-time promise next to unrelated write-time-sounding
 * words. Each must still be flagged: a nearby "stored" or "recorded" in another
 * clause cannot excuse it.
 */
export const NOT_EXCUSED_BY_NEARBY_WORDS: string[] = [
  "Every fact is stored with its source and is available at any point in time.",
  "Prove which limits were active during any market event. Everything is recorded by agents.",
  "Data is asserted and stored; the policy in effect at decision time is returned.",
  "Each decision is recorded by its agent \"and the rules in effect at decision time are shown\"",
];
