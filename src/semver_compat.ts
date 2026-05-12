/**
 * Shared CLI/API semver compatibility: major mismatch or >2 minor drift is incompatible;
 * 1–2 minor drift is compatible with warning; patch ignored.
 */

export type SemverTriplet = [number, number, number];

/** Parse leading X.Y.Z from a version string; null if not semver-like. */
export function parseSemverTriplet(v: string): SemverTriplet | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
}

export interface CompareVersionsResult {
  compatible: boolean;
  /** Human-readable warning when compatible but drifted, or when version unknown. */
  warning?: string;
}

/**
 * Compare two Neotoma-style semver strings (e.g. CLI vs API from /health).
 * Rules mirror `neotoma compat`: major mismatch or |minor| > 2 ⇒ incompatible;
 * 1–2 minor drift ⇒ compatible + warning; unknown remote version ⇒ compatible + warning.
 */
export function compareCliApiCompat(localVersion: string, remoteVersion: string): CompareVersionsResult {
  if (remoteVersion === "unknown" || remoteVersion.trim() === "") {
    return {
      compatible: true,
      warning: "Remote did not report a version. Compatibility cannot be verified.",
    };
  }

  const local = parseSemverTriplet(localVersion);
  const remote = parseSemverTriplet(remoteVersion);

  if (!local || !remote) {
    return {
      compatible: true,
      warning: `Could not parse versions for comparison (local=${localVersion}, remote=${remoteVersion}).`,
    };
  }

  const majorDiff = Math.abs(local[0] - remote[0]);
  const minorDiff = Math.abs(local[1] - remote[1]);

  if (majorDiff > 0) {
    return {
      compatible: false,
      warning: `Major version mismatch (local ${localVersion} vs remote ${remoteVersion}). Upgrade the older component.`,
    };
  }

  if (minorDiff > 2) {
    return {
      compatible: false,
      warning: `Minor version drift of ${minorDiff} (local ${localVersion} vs remote ${remoteVersion}). Consider upgrading the older component.`,
    };
  }

  if (minorDiff > 0) {
    return {
      compatible: true,
      warning: `Minor version difference detected (local ${localVersion} vs remote ${remoteVersion}).`,
    };
  }

  return { compatible: true };
}
