/**
 * Instance-stored script attachments → materialized `scripts/*` files (#1951).
 *
 * A skill row may EMBEDS one or more `file_asset` entities (script files
 * stored content-addressed via raw_storage.ts). Behind
 * `--include-instance-scripts` (which implies `--include-instance-skills`),
 * each attachment's bytes are downloaded, SHA-256 verified against the
 * recorded `content_hash`, and written to `<skill>/scripts/<original_filename>`
 * — but ONLY when the hash has been explicitly approved by the local
 * operator via a hash-pin consent manifest.
 *
 * Execution-consent contract (the actual decision this feature turns on):
 *   - `~/.neotoma/instance-skills/approvals.json` maps
 *     `<instance>/<skill-dir>/<filename>` -> approved sha256.
 *   - A script whose hash is NOT in the manifest is not written unless the
 *     run passes `--approve` (which records the hash as approved).
 *   - A script whose hash CHANGED since approval is not written; a warning
 *     tells the operator to re-run with `--approve` after reviewing the diff.
 *   - Writer (whoever authored the skill row) proposes; the local operator's
 *     `--approve` run is the only thing that grants execution materialization.
 *
 * Hard constraints (per #1951 design decision — no server-side execution,
 * no dependency resolution): this module only downloads, verifies, and
 * writes files. It never executes, spawns, or evals anything.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { InstanceScriptAttachment } from "./instance_skills_client.js";

export type ApprovalManifest = Record<string, string>;

/** Path to the hash-pin consent manifest. */
export function getApprovalsManifestPath(homeDir: string): string {
  return join(homeDir, ".neotoma", "instance-skills", "approvals.json");
}

/** Load the approvals manifest, or `{}` when absent/corrupt. */
export function loadApprovalsManifest(manifestPath: string): ApprovalManifest {
  try {
    const raw = readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: ApprovalManifest = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveApprovalsManifest(manifestPath: string, manifest: ApprovalManifest): void {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

/** Manifest key for a given instance/skill/filename triple. */
export function approvalKey(instanceHost: string, skillDirName: string, filename: string): string {
  return `${instanceHost}/${skillDirName}/${filename}`;
}

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export type ScriptWriteOutcome =
  | { status: "written"; path: string; hash: string }
  | { status: "hash_mismatch"; expected: string; actual: string }
  | { status: "blocked_unapproved"; hash: string; key: string }
  | { status: "blocked_hash_changed"; approvedHash: string; newHash: string; key: string };

/**
 * Verify downloaded bytes against the recorded `content_hash`, check the
 * hash-pin manifest, and write to `<skillDir>/scripts/<filename>` only when
 * approved. `approve: true` records the (verified) hash as approved before
 * writing — this is the CLI's `--approve` flag.
 *
 * Never writes on a content_hash mismatch, regardless of approval state:
 * that is a data-integrity failure, not a consent decision.
 */
export function verifyAndWriteInstanceScript(params: {
  bytes: Buffer;
  attachment: InstanceScriptAttachment;
  skillDir: string;
  instanceHost: string;
  skillDirName: string;
  manifest: ApprovalManifest;
  approve: boolean;
}): ScriptWriteOutcome {
  const { bytes, attachment, skillDir, instanceHost, skillDirName, manifest, approve } = params;

  const actualHash = computeContentHash(bytes);
  if (actualHash !== attachment.content_hash) {
    return { status: "hash_mismatch", expected: attachment.content_hash, actual: actualHash };
  }

  const key = approvalKey(instanceHost, skillDirName, attachment.original_filename);
  const approvedHash = manifest[key];

  if (approvedHash === undefined) {
    if (!approve) {
      return { status: "blocked_unapproved", hash: actualHash, key };
    }
    manifest[key] = actualHash;
  } else if (approvedHash !== actualHash) {
    if (!approve) {
      return {
        status: "blocked_hash_changed",
        approvedHash,
        newHash: actualHash,
        key,
      };
    }
    manifest[key] = actualHash;
  }
  // approvedHash === actualHash: already approved, nothing to update.

  const scriptsDir = join(skillDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const outPath = join(scriptsDir, attachment.original_filename);
  writeFileSync(outPath, bytes);
  return { status: "written", path: outPath, hash: actualHash };
}
