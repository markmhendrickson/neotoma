/**
 * AAuth attestation trust configuration loader.
 *
 * Builds the merged trust set used by attestation verifiers:
 *
 * - Always includes the bundled Apple Attestation Root at
 *   `config/aauth/apple_attestation_root.pem` (under the repository
 *   root, resolved relative to the running process).
 * - Optionally appends operator-supplied CAs from
 *   `NEOTOMA_AAUTH_ATTESTATION_CA_PATH` (path to a single PEM file or a
 *   directory of PEM files).
 * - Optionally exposes a WebAuthn AAGUID allowlist from
 *   `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` so the file format is stable
 *   even though the WebAuthn verifier is currently a stub.
 *
 * Fail-open semantics: missing or malformed operator inputs log a single
 * warning and continue with whatever was already loaded. Operators must
 * never lock themselves out of plain-signed writes by misconfiguring
 * trust — verifier failure simply falls through to the lower tier.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { X509Certificate } from "node:crypto";

const BUNDLED_APPLE_ROOT_RELATIVE = "config/aauth/apple_attestation_root.pem";
const BUNDLED_TPM_ROOTS_RELATIVE = "config/aauth/tpm_attestation_roots";

export interface AttestationTrustConfig {
  /** Trusted attestation roots, leaf-equivalence checked by SHA-256. */
  attestationRoots: X509Certificate[];
  /** Optional WebAuthn AAGUID allowlist. Empty array means no restriction. */
  webauthnAaguidAllowlist: string[];
  /** Diagnostic notes accumulated during load (used for log lines). */
  diagnostics: string[];
}

let cachedConfig: AttestationTrustConfig | null = null;

/**
 * Public entry point. Computes the trust config once per process and
 * caches the result; pass `{ refresh: true }` from tests to rebuild.
 */
export function loadAttestationTrustConfig(
  options: { refresh?: boolean } = {},
): AttestationTrustConfig {
  if (cachedConfig && !options.refresh) return cachedConfig;
  const config = buildConfig();
  cachedConfig = config;
  return config;
}

/**
 * Test helper: clear the cached config so the next call re-reads env
 * and disk inputs. Production code never calls this.
 */
export function resetAttestationTrustConfigCacheForTests(): void {
  cachedConfig = null;
}

function buildConfig(): AttestationTrustConfig {
  const diagnostics: string[] = [];
  const roots: X509Certificate[] = [];

  const bundledPath = resolveBundledRootPath();
  try {
    const pem = readFileSync(bundledPath, "utf8");
    const certs = parsePemCertificates(pem);
    if (certs.length === 0) {
      diagnostics.push(
        `attestation_trust: bundled apple root parsed but produced no certificates (${bundledPath})`,
      );
    } else {
      roots.push(...certs);
    }
  } catch (err) {
    diagnostics.push(
      `attestation_trust: failed to load bundled apple root from ${bundledPath}: ${describe(err)}`,
    );
  }

  const tpmRootsPath = resolveBundledTpmRootsPath();
  if (tpmRootsPath !== null) {
    try {
      const tpmCerts = loadCertificateDirectory(tpmRootsPath);
      for (const cert of tpmCerts) {
        if (!alreadyTrusted(roots, cert)) {
          roots.push(cert);
        }
      }
    } catch (err) {
      diagnostics.push(
        `attestation_trust: failed to load bundled TPM roots from ${tpmRootsPath}: ${describe(err)}`,
      );
    }
  }

  const operatorPath = process.env.NEOTOMA_AAUTH_ATTESTATION_CA_PATH;
  if (operatorPath && operatorPath.trim().length > 0) {
    try {
      const operatorCerts = loadOperatorCAs(operatorPath.trim());
      if (operatorCerts.length === 0) {
        diagnostics.push(
          `attestation_trust: NEOTOMA_AAUTH_ATTESTATION_CA_PATH=${operatorPath} produced no certificates`,
        );
      }
      for (const cert of operatorCerts) {
        if (!alreadyTrusted(roots, cert)) {
          roots.push(cert);
        }
      }
    } catch (err) {
      diagnostics.push(
        `attestation_trust: failed to load operator CAs from ${operatorPath}: ${describe(err)}`,
      );
    }
  }

  const aaguidPath = process.env.NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH;
  let webauthnAaguidAllowlist: string[] = [];
  if (aaguidPath && aaguidPath.trim().length > 0) {
    try {
      const raw = readFileSync(aaguidPath.trim(), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
        webauthnAaguidAllowlist = (parsed as string[]).map((v) =>
          v.trim().toLowerCase(),
        );
      } else {
        diagnostics.push(
          `attestation_trust: NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH=${aaguidPath} did not contain a JSON array of strings`,
        );
      }
    } catch (err) {
      diagnostics.push(
        `attestation_trust: failed to load AAGUID allowlist from ${aaguidPath}: ${describe(err)}`,
      );
    }
  }

  for (const note of diagnostics) {
    // eslint-disable-next-line no-console
    console.warn(note);
  }

  return { attestationRoots: roots, webauthnAaguidAllowlist, diagnostics };
}

function resolveBundledRootPath(): string {
  // Resolve relative to the current working directory; the project ships
  // the PEM at `config/aauth/apple_attestation_root.pem` and the server
  // is launched from the repository root. Tests can shim CWD or set
  // NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH for an absolute override.
  const override = process.env.NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH;
  if (override && override.trim().length > 0) {
    const candidate = override.trim();
    return isAbsolute(candidate) ? candidate : resolve(candidate);
  }
  return resolve(process.cwd(), BUNDLED_APPLE_ROOT_RELATIVE);
}

/**
 * Resolve the bundled TPM 2.0 attestation roots directory. Returns
 * `null` when neither the override env var nor the default directory
 * exists — bundled TPM roots are optional because the WebAuthn `tpm`
 * verifier still cascades to the operator allowlist or `software` if no
 * trusted root is configured.
 */
function resolveBundledTpmRootsPath(): string | null {
  const override = process.env.NEOTOMA_AAUTH_TPM_ROOTS_PATH;
  if (override && override.trim().length > 0) {
    const candidate = override.trim();
    const absolute = isAbsolute(candidate) ? candidate : resolve(candidate);
    try {
      statSync(absolute);
      return absolute;
    } catch {
      return null;
    }
  }
  const defaultPath = resolve(process.cwd(), BUNDLED_TPM_ROOTS_RELATIVE);
  try {
    statSync(defaultPath);
    return defaultPath;
  } catch {
    return null;
  }
}

/**
 * Load all `.pem` / `.crt` certificates from a directory (recursive
 * single level) so a TPM CA bundle directory can drop in vendor
 * sub-directories without configuration churn.
 */
function loadCertificateDirectory(directory: string): X509Certificate[] {
  const certs: X509Certificate[] = [];
  const stat = statSync(directory);
  if (!stat.isDirectory()) {
    const pem = readFileSync(directory, "utf8");
    return parsePemCertificates(pem);
  }
  for (const entry of readdirSync(directory)) {
    const filePath = join(directory, entry);
    let entryStat;
    try {
      entryStat = statSync(filePath);
    } catch {
      continue;
    }
    if (entryStat.isDirectory()) {
      certs.push(...loadCertificateDirectory(filePath));
      continue;
    }
    if (!entry.endsWith(".pem") && !entry.endsWith(".crt")) continue;
    try {
      const pem = readFileSync(filePath, "utf8");
      certs.push(...parsePemCertificates(pem));
    } catch {
      // Skip unreadable files; diagnostics are noisy but not fatal.
    }
  }
  return certs;
}

function loadOperatorCAs(rawPath: string): X509Certificate[] {
  const absolute = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
  const stat = statSync(absolute);
  const certs: X509Certificate[] = [];
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absolute)) {
      if (!entry.endsWith(".pem") && !entry.endsWith(".crt")) continue;
      const filePath = join(absolute, entry);
      try {
        const pem = readFileSync(filePath, "utf8");
        certs.push(...parsePemCertificates(pem));
      } catch {
        // Continue with the next entry. Missing or unreadable files are
        // a configuration mistake but not a hard failure.
      }
    }
  } else {
    const pem = readFileSync(absolute, "utf8");
    certs.push(...parsePemCertificates(pem));
  }
  return certs;
}

function parsePemCertificates(pem: string): X509Certificate[] {
  const certs: X509Certificate[] = [];
  const blocks = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (!blocks) return certs;
  for (const block of blocks) {
    try {
      certs.push(new X509Certificate(block));
    } catch {
      // Skip malformed blocks; the diagnostic note carries the path.
    }
  }
  return certs;
}

function alreadyTrusted(
  pool: X509Certificate[],
  candidate: X509Certificate,
): boolean {
  return pool.some((cert) => cert.fingerprint256 === candidate.fingerprint256);
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
