/**
 * ENV_CONTAMINATION audit check — detects entity observations whose field
 * values carry dev/test/staging environment markers that would be anomalous
 * in a production database.
 *
 * This is a read-only heuristic. It never mutates state. Callers decide
 * whether to act on findings.
 *
 * Exported surface:
 *   - ENV_CONTAMINATION_INDICATORS   — the pattern set (importable for tests)
 *   - classifyIndicator()            — categorise one string value
 *   - scanSnapshotForContamination() — check a single entity snapshot
 *   - ContaminationFinding           — result shape used by the /audit skill
 */

// ---------------------------------------------------------------------------
// Indicator patterns
// ---------------------------------------------------------------------------

/**
 * Patterns whose presence in a field value signals a dev/test/staging origin.
 * The array is ordered from most-specific to least-specific; the first match
 * wins in classifyIndicator().
 */
export const ENV_CONTAMINATION_INDICATORS: Array<{
  /** Short token used in the hint text. */
  label: string;
  /** Case-insensitive regex applied to the stringified field value. */
  pattern: RegExp;
  /** Risk level this indicator carries on its own. */
  severity: "high" | "medium" | "low";
}> = [
  // Loopback addresses
  { label: "loopback_ip", pattern: /\b127\.0\.0\.1\b/, severity: "high" },
  // Loopback IPv6: match [::1], (::1), ::1 — cannot use \b due to colon chars
  {
    label: "loopback_ipv6",
    pattern: /(?:^|[\s[(,@/])(::1)(?:[\]:\s,/)]|$)/i,
    severity: "high",
  },
  // Localhost hostname
  { label: "localhost", pattern: /\blocalhost\b/i, severity: "high" },
  // Kubernetes cluster-internal service DNS — must come before dot_local to avoid shadowing
  {
    label: "kube_svc_dns",
    pattern: /\.svc\.cluster\.local(?:\/|:|$)/i,
    severity: "high",
  },
  // .local mDNS suffix (e.g. "myhost.local") — after kube_svc_dns
  { label: "dot_local", pattern: /\.local(?:\/|:|$)/i, severity: "medium" },
  // Explicit dev sub-domain: dev.example.com or dev-api.example.com
  { label: "dev_subdomain", pattern: /(?:^|[./])dev[.-]/i, severity: "medium" },
  // Explicit staging sub-domain
  {
    label: "staging_subdomain",
    pattern: /(?:^|[./])staging[.-]/i,
    severity: "medium",
  },
  // user_id patterns matching a known test-user convention — must come before test_prefix
  // to avoid test_user being caught by the shorter pattern
  { label: "test_user_id", pattern: /\btest[_-]user/i, severity: "medium" },
  // Well-known dev/test user_id patterns (UUID nil or all-zeros)
  {
    label: "nil_uuid",
    pattern: /^00000000-0000-0000-0000-000000000000$/,
    severity: "medium",
  },
  // test- prefix (e.g. "test-org", "test-db")
  { label: "test_prefix", pattern: /\btest-/i, severity: "low" },
  // -dev suffix (e.g. "api-dev", "env-dev")
  { label: "dev_suffix", pattern: /-dev\b/i, severity: "low" },
  // -staging suffix
  { label: "staging_suffix", pattern: /-staging\b/i, severity: "low" },
  // Private IPv4 ranges used by Docker / kind / minikube etc.
  {
    label: "private_docker_ip",
    pattern: /\b172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}\b/,
    severity: "low",
  },
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export interface IndicatorMatch {
  label: string;
  severity: "high" | "medium" | "low";
  matched_value: string;
}

/**
 * Scan a single string value for any contamination indicator.
 * Returns the first matching indicator, or null.
 */
export function classifyIndicator(value: string): IndicatorMatch | null {
  const str = String(value);
  for (const indicator of ENV_CONTAMINATION_INDICATORS) {
    if (indicator.pattern.test(str)) {
      return {
        label: indicator.label,
        severity: indicator.severity,
        matched_value: str.length > 200 ? str.slice(0, 200) + "…" : str,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Snapshot scanner
// ---------------------------------------------------------------------------

export interface FieldHit {
  field: string;
  match: IndicatorMatch;
}

export interface ContaminationFinding {
  check_id: "ENV_CONTAMINATION";
  entity_id: string;
  entity_type: string;
  canonical_name: string | null;
  severity: "high" | "medium" | "low";
  hits: FieldHit[];
  hint: string;
}

/**
 * Scan a flattened entity snapshot (field -> value map) for contamination
 * indicators. Returns a finding if any field matches, otherwise null.
 *
 * @param entity_id       - The entity's ID (for the finding).
 * @param entity_type     - The entity's type string.
 * @param canonical_name  - The entity's canonical name (may be null).
 * @param snapshot        - Flat field->value map from the entity snapshot.
 * @param skip_fields     - Field names to skip (e.g. internal provenance keys).
 */
export function scanSnapshotForContamination(
  entity_id: string,
  entity_type: string,
  canonical_name: string | null,
  snapshot: Record<string, unknown>,
  skip_fields: ReadonlySet<string> = DEFAULT_SKIP_FIELDS
): ContaminationFinding | null {
  const hits: FieldHit[] = [];
  let maxSeverity: "high" | "medium" | "low" = "low";

  for (const [field, raw] of Object.entries(snapshot)) {
    if (skip_fields.has(field)) continue;
    if (raw == null) continue;

    const value = typeof raw === "string" ? raw : JSON.stringify(raw);
    const match = classifyIndicator(value);
    if (match === null) continue;

    hits.push({ field, match });

    if (
      match.severity === "high" ||
      (match.severity === "medium" && maxSeverity !== "high") ||
      (match.severity === "low" && maxSeverity === "low")
    ) {
      maxSeverity = match.severity;
    }
  }

  if (hits.length === 0) return null;

  const hitDescriptions = hits.map((h) => `\`${h.field}\` matches ${h.match.label}`).join("; ");

  return {
    check_id: "ENV_CONTAMINATION",
    entity_id,
    entity_type,
    canonical_name,
    severity: maxSeverity,
    hits,
    hint:
      `Entity "${canonical_name ?? entity_id}" (${entity_type}) contains field values ` +
      `that look like dev/test/staging environment markers: ${hitDescriptions}. ` +
      `Verify this record was not imported from a non-production environment. ` +
      `If confirmed, use correct() to update the field values or delete_entity() to remove.`,
  };
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Fields that are structural metadata, not user-provided values — skipping
 * them avoids false positives from internal IDs / timestamps.
 */
const DEFAULT_SKIP_FIELDS: ReadonlySet<string> = new Set([
  "entity_id",
  "created_at",
  "updated_at",
  "observation_count",
  "user_id",
  "_migration_run_id",
]);
