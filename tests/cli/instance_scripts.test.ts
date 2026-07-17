/**
 * Tests for the instance-script hash-pin consent manifest and write path
 * (#1951). No network involved: bytes and attachment metadata are supplied
 * directly, matching what `instance_skills_client.ts` would fetch.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  approvalKey,
  computeContentHash,
  getApprovalsManifestPath,
  loadApprovalsManifest,
  saveApprovalsManifest,
  verifyAndWriteInstanceScript,
} from "../../src/cli/instance_scripts.ts";
import type { InstanceScriptAttachment } from "../../src/cli/instance_skills_client.ts";

let root: string;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function makeAttachment(
  bytes: Buffer,
  overrides: Partial<InstanceScriptAttachment> = {}
): InstanceScriptAttachment {
  return {
    entity_id: "ent_asset1",
    source_id: "src_1",
    content_hash: sha256(bytes),
    mime_type: "text/x-python",
    original_filename: "score.py",
    ...overrides,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "instscripts-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("computeContentHash", () => {
  it("computes deterministic sha256", () => {
    const buf = Buffer.from("print('hi')\n");
    expect(computeContentHash(buf)).toBe(sha256(buf));
  });
});

describe("approvals manifest", () => {
  it("loads an empty manifest when the file is absent", () => {
    const manifestPath = path.join(root, "nope", "approvals.json");
    expect(loadApprovalsManifest(manifestPath)).toEqual({});
  });

  it("loads an empty manifest when the file is corrupt JSON", () => {
    const manifestPath = path.join(root, "approvals.json");
    fs.writeFileSync(manifestPath, "{not json");
    expect(loadApprovalsManifest(manifestPath)).toEqual({});
  });

  it("round-trips a saved manifest", () => {
    const manifestPath = path.join(root, "nested", "approvals.json");
    const manifest = { "host/skill/file.py": "abc123" };
    saveApprovalsManifest(manifestPath, manifest);
    expect(loadApprovalsManifest(manifestPath)).toEqual(manifest);
  });

  it("builds the expected key shape", () => {
    expect(approvalKey("example.neotoma.app", "score-leads", "score.py")).toBe(
      "example.neotoma.app/score-leads/score.py"
    );
  });

  it("getApprovalsManifestPath is rooted under ~/.neotoma/instance-skills/", () => {
    expect(getApprovalsManifestPath("/home/alice")).toBe(
      path.join("/home/alice", ".neotoma", "instance-skills", "approvals.json")
    );
  });
});

describe("verifyAndWriteInstanceScript", () => {
  const instanceHost = "example.neotoma.app";
  const skillDirName = "score-leads";

  it("refuses to write when the downloaded bytes do not match content_hash", () => {
    const bytes = Buffer.from("print('real')\n");
    const attachment = makeAttachment(bytes, { content_hash: "0".repeat(64) });
    const skillDir = path.join(root, skillDirName);

    const outcome = verifyAndWriteInstanceScript({
      bytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest: {},
      approve: true, // even with --approve, a hash mismatch must refuse
    });

    expect(outcome.status).toBe("hash_mismatch");
    expect(fs.existsSync(path.join(skillDir, "scripts", "score.py"))).toBe(false);
  });

  it("blocks a new (unapproved) hash without --approve", () => {
    const bytes = Buffer.from("print('v1')\n");
    const attachment = makeAttachment(bytes);
    const skillDir = path.join(root, skillDirName);
    const manifest = {};

    const outcome = verifyAndWriteInstanceScript({
      bytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest,
      approve: false,
    });

    expect(outcome.status).toBe("blocked_unapproved");
    expect(fs.existsSync(path.join(skillDir, "scripts", "score.py"))).toBe(false);
    expect(manifest).toEqual({}); // manifest untouched
  });

  it("writes and records approval when --approve is passed for a new hash", () => {
    const bytes = Buffer.from("print('v1')\n");
    const attachment = makeAttachment(bytes);
    const skillDir = path.join(root, skillDirName);
    const manifest: Record<string, string> = {};

    const outcome = verifyAndWriteInstanceScript({
      bytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest,
      approve: true,
    });

    expect(outcome.status).toBe("written");
    const written = fs.readFileSync(path.join(skillDir, "scripts", "score.py"));
    expect(written.equals(bytes)).toBe(true);
    expect(manifest[approvalKey(instanceHost, skillDirName, "score.py")]).toBe(
      attachment.content_hash
    );
  });

  it("writes without --approve when the hash is already approved", () => {
    const bytes = Buffer.from("print('v1')\n");
    const attachment = makeAttachment(bytes);
    const skillDir = path.join(root, skillDirName);
    const manifest: Record<string, string> = {
      [approvalKey(instanceHost, skillDirName, "score.py")]: attachment.content_hash,
    };

    const outcome = verifyAndWriteInstanceScript({
      bytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest,
      approve: false,
    });

    expect(outcome.status).toBe("written");
    expect(fs.existsSync(path.join(skillDir, "scripts", "score.py"))).toBe(true);
  });

  it("blocks a changed hash since approval, without --approve, and warns with both hashes", () => {
    const oldBytes = Buffer.from("print('v1')\n");
    const newBytes = Buffer.from("print('v2 — malicious?')\n");
    const attachment = makeAttachment(newBytes);
    const skillDir = path.join(root, skillDirName);
    const manifest: Record<string, string> = {
      [approvalKey(instanceHost, skillDirName, "score.py")]: sha256(oldBytes),
    };

    const outcome = verifyAndWriteInstanceScript({
      bytes: newBytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest,
      approve: false,
    });

    expect(outcome.status).toBe("blocked_hash_changed");
    if (outcome.status === "blocked_hash_changed") {
      expect(outcome.approvedHash).toBe(sha256(oldBytes));
      expect(outcome.newHash).toBe(sha256(newBytes));
    }
    expect(fs.existsSync(path.join(skillDir, "scripts", "score.py"))).toBe(false);
  });

  it("writes a changed hash and updates the manifest when re-run with --approve", () => {
    const oldBytes = Buffer.from("print('v1')\n");
    const newBytes = Buffer.from("print('v2')\n");
    const attachment = makeAttachment(newBytes);
    const skillDir = path.join(root, skillDirName);
    const manifest: Record<string, string> = {
      [approvalKey(instanceHost, skillDirName, "score.py")]: sha256(oldBytes),
    };

    const outcome = verifyAndWriteInstanceScript({
      bytes: newBytes,
      attachment,
      skillDir,
      instanceHost,
      skillDirName,
      manifest,
      approve: true,
    });

    expect(outcome.status).toBe("written");
    expect(manifest[approvalKey(instanceHost, skillDirName, "score.py")]).toBe(sha256(newBytes));
  });
});
