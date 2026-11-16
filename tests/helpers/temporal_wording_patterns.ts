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
    "<were|was|did|which|under which ...> question ending on|at|as of|before|by <date>?",
    new RegExp(
      `(?:^|["'\`(]|[.?!:;] )(?:were|was|did|does|do|had|which|under which)\\b[^.?]{0,120}\\b(?:on|at|as of|before|by) (?:${MONTH}\\.? \\d{1,2}|${MONTH}\\.? \\d{4}|${ISO_DATE})[^.?]{0,40}\\?`,
      "gi"
    ),
  ],
  ["as of <noun> date <date>", /\bas of (?:the |any )?[a-z-]+ date\b/gi],
  [
    "on|at the <noun> date",
    /\b(?:on|at|as of) (?:the|a|that|any) (?:audit|filing|coverage|close|closing|decision|signing|vote|trade|approval|reporting|regulatory|valuation|effective|determination|event|incident|contract) date\b/gi,
  ],
  [
    "when we|I|you <verb>ed / made / started",
    /\bwhen (?:we|I|you) (?:[a-z]+ )?(?:filed|approved|made|started|began|decided|signed|launched|closed|submitted|shipped|hired|changed|bought|sold|ordered|committed|executed|reviewed|performed|authorized|achieved|quit|moved|joined|set|stopped)\b/gi,
  ],
  [
    "when the agent|assistant|system <verb>s/<verb>ed",
    /\bwhen the (?:agent|assistant|model|system|analyst|team) (?:[a-z]+ )?(?:acted|recommended|approved|filed|signed|decided|made|executed|ran|runs|acts|approves|files|signs|decides|executes|recommends|authorized|authorizes|performed|performs|failed|fails|closed|closes|flagged|flags|routed|routes)\b/gi,
  ],
  ["at that moment", /\bat that (?:moment|instant)\b/gi],
  [
    "at the time the <noun> <verb>ed / existed at the time",
    /\bat the time (?:the|that the) (?:[a-z-]+ ){1,2}(?:[a-z]+ed|ran|began|closed)\b|\bexisted at the time\b/gi,
  ],
  ["the context that governed it", /\b(?:context|rules?|policy|terms) that (?:governed|applied|existed)\b/gi],
  [
    "the effective <noun> was / <noun> was <value> on <date>",
    new RegExp(
      `\\bthe effective (?:[a-z-]+ ){1,2}(?:was|were)\\b|\\b(?:cap|limit|rate|price|balance|status|policy|term|threshold)s? (?:was|were) [^.?]{1,30}\\b(?:on|as of|at) (?:${MONTH}\\.? \\d|${ISO_DATE})`,
      "gi"
    ),
  ],
  ["diff states between dates", /\bdiff(?:erence)? states? between (?:two |any )?(?:dates|points|moments|times)\b/gi],
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
    /\bas (?:it|they|that) (?:existed|stood|was|were) (?:at|on|as of|during|when|by)\b|\bagainst (?:its|their) original (?:rules|polic|inputs)/gi,
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
 * Catch-all family (round 3). The patterns above match phrase shapes, so each
 * review round found a new wording of the same promise. This family is
 * structural: a promise verb and an event-anchored time in the same clause.
 *
 *   promise verb  : know, prove, show, see, reconstruct, answer, return, get,
 *                   replay, audit (plus explain, available, visible)
 *   event anchor  : "when <a|the> <noun> was <verb>ed", "at the time of <noun>",
 *                   "<noun>-time <state|snapshot|slice|...>", "as of <event>",
 *                   "at <event>"
 *
 * Problem-framing lines that describe the buyer's pain and promise nothing are
 * exempted one by one in ALLOWLIST; a test fails if an exemption stops matching.
 */
const PROMISE =
  "(?:know|knew|known|knows|prove|proves|show|shows|see|sees|seen|reconstructs?|answers?|returns?|gets?|replays?|audits?|explains?|available|visible)";
const CLAUSE = "[^.?!;\"`]";
const DET = "(?:a|an|the|that|this|each|any|every|our|my|your|its|their)";
const PARTICIPLE =
  "(?:made|taken|filed|approved|signed|decided|executed|performed|sent|run|ran|done|given|held|issued|submitted|built|written|shipped|[a-z]{3,}ed)";
const EVENT_NOUN =
  "(?:decision|filing|approval|incident|trade|vote|signing|failure|determination|recommendation|transfer|deploy(?:ment)?|audit|close|closing|review|call|meeting|purchase|order|claim|refund|diagnosis|dosage|award|hire|launch|release|merge|payment|liquidation|breach|outage|event|transaction|action|interaction|visit|submission|settlement|handoff|escalation|investigation|inspection|run|ruling|verdict|loan|sale|procedure|treatment|allocation|commitment|prescription|shipment|assessment|evaluation|authorization|enrollment|onboarding|diagnos[ie]s)";
const WHEN_EVENT = `\\bwhen ${DET} (?:[\\w'-]+ ){0,5}?${EVENT_NOUN} (?:was|were|is|are|had been) (?:[\\w-]+ )?${PARTICIPLE}\\b`;
const NOT_EVENT_PREFIX =
  "(?!(?:write|read|real|run|query|ingest|ingestion|wall|clock|build|compile|load|response|turn|session|insert|store|observation|first|full|part|any|some|over|life|long|short|each|one|two|lead|down|up|cycle|peak|off|on)-time)";

export const CATCH_ALL_PATTERNS: Array<[string, RegExp]> = [
  [
    "catch-all: promise verb ... when <a|the> <noun> was <verb>ed",
    new RegExp(`\\b${PROMISE}\\b${CLAUSE}{0,140}?${WHEN_EVENT}`, "gi"),
  ],
  [
    "catch-all: when <a|the> <noun> was <verb>ed ... promise verb",
    new RegExp(`${WHEN_EVENT}${CLAUSE}{0,100}?\\b${PROMISE}\\b`, "gi"),
  ],
  [
    "catch-all: promise verb ... at the time of|the <noun>",
    new RegExp(`\\b${PROMISE}\\b${CLAUSE}{0,140}?\\bat the time (?:of|that|the|when)\\b`, "gi"),
  ],
  [
    "catch-all: at the time of <noun> ... promise verb",
    new RegExp(`\\bat the time (?:of|that|the|when)\\b${CLAUSE}{0,100}?\\b${PROMISE}\\b`, "gi"),
  ],
  [
    "catch-all: <noun>-time state|snapshot|slice|view|...",
    new RegExp(
      `\\b${NOT_EVENT_PREFIX}[a-z]+-time (?:state|snapshots?|slices?|views?|truth|reconstruction|replay|answers?|records?|data|quer(?:y|ies)|copy|picture|evidence|knowledge|belief|context|versions?|inputs|rules)\\b`,
      "gi"
    ),
  ],
  [
    "catch-all: as of <event noun>",
    new RegExp(`\\bas of (?:${DET} )?(?:[a-z-]+ )?${EVENT_NOUN}\\b`, "gi"),
  ],
  [
    "catch-all: promise verb ... at|by <event noun> (event, not a time)",
    new RegExp(`\\b${PROMISE}\\b${CLAUSE}{0,100}?\\b(?:at|during) (?:${DET} )?(?:[a-z-]+ )?${EVENT_NOUN}\\b`, "gi"),
  ],
];

/**
 * Every line quoted on rounds 1 to 3 that promises or asks for state at an
 * event rather than as recorded by a time, as the copy read at round 2 head
 * (841b45337). Each must be flagged by the catch-all family ALONE, so the
 * structural check does not lean on the phrase-shaped patterns above.
 */
export const CATCH_ALL_SEEDS: string[] = [
  "Prove what inventory was available when a fulfillment decision was made, separate from the current balance.",
  "faces the same requirement: prove what was known when a decision was made.",
  "Know exactly what was known when the decision was made",
  "Know exactly what was known when the decision was made. Neotoma provides versioned findings",
  "Reconstruct what the system knew when a routing or fulfillment decision was made.",
  "Evidence timelines & filing-time slices",
  "what did the system know when the decision was made?",
  "Billing cannot prove what authorization status existed when a procedure was performed.",
  "Without temporal state, the answer is the current rule set, not the rule and evidence that applied when the decision was made.",
  "Show what the income data looked like when the decision was made.",
  "Separate what was available at the decision from what arrived later.",
  "they do not preserve the award-time record",
  "reconstruct what the agent knew at the time of failure.",
  "Answer what was known when the claim was filed.",
  "Prove what was known as of the vote.",
];

/** Promise-free or write-time lines the catch-all must NOT flag. */
export const CATCH_ALL_ACCEPTED: string[] = [
  "Show what inventory had been recorded as available by the time a fulfillment decision was made.",
  "Know exactly what had been recorded by the time the decision was made.",
  "Evidence timelines & recorded-by-filing snapshots",
  "they do not preserve the record as written by the award",
  "When a write is rejected by policy the server returns HTTP 403.",
  "existing installs see no behavior change when the variable is introduced.",
  "Optional similarity search is available when an embedding provider is configured.",
  "operators can see when a field was introduced, deprecated, or restored.",
  "Write-time cutoffs return what had been recorded by a time.",
];

/**
 * Wording that is correct under write time. It exempts a match only when it
 * appears in the same clause and within a short window of the match, and only
 * as cutoff wording: "as recorded", "recorded by / up to / as of", "had been
 * recorded", or the Spanish "registrad...". Generic verbs such as "stored" or
 * "asserted" do not count.
 */
export const WRITE_TIME_CONTEXT =
  /\bas recorded\b|\brecorded (?:by|up to|until|as of)\b|\bhad(?: \w+){0,4} (?:been )?recorded\b|\bregistrad[oa]s?\b/i;

/** Reviewed lines where the match is not a temporal-query claim. */
export const ALLOWLIST: RegExp[] = [
  // Not a temporal-query claim: a backup instruction, and the definition of an observation.
  /copy aside at any point/i,
  /statement about an entity at a point in time/i,
  // Problem framing, reviewed individually: describes what an agent does with stale state, not a state query.
  /do not notice when the agent acts confidently on state/i,
  // Problem framing, reviewed individually: issue reports must carry the reporter's own environment as captured when the report is filed; it promises no snapshot query.
  /reconstruct what an agent saw at filing time/i,
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

/** Every event-time promise in `rawText` that no write-time wording in its own clause excuses. Pass `CATCH_ALL_PATTERNS` alone to test the structural family by itself. */
export function findEventTimeOffenders(
  rawText: string,
  patterns: Array<[string, RegExp]> = [...EVENT_TIME_PATTERNS, ...CATCH_ALL_PATTERNS]
): Offender[] {
  const text = collapseWhitespace(rawText);
  const offenders: Offender[] = [];
  for (const [label, re] of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const window = clauseWindow(text, start, end);
      if (WRITE_TIME_CONTEXT.test(window)) continue;
      const wide = text.slice(Math.max(0, start - WINDOW_BEFORE), end + WINDOW_AFTER);
      if (ALLOWLIST.some((a) => a.test(wide))) continue;
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
  "entity state at any point in time",
  "ISO 8601 timestamp to get historical snapshot state",
  "view entity state at any point in time",
  "list red flags as they existed on a given Monday",
  // Round 2 review quotes
  "Were my risk limits already breached when the liquidation happened at 3:42 AM on April 1?",
  "At 03:42 UTC the effective cap was 8%, not 5%.",
  "misses that the cap was 8% on April 1",
  "Was the billing agent authorized to issue refunds on March 12?",
  "Under which policy version was the claim determined on November 3?",
  "was the reconciliation state correct at March 2025 month-end close?",
  "What evidence was available when we filed the motion to compel?",
  "As of filing date 2025-01-22 4:00pm PT (docket entry DE 47)",
  "What did we know about this vendor when we approved them?",
  "Did this liability exist in our books on the audit date?",
  "What was known about this patient when the agent recommended the dosage change?",
  "the state of the file on a coverage date",
  "What was your monthly spending when you decided to change jobs?",
  "what was my financial state when I made that decision?",
  "what were my vitals when I started this supplement?",
  "Bind each hop to the entity state and policy version at that moment",
  "Prove that a treasury transfer followed the DAO's rules at the time the vote closed, not today's rules.",
  "Historical queries return the decision bound to the exact context that governed it.",
  "Reconstruct any past decision against its original inputs",
  "Explain any past routing decision against its original inputs",
  "Diff states between dates.",
  "constraints that existed at the time",
  // Round 3 review quotes
  "Prove what inventory was available when a fulfillment decision was made, separate from the current balance.",
  "prove what was known when a decision was made. Neotoma generalizes the pattern to your clinical stack.",
  "Know exactly what was known when the decision was made",
  "Reconstruct what the system knew when a routing or fulfillment decision was made.",
  "Evidence timelines & filing-time slices",
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
  // Round 2 accepted forms
  "Which risk limits had been recorded by 3:42 AM UTC on April 1, when the liquidation completed?",
  "As recorded by 03:42 UTC on Apr 1, the drawdown cap recorded at that cutoff is 8%.",
  "Had the billing agent been recorded as authorized to initiate the wire transfer by March 12?",
  "What had we recorded about this vendor by the time we approved them?",
  "What had been recorded about this patient by the time the agent recommended the dosage change?",
  "Had this liability been recorded in our books by the audit date?",
  "As recorded by the filing cutoff 2025-01-22 4:00pm PT, the matter held exhibits A to F only.",
  "Diff states as recorded between two timestamps.",
  "Bind each hop to the entity state and policy version recorded with it.",
  "Reconstruct any past decision from the inputs recorded with it.",
  "followed the DAO's rules as recorded by the time the vote closed, not today's rules.",
  // Round 3 accepted forms
  "Show what inventory had been recorded as available by the time a fulfillment decision was made, separate from the current balance.",
  "Know exactly what had been recorded by the time the decision was made",
  "Evidence timelines & recorded-by-filing snapshots",
  "Reconstruct what the system had recorded by the time a routing or fulfillment decision was made.",
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
