/**
 * Search Service (FU-105)
 *
 * Deterministic search ranking with tiebreakers.
 */

import type { NeotomaRecord } from "../db.js";

/**
 * Rank search results deterministically
 */
export function rankSearchResults(
  results: NeotomaRecord[],
  query?: string
): NeotomaRecord[] {
  if (results.length === 0) {
    return results;
  }

  return results
    .map((record) => ({
      record,
      score: query ? calculateScore(record, query) : 0,
    }))
    .sort((a, b) => {
      // Primary: score (higher first)
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // Tiebreaker 1: created_at (newer first)
      const timeDiff = b.record.created_at.localeCompare(a.record.created_at);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      // Tiebreaker 2: id (lexicographic for stability)
      return a.record.id.localeCompare(b.record.id);
    })
    .map(({ record }) => record);
}

/**
 * Calculate relevance score for record (deterministic)
 */
function calculateScore(record: NeotomaRecord, query: string): number {
  let score = 0;
  const queryLower = query.toLowerCase();
  const regex = new RegExp(
    queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi"
  );

  // Exact type match
  if (record.type.toLowerCase() === queryLower) {
    score += 10;
  }

  // Type contains query
  if (record.type.toLowerCase().includes(queryLower)) {
    score += 5;
  }

  // Match in properties JSON (case-insensitive)
  const propertiesText = JSON.stringify(record.properties || {}).toLowerCase();
  const propertyMatches = propertiesText.match(regex);
  if (propertyMatches) {
    score += propertyMatches.length;
  }

  // Exact field value matches (higher score)
  for (const [key, value] of Object.entries(record.properties || {})) {
    if (typeof value === "string" && value.toLowerCase() === queryLower) {
      score += 3;
    } else if (
      typeof value === "string" &&
      value.toLowerCase().includes(queryLower)
    ) {
      score += 1;
    }
  }

  return score;
}

/**
 * Sort records deterministically (for non-search queries)
 */
export function sortRecordsDeterministically(
  records: NeotomaRecord[]
): NeotomaRecord[] {
  return [...records].sort((a, b) => {
    // Primary: created_at DESC (newer first)
    const timeDiff = b.created_at.localeCompare(a.created_at);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    // Tiebreaker: id ASC (lexicographic)
    return a.id.localeCompare(b.id);
  });
}

