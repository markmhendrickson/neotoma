/**
 * Entity Signal Resolver (Issue #1603)
 *
 * Single-call multi-signal entity resolution. Composes existing primitives
 * (retrieveEntityByIdentifierWithFallback, stringSimilarity, resolveIdentitySearchFields,
 * loadConceptTypeSynonyms) to accept a rich signals bundle, perform per-signal
 * lookups, accumulate weighted scores, and return a ranked candidate list with
 * a resolution band.
 *
 * DESIGN: this is purely a composition / aggregation layer. No new query paths
 * are introduced; every lookup delegates to the shared action_handlers and
 * services already tested elsewhere. The scoring table is deterministic (score
 * desc, entity_id asc) so repeated calls with the same input always yield the
 * same ranking.
 *
 * Scoring weights (per-signal):
 *   email   1.0  — globally unique identifier
 *   phone   0.9  — near-unique identifier
 *   name    0.7  — high-confidence name match
 *   domain  0.6  — domain-level match
 *   company 0.5  — org name match
 *   other   0.4  — open-ended string props
 *
 * Weights are normalized over the set of signals actually supplied so the
 * maximum possible score is always 1.0 (before the corroboration bonus).
 * A small corroboration bonus (+0.05 per additional signal that agrees,
 * capped at +0.15) rewards multi-signal agreement without pushing a low-quality
 * match over the high-band floor.
 *
 * Resolution bands:
 *   high       — score >= 0.85
 *   medium     — score >= 0.55
 *   low        — score >= 0.30
 *   unresolved — score < 0.30
 *
 * Semantic-only matches (match_mode === "semantic") are capped to medium band
 * regardless of score, since semantic similarity without field confirmation is
 * inherently uncertain.
 *
 * Type synonym scope expansion: if entity_types / entity_type are omitted,
 * loadConceptTypeSynonyms is called to derive candidate types from signal
 * values (e.g. "bank account" → "financial_account"). This is additive —
 * results across all implied types are merged and deduped by entity_id.
 */

import { retrieveEntityByIdentifierWithFallback } from "../shared/action_handlers/entity_identifier_handler.js";
import { stringSimilarity } from "./duplicate_detection.js";
import { loadConceptTypeSynonyms, normalizeEntityTypeForSchema } from "./schema_registry.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Open-ended signal bag for identifying an entity. */
export interface EntitySignals {
  /** Full name or display name of the entity. */
  name?: string;
  /** Email address. */
  email?: string;
  /** Organisation / company name. */
  company?: string;
  /** Website domain (e.g. "example.com"). */
  domain?: string;
  /** Phone number in any format. */
  phone?: string;
  /** Any additional string signals keyed by a caller-defined label. */
  [key: string]: string | undefined;
}

/** Resolution confidence band. */
export type ResolutionBand = "high" | "medium" | "low" | "unresolved";

/** A single resolved candidate with scoring metadata. */
export interface SignalCandidate {
  entity_id: string;
  snapshot: unknown;
  /** Normalised weighted score in [0, 1]. */
  identity_score: number;
  /** Which input signal keys contributed to the match. */
  matched_signals: string[];
  /** Which IdentifierMatchMode(s) were used. */
  match_modes: string[];
  /** Resolution band for this candidate. */
  band: ResolutionBand;
  /** Scoped entity types used during resolution. */
  scoped_entity_types: string[];
}

export interface IdentifyEntityBySignalsResult {
  /**
   * Best-matching entity, or null when nothing clears the unresolved floor
   * (score < 0.30). Never invented; only set when an entity was actually found
   * and scored.
   */
  best_match: SignalCandidate | null;
  /**
   * Remaining candidates ranked by score desc, entity_id asc.
   * Does NOT include best_match.
   */
  candidates: SignalCandidate[];
  /** Resolution band of best_match (or "unresolved" when best_match is null). */
  resolution_band: ResolutionBand;
  /**
   * Union of match_modes seen across all signal lookups.
   * Callers can use this to understand how confident the resolution process was.
   */
  match_modes: string[];
  /**
   * Entity types actually searched. May be wider than the caller's input when
   * synonym expansion fires.
   */
  scoped_entity_types: string[];
}

export interface IdentifyEntityBySignalsParams {
  signals: EntitySignals;
  /** Restrict lookups to this entity type (takes precedence over entity_types). */
  entity_type?: string;
  /** Restrict lookups to these entity types. Merged with synonym-expanded types. */
  entity_types?: string[];
  /** Maximum candidates to return (best_match excluded). Default 5, max 20. */
  max_candidates?: number;
  /** When true, attach recent observations to the best_match and each candidate. */
  include_observations?: boolean;
  /** Authenticated user id for all sub-queries. */
  userId: string;
}

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

/** Per-signal base weight before normalization. */
const SIGNAL_WEIGHTS: Record<string, number> = {
  email: 1.0,
  phone: 0.9,
  name: 0.7,
  domain: 0.6,
  company: 0.5,
};

/** Weight for any signal key not listed in SIGNAL_WEIGHTS. */
const OTHER_SIGNAL_WEIGHT = 0.4;

/** Per-additional-corroborating-signal bonus (after the first). */
const CORROBORATION_BONUS_PER_SIGNAL = 0.05;

/** Maximum total corroboration bonus. */
const CORROBORATION_BONUS_MAX = 0.15;

/** Band thresholds (inclusive lower bound). */
const BAND_THRESHOLDS: Array<{ band: ResolutionBand; min: number }> = [
  { band: "high", min: 0.85 },
  { band: "medium", min: 0.55 },
  { band: "low", min: 0.3 },
  { band: "unresolved", min: 0 },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function signalWeight(key: string): number {
  return SIGNAL_WEIGHTS[key] ?? OTHER_SIGNAL_WEIGHT;
}

function scoreToBand(score: number, semanticOnly: boolean): ResolutionBand {
  if (semanticOnly && score >= 0.85) {
    // Semantic matches capped at medium regardless of score
    return "medium";
  }
  for (const { band, min } of BAND_THRESHOLDS) {
    if (score >= min) return band;
  }
  return "unresolved";
}

/** Normalize a string value for comparison. */
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

interface AccumulatorEntry {
  entity_id: string;
  entity_type: string;
  snapshot: unknown;
  observations?: unknown[];
  /** weighted score contributions per signal key */
  signalContributions: Map<string, number>;
  matchModes: Set<string>;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve an entity from a multi-signal bundle. See module docblock for full
 * description of the scoring model and band semantics.
 */
export async function identifyEntityBySignals(
  params: IdentifyEntityBySignalsParams
): Promise<IdentifyEntityBySignalsResult> {
  const {
    signals,
    entity_type,
    entity_types,
    max_candidates = 5,
    include_observations = false,
    userId,
  } = params;

  const cappedMaxCandidates = Math.min(Math.max(max_candidates, 1), 20);

  // ------------------------------------------------------------------
  // 1. Enumerate supplied signals (non-empty string values only)
  // ------------------------------------------------------------------
  const suppliedSignals: Array<{ key: string; value: string }> = Object.entries(signals)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => ({ key: k, value: (v as string).trim() }));

  if (suppliedSignals.length === 0) {
    return emptyResult();
  }

  // ------------------------------------------------------------------
  // 2. Resolve scoped entity types (including synonym expansion)
  // ------------------------------------------------------------------
  const scopedTypes = await resolveScopedTypes(entity_type, entity_types, suppliedSignals, userId);

  // ------------------------------------------------------------------
  // 3. Per-signal lookups → accumulate by entity_id
  // ------------------------------------------------------------------
  const accumulator = new Map<string, AccumulatorEntry>();
  const allMatchModes = new Set<string>();

  for (const { key, value } of suppliedSignals) {
    // For each scoped type (or undefined = all types)
    const typesToSearch: Array<string | undefined> =
      scopedTypes.length > 0 ? scopedTypes : [undefined];

    for (const etype of typesToSearch) {
      let result;
      try {
        result = await retrieveEntityByIdentifierWithFallback({
          identifier: value,
          entityType: etype,
          userId,
          limit: 20,
          // Use `by` to restrict snapshot field scan for typed signals
          by: key !== "name" && SIGNAL_WEIGHTS[key] !== undefined ? key : undefined,
          includeObservations: include_observations,
          observationsLimit: 20,
        });
      } catch (err) {
        logger.warn(
          `[entity_signal_resolver] lookup failed for signal=${key} value=${value} etype=${etype ?? "all"}: ${String(err)}`
        );
        continue;
      }

      if (result.match_mode === "none" || result.entities.length === 0) continue;
      allMatchModes.add(result.match_mode);

      for (const entity of result.entities) {
        const eid = (entity as { id: string }).id;
        if (!eid) continue;

        // Compute per-signal similarity score
        const simScore = computeSignalSimilarity(key, value, entity);

        let entry = accumulator.get(eid);
        if (!entry) {
          entry = {
            entity_id: eid,
            entity_type: (entity as { entity_type: string }).entity_type ?? etype ?? "",
            snapshot: (entity as { snapshot: unknown }).snapshot,
            observations: (entity as { observations?: unknown[] }).observations,
            signalContributions: new Map(),
            matchModes: new Set(),
          };
          accumulator.set(eid, entry);
        }
        // Keep the best score per signal key for this entity
        const existing = entry.signalContributions.get(key) ?? 0;
        if (simScore > existing) {
          entry.signalContributions.set(key, simScore);
        }
        entry.matchModes.add(result.match_mode);
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Compute normalized weighted scores
  // ------------------------------------------------------------------
  // Denominator: sum of weights for all supplied signals (ensures max=1.0)
  const totalWeight = suppliedSignals.reduce((acc, { key }) => acc + signalWeight(key), 0);

  const scored: Array<{ entry: AccumulatorEntry; score: number; matchedSignals: string[] }> = [];

  for (const entry of accumulator.values()) {
    let weightedSum = 0;
    const matchedSignals: string[] = [];

    for (const { key } of suppliedSignals) {
      const contribution = entry.signalContributions.get(key) ?? 0;
      if (contribution > 0) {
        weightedSum += contribution * signalWeight(key);
        matchedSignals.push(key);
      }
    }

    // Normalize
    let score = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Corroboration bonus: +0.05 for each signal beyond the first that agreed
    if (matchedSignals.length > 1) {
      const bonus = Math.min(
        (matchedSignals.length - 1) * CORROBORATION_BONUS_PER_SIGNAL,
        CORROBORATION_BONUS_MAX
      );
      score = Math.min(1.0, score + bonus);
    }

    scored.push({ entry, score, matchedSignals });
  }

  // ------------------------------------------------------------------
  // 5. Sort deterministically: score desc, matchedSignals.length desc, entity_id asc
  // ------------------------------------------------------------------
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.matchedSignals.length !== a.matchedSignals.length)
      return b.matchedSignals.length - a.matchedSignals.length;
    return a.entry.entity_id.localeCompare(b.entry.entity_id);
  });

  // ------------------------------------------------------------------
  // 6. Split best_match vs candidates
  // ------------------------------------------------------------------
  if (scored.length === 0) {
    return emptyResult(scopedTypes, [...allMatchModes]);
  }

  const [best, ...rest] = scored;

  const isSemanticOnly = best.entry.matchModes.size === 1 && best.entry.matchModes.has("semantic");
  const bestBand = scoreToBand(best.score, isSemanticOnly);

  let bestMatch: SignalCandidate | null = null;
  if (bestBand !== "unresolved") {
    bestMatch = toCandidate(best, scopedTypes);
  }

  const candidates: SignalCandidate[] = rest
    .slice(0, cappedMaxCandidates)
    .map((s) => toCandidate(s, scopedTypes));

  return {
    best_match: bestMatch,
    candidates,
    resolution_band: bestBand,
    match_modes: [...allMatchModes],
    scoped_entity_types: scopedTypes,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported; tested via the main function)
// ---------------------------------------------------------------------------

function emptyResult(
  scopedTypes: string[] = [],
  matchModes: string[] = []
): IdentifyEntityBySignalsResult {
  return {
    best_match: null,
    candidates: [],
    resolution_band: "unresolved",
    match_modes: matchModes,
    scoped_entity_types: scopedTypes,
  };
}

function toCandidate(
  s: { entry: AccumulatorEntry; score: number; matchedSignals: string[] },
  scopedTypes: string[]
): SignalCandidate {
  const isSemanticOnly = s.entry.matchModes.size === 1 && s.entry.matchModes.has("semantic");
  return {
    entity_id: s.entry.entity_id,
    snapshot: s.entry.snapshot,
    identity_score: Math.round(s.score * 10000) / 10000, // 4dp
    matched_signals: s.matchedSignals,
    match_modes: [...s.entry.matchModes],
    band: scoreToBand(s.score, isSemanticOnly),
    scoped_entity_types: scopedTypes,
  };
}

/**
 * Resolve which entity types to search. If the caller specifies entity_type /
 * entity_types those take priority. Otherwise expand via query_synonyms so a
 * caller passing `company: "Acme"` can resolve a "company" entity without
 * knowing the exact type name.
 */
async function resolveScopedTypes(
  entity_type: string | undefined,
  entity_types: string[] | undefined,
  suppliedSignals: Array<{ key: string; value: string }>,
  userId: string
): Promise<string[]> {
  const explicit: string[] = [];
  if (entity_type) explicit.push(normalizeEntityTypeForSchema(entity_type));
  if (entity_types) explicit.push(...entity_types.map(normalizeEntityTypeForSchema));

  if (explicit.length > 0) {
    // Dedup while preserving order
    return [...new Set(explicit)];
  }

  // No explicit type: use synonym expansion from signal values
  try {
    const synonymMap = await loadConceptTypeSynonyms(userId);
    const expanded = new Set<string>();
    for (const { value } of suppliedSignals) {
      const norm = normalize(value);
      for (const [phrase, etype] of synonymMap) {
        if (norm.includes(phrase)) {
          expanded.add(etype);
        }
      }
    }
    return [...expanded];
  } catch (err) {
    logger.warn(`[entity_signal_resolver] synonym expansion failed: ${String(err)}`);
    return [];
  }
}

/**
 * Compute a similarity score [0, 1] for how well an entity matches a given
 * signal value. Uses exact/partial matching for typed signals and
 * stringSimilarity for name/fuzzy signals.
 */
function computeSignalSimilarity(signalKey: string, signalValue: string, entity: unknown): number {
  const snap = (entity as { snapshot: Record<string, unknown> | null }).snapshot;
  const canonicalName = (entity as { canonical_name?: string }).canonical_name ?? "";
  const sigNorm = normalize(signalValue);

  if (signalKey === "email") {
    return computeExactFieldScore(snap, ["email"], sigNorm);
  }
  if (signalKey === "phone") {
    // Normalize phone: digits only for comparison
    const digitsOnly = (s: string) => s.replace(/\D/g, "");
    const sigDigits = digitsOnly(signalValue);
    if (!sigDigits) return 0;
    const fields = ["phone", "phone_number", "mobile", "tel"];
    for (const field of fields) {
      const raw = getSnapshotField(snap, field);
      if (raw && digitsOnly(raw) === sigDigits) return 1.0;
    }
    return 0;
  }
  if (signalKey === "domain") {
    return computeExactFieldScore(snap, ["domain", "website", "url"], sigNorm);
  }
  if (signalKey === "company") {
    const companyScore = computeFuzzyFieldScore(
      snap,
      ["company", "organization", "organisation"],
      sigNorm
    );
    return companyScore;
  }
  if (signalKey === "name") {
    // First try canonical_name similarity
    const nameSim = stringSimilarity(canonicalName, signalValue);
    // Then try snapshot name fields
    const fieldSim = computeFuzzyFieldScore(
      snap,
      ["name", "full_name", "display_name", "title"],
      sigNorm
    );
    return Math.max(nameSim, fieldSim);
  }
  // Generic: try exact match on a snapshot field with the same key, then fuzzy
  const exactScore = computeExactFieldScore(snap, [signalKey], sigNorm);
  if (exactScore > 0) return exactScore;
  return computeFuzzyFieldScore(snap, [signalKey], sigNorm);
}

function getSnapshotField(
  snap: Record<string, unknown> | null | undefined,
  field: string
): string | null {
  if (!snap) return null;
  const v = snap[field];
  if (v == null) return null;
  return String(v).trim();
}

function computeExactFieldScore(
  snap: Record<string, unknown> | null | undefined,
  fields: string[],
  needle: string
): number {
  for (const field of fields) {
    const raw = getSnapshotField(snap, field);
    if (!raw) continue;
    const norm = normalize(raw);
    if (norm === needle) return 1.0;
    if (norm.includes(needle) || needle.includes(norm)) return 0.8;
  }
  return 0;
}

function computeFuzzyFieldScore(
  snap: Record<string, unknown> | null | undefined,
  fields: string[],
  needle: string
): number {
  let best = 0;
  for (const field of fields) {
    const raw = getSnapshotField(snap, field);
    if (!raw) continue;
    const sim = stringSimilarity(raw, needle);
    if (sim > best) best = sim;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pure scoring helper exported for unit tests
// ---------------------------------------------------------------------------

export interface ScoringTableInput {
  suppliedSignals: Array<{ key: string; weight?: number }>;
  entityContributions: Array<{ key: string; contribution: number }>;
}

export interface ScoringTableResult {
  rawScore: number;
  normalizedScore: number;
  scoreWithBonus: number;
  matchedSignals: string[];
}

/**
 * Pure scoring logic exposed for unit-testing without any DB calls.
 */
export function computeWeightedScore(input: ScoringTableInput): ScoringTableResult {
  const { suppliedSignals, entityContributions } = input;
  const contribMap = new Map(
    entityContributions.map(({ key, contribution }) => [key, contribution])
  );

  const totalWeight = suppliedSignals.reduce((acc, { key, weight }) => {
    return acc + (weight ?? signalWeight(key));
  }, 0);

  let weightedSum = 0;
  const matchedSignals: string[] = [];

  for (const { key, weight } of suppliedSignals) {
    const contribution = contribMap.get(key) ?? 0;
    if (contribution > 0) {
      weightedSum += contribution * (weight ?? signalWeight(key));
      matchedSignals.push(key);
    }
  }

  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const bonus =
    matchedSignals.length > 1
      ? Math.min(
          (matchedSignals.length - 1) * CORROBORATION_BONUS_PER_SIGNAL,
          CORROBORATION_BONUS_MAX
        )
      : 0;
  const scoreWithBonus = Math.min(1.0, normalizedScore + bonus);

  return {
    rawScore: weightedSum,
    normalizedScore,
    scoreWithBonus,
    matchedSignals,
  };
}
