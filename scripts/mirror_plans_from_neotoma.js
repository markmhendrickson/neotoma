#!/usr/bin/env node
/**
 * @deprecated Use `neotoma mirror rebuild --profile neotoma-plans` instead.
 * Configure the profile in ~/.config/neotoma/config.json under mirror.profiles.
 * This script is kept for reference only and will be removed in a future release.
 *
 * Mirrors all `plan` entities from the local Neotoma prod instance into
 * plans/ as individual markdown files. The directory is gitignored so these
 * are local working copies only.
 *
 * For plans that have an attached markdown file source, the raw file content
 * is written verbatim. For plans with no attached file, a markdown document
 * is rendered from the entity's structured fields.
 *
 * Usage:
 *   node scripts/mirror_plans_from_neotoma.js
 *
 * Targets port 3180 (prod). Override with NEOTOMA_MIRROR_PORT env var.
 * Dev (port 3080) does not require a bearer token.
 */

import { config } from "dotenv";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PLANS_DIR = join(REPO_ROOT, "plans");
const PORT = process.env.NEOTOMA_MIRROR_PORT ?? "3180";
const BASE_URL = `http://localhost:${PORT}`;

/** Resolve a bearer token using the same precedence as the Neotoma CLI. */
function resolveBearerToken() {
  if (process.env.NEOTOMA_BEARER_TOKEN?.trim()) return process.env.NEOTOMA_BEARER_TOKEN.trim();
  const cfgPath = join(os.homedir(), ".config", "neotoma", "config.json");
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      if (cfg.access_token?.trim()) return cfg.access_token.trim();
    } catch { /* malformed config */ }
  }
  return null;
}

function makeHeaders(token, json = false) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function apiFetch(path, options = {}, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...makeHeaders(token, options.json), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} → ${res.status} ${res.statusText}`);
  }
  return res;
}

async function fetchAllPlans(token) {
  const res = await apiFetch("/entities/query", {
    method: "POST",
    json: true,
    body: JSON.stringify({ entity_type: "plan", limit: 200, include_snapshots: true }),
  }, token);
  const body = await res.json();
  return body.entities ?? [];
}

/** Return relationships for an entity, filtered to a given type. */
async function fetchRelationships(entityId, token) {
  const res = await apiFetch(`/entities/${entityId}/relationships`, {}, token);
  const body = await res.json();
  return body.relationships ?? [];
}

/**
 * Given a file_asset entity_id, retrieve the raw file content.
 *
 * Strategy:
 *  1. Get the file_asset snapshot to extract source_id.
 *  2. Fetch GET /sources/{source_id} — the response includes filesystem_absolute_path.
 *  3. If the path exists on disk, read it directly (local instance).
 *  4. Otherwise fall back to /get_file_url signed-URL fetch (remote/prod).
 *
 * Returns the file text, or null if anything fails.
 */
async function fetchFileContent(fileAssetEntityId, token) {
  // 1. Get the file_asset snapshot to find source_id
  const snapRes = await apiFetch(`/entities/${fileAssetEntityId}`, {}, token);
  const snap = await snapRes.json();
  // Snapshot fields live at entity.snapshot (not entity.snapshot.snapshot)
  const sourceId = snap?.snapshot?.source_id;
  const originalFilename = snap?.snapshot?.original_filename
    ?? snap?.snapshot?.title
    ?? "file.md";

  if (!sourceId) return null;

  // 2. Fetch source record — includes filesystem_absolute_path
  try {
    const srcRes = await apiFetch(`/sources/${sourceId}`, {}, token);
    const src = await srcRes.json();
    if (src?.filesystem_absolute_path && existsSync(src.filesystem_absolute_path)) {
      return readFileSync(src.filesystem_absolute_path, "utf-8");
    }
  } catch { /* sources endpoint unavailable or path not on disk */ }

  // 3. Fallback: signed URL
  try {
    const filePath = `files/${sourceId}/${originalFilename}`;
    const urlRes = await apiFetch(
      `/get_file_url?file_path=${encodeURIComponent(filePath)}`,
      {},
      token
    );
    const { url } = await urlRes.json();
    if (!url) return null;
    const fileRes = await fetch(url);
    if (!fileRes.ok) return null;
    return fileRes.text();
  } catch { return null; }
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/^plan:/, "")       // strip "plan:" prefix from canonical names
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Fallback: render structured fields as markdown when no source file exists. */
function renderFromFields(entity) {
  const snap = entity.snapshot ?? {};
  const frags = entity.raw_fragments ?? {};
  const all = { ...snap, ...frags };

  const title = all.title ?? entity.canonical_name ?? entity.entity_id;
  delete all.title;

  const lines = [
    `# ${title}`,
    ``,
    `**Entity ID:** \`${entity.entity_id}\`  `,
    `**Status:** ${all.status ?? "—"}  `,
    `**Last observation:** ${entity.last_observation_at ?? "—"}`,
    ``,
  ];

  if (all.description) { lines.push(all.description, ``); delete all.description; }
  if (all.status) delete all.status;

  const ORDERED = [
    ["phase", "Phase"], ["target_release", "Target release"],
    ["strategic_principles", "Strategic principles"], ["networks", "Networks"],
    ["deliverables", "Deliverables"], ["paid_deliverables_excluded", "Not paid for"],
    ["proof_of_run", "Proof of run"], ["issue_pricing", "Issue pricing"],
    ["reproducibility_clause", "Reproducibility clause"],
    ["aibtc_scenarios", "AIBTC scenarios"], ["sokosumi_scenarios", "Sokosumi scenarios"],
    ["openclaw_scenarios", "OpenClaw scenarios"], ["aibtc_brief_notes", "AIBTC brief notes"],
    ["sokosumi_brief_notes", "Sokosumi brief notes"], ["openclaw_brief_notes", "OpenClaw brief notes"],
    ["security_transparency_clause", "Security & transparency"],
    ["phase_sequence", "Phase sequence"], ["success_criteria", "Success criteria"],
    ["not_wanted", "Not wanted"],
  ];

  for (const [key, heading] of ORDERED) {
    if (all[key] != null) {
      lines.push(`## ${heading}`, ``, String(all[key]), ``);
      delete all[key];
    }
  }

  const remaining = Object.entries(all).filter(
    ([k]) => !["entity_id", "entity_type", "schema_version"].includes(k)
  );
  if (remaining.length > 0) {
    lines.push(`## Additional fields`, ``);
    for (const [k, v] of remaining) lines.push(`**${k}:** ${v}`, ``);
  }

  lines.push(
    `---`,
    `*Mirrored from Neotoma — do not edit directly. Re-run \`npm run mirror:plans\` to refresh.*`
  );
  return lines.join("\n");
}

async function main() {
  const token = resolveBearerToken();
  const isProdPort = PORT !== "3080";
  if (!token && isProdPort) {
    console.error(
      `No bearer token found. Set NEOTOMA_BEARER_TOKEN in .env, or run:\n` +
      `  neotoma auth login --env prod\n` +
      `to store an OAuth token in ~/.config/neotoma/config.json.`
    );
    process.exit(1);
  }

  mkdirSync(PLANS_DIR, { recursive: true });

  let plans;
  try {
    plans = await fetchAllPlans(token);
  } catch (err) {
    console.error(`Failed to fetch plans from ${BASE_URL}:`, err.message);
    process.exit(1);
  }

  if (plans.length === 0) {
    console.log("No plan entities found.");
    return;
  }

  for (const entity of plans) {
    const name = entity.canonical_name ?? entity.entity_id;
    const filename = `${slugify(name)}.md`;
    const filepath = join(PLANS_DIR, filename);

    // Try to find an attached file_asset via EMBEDS relationship
    let content = null;
    try {
      const rels = await fetchRelationships(entity.entity_id, token);
      const embedRel = rels.find(r => r.relationship_type === "EMBEDS" && !r.snapshot?._deleted);
      if (embedRel) {
        const fileAssetId = embedRel.target_entity_id !== entity.entity_id
          ? embedRel.target_entity_id
          : embedRel.source_entity_id;
        content = await fetchFileContent(fileAssetId, token);
      }
    } catch (err) {
      // Relationship fetch or file fetch failed — fall through to field rendering
    }

    if (content) {
      writeFileSync(filepath, content, "utf-8");
      console.log(`  wrote ${filename} (from source file)`);
    } else {
      writeFileSync(filepath, renderFromFields(entity), "utf-8");
      console.log(`  wrote ${filename} (from fields)`);
    }
  }

  console.log(`\nMirrored ${plans.length} plan(s) to plans/`);
}

main();
