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
 *     run passes `--approve-scripts` (which records the hash as approved).
 *   - A script whose hash CHANGED since approval is not written; a warning
 *     tells the operator to re-run with `--approve-scripts` after reviewing
 *     the diff.
 *   - Writer (whoever authored the skill row) proposes; the local operator's
 *     `--approve-scripts` run is the only thing that grants execution
 *     materialization. (`--approve` is a deprecated, hidden alias for
 *     `--approve-scripts`.)
 *
 * Hard constraints (per #1951 design decision — no server-side execution,
 * no dependency resolution): this module only downloads, verifies, and
 * writes files. It never executes, spawns, or evals anything.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

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

/**
 * Sanitize (by REJECTING, never rewriting) an attacker-controllable
 * `original_filename` before it is used to build any filesystem path.
 *
 * `original_filename` is a graph field: a skill-row author supplies it
 * verbatim (see `raw_storage.ts`), so it must be treated as hostile input at
 * this boundary. A filename that needs rewriting to become safe is a signal
 * of an attack or a bug upstream, not a typo to silently correct — silently
 * mapping it to some other path would let a rejected value land in the
 * wrong place instead of being refused outright. Mirrors the reject-first
 * posture of `LocalStorageBucket.resolvePath` in
 * `src/repositories/sqlite/local_db_adapter.ts`.
 *
 * Returns the bare, safe filename on success, or `null` when the input must
 * be refused (empty, contains a null byte, is `.`/`..`, is absolute, or
 * contains a path separator — `/` or `\` — anywhere, including after
 * stripping a directory component via `basename()`).
 */
export function sanitizeScriptFilename(filename: string): string | null {
  if (typeof filename !== "string" || filename.length === 0) return null;
  if (filename.includes("\0")) return null;
  // Reject backslashes explicitly: `path.basename` on POSIX does not treat
  // `\` as a separator, so `..\\evil.py` would otherwise pass through as a
  // single (wrong) "sanitized" filename instead of being refused.
  if (filename.includes("\\")) return null;
  if (filename.includes("/")) return null;
  if (filename === "." || filename === "..") return null;

  const base = basename(filename);
  if (base !== filename) return null; // defense-in-depth; already excluded above
  if (base === "" || base === "." || base === "..") return null;

  return base;
}

export type ScriptWriteOutcome =
  | { status: "written"; path: string; hash: string; newlyApproved: boolean }
  | { status: "hash_mismatch"; expected: string; actual: string }
  | { status: "blocked_unapproved"; hash: string; key: string }
  | { status: "blocked_hash_changed"; approvedHash: string; newHash: string; key: string }
  | { status: "rejected_filename"; filename: string; reason: string };

/**
 * Verify downloaded bytes against the recorded `content_hash`, check the
 * hash-pin manifest, and write to `<skillDir>/scripts/<filename>` only when
 * approved. `approve: true` records the (verified) hash as approved before
 * writing — this is the CLI's `--approve-scripts` flag. The `"written"`
 * outcome's `newlyApproved` flag distinguishes a hash recorded on THIS run
 * from one that was already approved by a prior run, so callers can report
 * the consent side effect only when it actually happened.
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

  // Reject (never silently rewrite) a hostile `original_filename` before it
  // touches any path. This MUST run before the hash check so a rejected
  // filename can never be pinned into the approvals manifest under any
  // circumstance, including a hash collision.
  const safeFilename = sanitizeScriptFilename(attachment.original_filename);
  if (safeFilename === null) {
    return {
      status: "rejected_filename",
      filename: attachment.original_filename,
      reason:
        "original_filename must be a plain, non-empty filename with no path separators, " +
        "no null bytes, and not '.' or '..'",
    };
  }

  const actualHash = computeContentHash(bytes);
  if (actualHash !== attachment.content_hash) {
    return { status: "hash_mismatch", expected: attachment.content_hash, actual: actualHash };
  }

  // Derived from the SANITIZED filename, never the raw graph field — so a
  // traversal attempt can never be pinned into the approvals manifest even
  // if sanitization above were ever weakened or bypassed upstream.
  const key = approvalKey(instanceHost, skillDirName, safeFilename);
  const approvedHash = manifest[key];
  // Tracks whether THIS run is the one that newly recorded the hash as
  // approved (new key, or a changed hash re-approved) vs. the hash already
  // being approved from a prior run — lets callers report the consent side
  // effect only when it actually happened, not on every write.
  let newlyApproved = false;

  if (approvedHash === undefined) {
    if (!approve) {
      return { status: "blocked_unapproved", hash: actualHash, key };
    }
    manifest[key] = actualHash;
    newlyApproved = true;
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
    newlyApproved = true;
  }
  // approvedHash === actualHash: already approved, nothing to update.

  const scriptsDir = resolve(join(skillDir, "scripts"));
  mkdirSync(scriptsDir, { recursive: true });
  const outPath = resolve(join(scriptsDir, safeFilename));

  // Backstop containment assertion: even though `safeFilename` is already a
  // bare basename with no separators, assert the resolved path is still
  // inside `scriptsDir` before writing. This is the last line of defense if
  // sanitization above is ever weakened or bypassed — mirrors the
  // containment check in `LocalStorageBucket.resolvePath`
  // (src/repositories/sqlite/local_db_adapter.ts).
  const scriptsDirWithSep = scriptsDir.endsWith(sep) ? scriptsDir : scriptsDir + sep;
  if (outPath !== scriptsDir && !outPath.startsWith(scriptsDirWithSep)) {
    throw new Error(
      `INSTANCE_SCRIPT_PATH_TRAVERSAL_BLOCKED: resolved path "${outPath}" escapes scripts ` +
        `directory "${scriptsDir}" for filename "${attachment.original_filename}"`
    );
  }

  writeFileSync(outPath, bytes);
  return { status: "written", path: outPath, hash: actualHash, newlyApproved };
}
