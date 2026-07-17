/**
 * Orchestrates instance-skill sync end to end: fetch `skill` rows (#1950),
 * materialize them to disk, link into harnesses, and — opt-in — fetch and
 * write their EMBEDS'd script attachments under the hash-pin consent gate
 * (#1951). Called by `neotoma skills sync --include-instance-skills
 * [--include-instance-scripts] [--approve]`.
 *
 * Kept thin and imperative on purpose: all decision logic (rendering,
 * pruning, collision precedence, hash verification, consent) lives in the
 * unit-tested `instance_skills.ts` / `instance_scripts.ts` modules. This file
 * only sequences the network + filesystem calls and shapes a report.
 */

import { homedir } from "node:os";
import { URL } from "node:url";

import type { NeotomaApiClient } from "../shared/api_client.js";
import {
  fetchEnabledInstanceSkills,
  fetchSkillScriptAttachments,
  downloadSourceBytes,
} from "./instance_skills_client.js";
import {
  getInstanceSkillsRoot,
  linkInstanceSkillsToHarnesses,
  materializeInstanceSkills,
  resolveSkillDirName,
} from "./instance_skills.js";
import {
  getApprovalsManifestPath,
  loadApprovalsManifest,
  saveApprovalsManifest,
  verifyAndWriteInstanceScript,
} from "./instance_scripts.js";

export interface InstanceSkillsSyncOptions {
  includeInstanceSkills: boolean;
  includeInstanceScripts: boolean;
  approve: boolean;
  baseUrl: string;
  cwd?: string;
  scope?: "user" | "project";
  homeDir?: string;
}

export interface InstanceSkillsSyncReport {
  ran: boolean;
  instanceHost: string;
  root: string;
  skillsFetched: number;
  written: string[];
  pruned: string[];
  skippedCollisions: Array<{ name: string; reason: string }>;
  harnessResults: ReturnType<typeof linkInstanceSkillsToHarnesses>;
  scripts?: {
    written: Array<{ skill: string; filename: string; path: string }>;
    blockedUnapproved: Array<{ skill: string; filename: string; hash: string; key: string }>;
    blockedHashChanged: Array<{
      skill: string;
      filename: string;
      approvedHash: string;
      newHash: string;
      key: string;
    }>;
    hashMismatches: Array<{ skill: string; filename: string; expected: string; actual: string }>;
    rejectedFilenames: Array<{ skill: string; filename: string; reason: string }>;
  };
}

function instanceHostFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export async function runInstanceSkillsSync(
  api: NeotomaApiClient,
  opts: InstanceSkillsSyncOptions
): Promise<InstanceSkillsSyncReport> {
  const homeDir = opts.homeDir ?? homedir();
  const instanceHost = instanceHostFromBaseUrl(opts.baseUrl);

  if (!opts.includeInstanceSkills && !opts.includeInstanceScripts) {
    return {
      ran: false,
      instanceHost,
      root: getInstanceSkillsRoot(instanceHost, homeDir),
      skillsFetched: 0,
      written: [],
      pruned: [],
      skippedCollisions: [],
      harnessResults: [],
    };
  }

  const rows = await fetchEnabledInstanceSkills(api);
  const materialized = materializeInstanceSkills(rows, { instanceHost, homeDir });
  const harnessResults = linkInstanceSkillsToHarnesses(materialized.root, {
    cwd: opts.cwd,
    scope: opts.scope,
  });

  const report: InstanceSkillsSyncReport = {
    ran: true,
    instanceHost,
    root: materialized.root,
    skillsFetched: rows.length,
    written: materialized.written,
    pruned: materialized.pruned,
    skippedCollisions: materialized.skippedCollisions,
    harnessResults,
  };

  if (!opts.includeInstanceScripts) return report;

  const manifestPath = getApprovalsManifestPath(homeDir);
  const manifest = loadApprovalsManifest(manifestPath);
  let manifestChanged = false;

  const scriptsWritten: Array<{ skill: string; filename: string; path: string }> = [];
  const blockedUnapproved: Array<{ skill: string; filename: string; hash: string; key: string }> =
    [];
  const blockedHashChanged: Array<{
    skill: string;
    filename: string;
    approvedHash: string;
    newHash: string;
    key: string;
  }> = [];
  const hashMismatches: Array<{
    skill: string;
    filename: string;
    expected: string;
    actual: string;
  }> = [];
  const rejectedFilenames: Array<{ skill: string; filename: string; reason: string }> = [];

  // Package-collision rows were never materialized — skip their scripts too.
  const collisionNames = new Set(materialized.skippedCollisions.map((c) => c.name));

  for (const row of rows) {
    const skillDirName = resolveSkillDirName(row);
    if (!skillDirName || collisionNames.has(skillDirName)) continue;

    const attachments = await fetchSkillScriptAttachments(api, row.entity_id);
    if (attachments.length === 0) continue;

    const skillDir = `${materialized.root}/${skillDirName}`;
    for (const attachment of attachments) {
      const bytes = await downloadSourceBytes(api, attachment.source_id);
      const outcome = verifyAndWriteInstanceScript({
        bytes,
        attachment,
        skillDir,
        instanceHost,
        skillDirName,
        manifest,
        approve: opts.approve,
      });
      switch (outcome.status) {
        case "written":
          scriptsWritten.push({
            skill: skillDirName,
            filename: attachment.original_filename,
            path: outcome.path,
          });
          manifestChanged = true;
          break;
        case "blocked_unapproved":
          blockedUnapproved.push({
            skill: skillDirName,
            filename: attachment.original_filename,
            hash: outcome.hash,
            key: outcome.key,
          });
          break;
        case "blocked_hash_changed":
          blockedHashChanged.push({
            skill: skillDirName,
            filename: attachment.original_filename,
            approvedHash: outcome.approvedHash,
            newHash: outcome.newHash,
            key: outcome.key,
          });
          break;
        case "hash_mismatch":
          hashMismatches.push({
            skill: skillDirName,
            filename: attachment.original_filename,
            expected: outcome.expected,
            actual: outcome.actual,
          });
          break;
        case "rejected_filename":
          rejectedFilenames.push({
            skill: skillDirName,
            filename: outcome.filename,
            reason: outcome.reason,
          });
          break;
      }
    }
  }

  if (manifestChanged) {
    saveApprovalsManifest(manifestPath, manifest);
  }

  report.scripts = {
    written: scriptsWritten,
    blockedUnapproved,
    blockedHashChanged,
    hashMismatches,
    rejectedFilenames,
  };
  return report;
}
