#!/usr/bin/env node
/**
 * Sync MCP servers from .cursor/mcp.json (single source of truth) to:
 * - .mcp.json (Claude Code and other tools that read project .mcp.json)
 * - .codex/config.toml (OpenAI Codex [mcp_servers])
 *
 * Run from repo root: node scripts/sync_mcp_configs.js
 * npm run sync:mcp
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CURSOR_MCP = path.join(REPO_ROOT, ".cursor", "mcp.json");
const MCP_JSON = path.join(REPO_ROOT, ".mcp.json");
const CODEX_CONFIG = path.join(REPO_ROOT, ".codex", "config.toml");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function escapeTomlString(s) {
  if (typeof s !== "string") return s;
  if (s.includes('"') || s.includes("\n")) {
    return '"""' + s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"""') + '"""';
  }
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function main() {
  const cursor = readJson(CURSOR_MCP);
  if (!cursor?.mcpServers || typeof cursor.mcpServers !== "object") {
    console.error("No mcpServers in .cursor/mcp.json");
    process.exit(1);
  }

  const cursorServers = cursor.mcpServers;

  // 1. Merge into .mcp.json so all Cursor MCPs are available to Claude Code etc.
  let mcpContent = readJson(MCP_JSON) || {};
  if (!mcpContent.mcpServers) mcpContent.mcpServers = {};
  for (const [id, config] of Object.entries(cursorServers)) {
    mcpContent.mcpServers[id] = config;
  }
  writeJson(MCP_JSON, mcpContent);
  console.log("Updated .mcp.json with", Object.keys(cursorServers).length, "server(s) from .cursor/mcp.json");

  // 2. Append [mcp_servers.<id>] to .codex/config.toml for stdio servers
  let codexText = "";
  try {
    codexText = fs.readFileSync(CODEX_CONFIG, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") {
      fs.mkdirSync(path.dirname(CODEX_CONFIG), { recursive: true });
    } else throw e;
  }

  const codexBlocks = [];
  for (const [id, config] of Object.entries(cursorServers)) {
    const cmd = config.command;
    const cwd = config.cwd;
    if (!cmd) continue; // URL-based servers go in user config or we'd need url = "..."
    const lines = [`[mcp_servers.${id}]`, `command = ${escapeTomlString(cmd)}`];
    if (cwd) lines.push(`cwd = ${escapeTomlString(cwd)}`);
    if (Array.isArray(config.args) && config.args.length) {
      lines.push(`args = [${config.args.map((a) => escapeTomlString(a)).join(", ")}]`);
    }
    if (config.env && typeof config.env === "object" && Object.keys(config.env).length) {
      lines.push("[mcp_servers." + id + '.env]');
      for (const [k, v] of Object.entries(config.env)) {
        lines.push(`${k} = ${escapeTomlString(String(v))}`);
      }
    }
    codexBlocks.push(lines.join("\n"));
  }

  const marker = "# --- MCP servers synced from .cursor/mcp.json (do not edit by hand) ---";
  const markerEnd = "# --- end synced MCP servers ---";
  if (codexBlocks.length) {
    let out = codexText;
    const hasMarker = out.includes(marker);
    if (hasMarker) {
      out = out.replace(new RegExp(marker + "[\\s\\S]*?" + markerEnd, "m"), "");
    }
    out = out.trimEnd();
    if (out && !out.endsWith("\n")) out += "\n";
    out += "\n" + marker + "\n" + codexBlocks.join("\n\n") + "\n" + markerEnd + "\n";
    fs.writeFileSync(CODEX_CONFIG, out, "utf-8");
    console.log("Updated .codex/config.toml with", codexBlocks.length, "MCP server(s)");
  }
}

main();
