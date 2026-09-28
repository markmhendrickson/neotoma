#!/usr/bin/env tsx
/**
 * Validate the claim-level public-source contract embedded in
 * docs/site/site_doc_manifest.yaml.
 *
 * The validator is deliberately local and deterministic. It verifies that every
 * required claim resolves to a public in-repository source, that the current
 * source bytes still match the approved digest, and that the immutable GitHub
 * link, freshness policy, transform, fallback, and privacy classification are
 * explicit. Network availability is not part of the contract.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(here, "..");
const DEFAULT_MANIFEST = "docs/site/site_doc_manifest.yaml";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLAIM_CLASSES = new Set(["current", "historical", "aspirational"]);
const FORBIDDEN_SOURCE_SEGMENTS = new Set(["private", ".env", "secrets", "credentials"]);
const FORBIDDEN_MANIFEST_PATTERNS: readonly [RegExp, string][] = [
  [/\/Users\//, "operator home path"],
  [/\/home\/[^\s/]+\//, "operator home path"],
  [/file:\/\//, "local file URL"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key material"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/, "GitHub credential"],
];

interface ClaimSourceContract {
  schema_version?: number;
  manifest_revision?: string;
  source_repository?: string;
}

interface ClaimSourceRow {
  claim_id?: string;
  routes?: string[];
  section_id?: string;
  required?: boolean;
  claim_class?: string;
  source_repository?: string;
  source_path?: string;
  source_commit?: string;
  source_fragment?: string;
  source_digest?: string;
  transform?: string;
  fallback?: string;
  public_url?: string;
  reviewer?: string;
  last_verified?: string;
  freshness_days?: number;
  license?: string;
  provenance?: string;
  public_classification?: string;
}

interface SiteDocManifest {
  claim_source_contract?: ClaimSourceContract;
  claims?: ClaimSourceRow[];
}

export interface ValidationOptions {
  repoRoot?: string;
  manifestPath?: string;
  asOf?: string;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSafeRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value) || value.includes("\\")) return false;
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith("../")) return false;
  const segments = normalized.split("/");
  return !segments.some((segment) => FORBIDDEN_SOURCE_SEGMENTS.has(segment.toLowerCase()));
}

function expectedPublicUrl(row: ClaimSourceRow): string {
  return `https://github.com/${row.source_repository}/blob/${row.source_commit}/${row.source_path}${
    row.source_fragment ? `#${row.source_fragment}` : ""
  }`;
}

function parseUtcDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function ageInUtcDays(from: Date, to: Date): number {
  return Math.floor((to.valueOf() - from.valueOf()) / 86_400_000);
}

export function validateSiteClaimSources(options: ValidationOptions = {}): string[] {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const manifestPath = path.resolve(repoRoot, options.manifestPath ?? DEFAULT_MANIFEST);
  const asOfValue = options.asOf ?? new Date().toISOString().slice(0, 10);
  const asOf = parseUtcDate(asOfValue);
  const errors: string[] = [];

  if (!asOf) return [`Invalid --as-of date: ${asOfValue}`];
  if (!fs.existsSync(manifestPath)) return [`Missing claim-source manifest: ${manifestPath}`];

  const raw = fs.readFileSync(manifestPath, "utf8");
  for (const [pattern, label] of FORBIDDEN_MANIFEST_PATTERNS) {
    if (pattern.test(raw)) errors.push(`Manifest contains forbidden ${label}`);
  }

  let manifest: SiteDocManifest;
  try {
    manifest = yaml.load(raw) as SiteDocManifest;
  } catch (error) {
    return [`Invalid YAML in ${path.relative(repoRoot, manifestPath)}: ${String(error)}`];
  }

  const contract = manifest?.claim_source_contract;
  if (!contract || contract.schema_version !== 1) {
    errors.push("claim_source_contract.schema_version must be 1");
  }
  if (!contract?.manifest_revision?.trim()) {
    errors.push("claim_source_contract.manifest_revision is required");
  }
  if (!contract?.source_repository?.match(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)) {
    errors.push("claim_source_contract.source_repository must be an owner/repository slug");
  }

  const claims = manifest?.claims;
  if (!Array.isArray(claims) || claims.length === 0) {
    errors.push("claims must contain at least one claim-source row");
    return errors;
  }

  const seenClaimIds = new Set<string>();
  for (const [index, row] of claims.entries()) {
    const label = row.claim_id || `claims[${index}]`;
    if (!row.claim_id?.match(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)) {
      errors.push(`${label}: claim_id must be a stable lowercase identifier`);
    } else if (seenClaimIds.has(row.claim_id)) {
      errors.push(`${label}: duplicate claim_id`);
    } else {
      seenClaimIds.add(row.claim_id);
    }

    if (
      !Array.isArray(row.routes) ||
      row.routes.length === 0 ||
      row.routes.some((r) => !r.startsWith("/"))
    ) {
      errors.push(`${label}: routes must contain absolute public paths`);
    }
    if (!row.section_id?.trim()) errors.push(`${label}: section_id is required`);
    if (row.required !== true) errors.push(`${label}: v1 rows must be required and fail closed`);
    if (!row.claim_class || !CLAIM_CLASSES.has(row.claim_class)) {
      errors.push(`${label}: claim_class must be current, historical, or aspirational`);
    }
    if (row.source_repository !== contract?.source_repository) {
      errors.push(`${label}: source_repository must match claim_source_contract.source_repository`);
    }
    if (!row.source_path || !isSafeRelativePath(row.source_path)) {
      errors.push(`${label}: source_path must be a public repository-relative path`);
    }
    if (!row.source_commit?.match(SHA_PATTERN)) {
      errors.push(`${label}: source_commit must be a 40-character immutable SHA`);
    }
    if (!row.source_digest?.match(DIGEST_PATTERN)) {
      errors.push(`${label}: source_digest must be a lowercase SHA-256 digest`);
    }
    if (row.transform !== "whole_file_sha256_v1") {
      errors.push(`${label}: transform must be whole_file_sha256_v1`);
    }
    if (row.fallback !== "fail_closed") errors.push(`${label}: fallback must be fail_closed`);
    if (row.public_classification !== "public") {
      errors.push(`${label}: public_classification must be public`);
    }
    if (!row.reviewer?.trim()) errors.push(`${label}: reviewer is required`);
    if (!row.license?.trim()) errors.push(`${label}: license is required`);
    if (!row.provenance?.trim()) errors.push(`${label}: provenance is required`);

    if (row.public_url !== expectedPublicUrl(row)) {
      errors.push(`${label}: public_url must resolve exactly to the pinned repository path`);
    }

    if (row.claim_class === "current") {
      const verified = row.last_verified ? parseUtcDate(row.last_verified) : null;
      if (!verified) {
        errors.push(`${label}: current claims require last_verified as YYYY-MM-DD`);
      }
      if (!Number.isInteger(row.freshness_days) || (row.freshness_days ?? 0) <= 0) {
        errors.push(`${label}: current claims require a positive freshness_days`);
      }
      if (
        verified &&
        (row.freshness_days ?? 0) > 0 &&
        ageInUtcDays(verified, asOf) > row.freshness_days!
      ) {
        errors.push(`${label}: current claim is stale as of ${asOfValue}`);
      }
    }

    if (row.source_path && isSafeRelativePath(row.source_path)) {
      const absoluteSource = path.resolve(repoRoot, row.source_path);
      if (!absoluteSource.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) {
        errors.push(`${label}: source_path escapes the repository root`);
      } else if (!fs.existsSync(absoluteSource) || !fs.statSync(absoluteSource).isFile()) {
        errors.push(`${label}: source_path does not resolve to a file`);
      } else if (row.source_digest?.match(DIGEST_PATTERN)) {
        const actualDigest = sha256(fs.readFileSync(absoluteSource));
        if (actualDigest !== row.source_digest) {
          errors.push(`${label}: source digest drift for ${row.source_path}`);
        }
      }
    }
  }

  return errors;
}

function parseCliArgs(argv: string[]): ValidationOptions {
  const options: ValidationOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--as-of") options.asOf = argv[++index];
    else if (arg === "--manifest") options.manifestPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = validateSiteClaimSources(parseCliArgs(process.argv.slice(2)));
    if (errors.length > 0) {
      for (const error of errors) console.error(`ERROR: ${error}`);
      process.exit(1);
    }
    console.log("Site claim-source manifest validation passed.");
  } catch (error) {
    console.error(`ERROR: ${String(error)}`);
    process.exit(1);
  }
}
