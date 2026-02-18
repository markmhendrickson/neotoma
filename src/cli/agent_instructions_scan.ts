/**
 * CLI-instructions scan for Neotoma CLI.
 * Scans project and user-level rule locations for "prefer MCP when available, CLI as backup"
 * and offers to add a canonical snippet so it is applied in Cursor, Claude Code, and Codex.
 *
 * Only paths where each IDE actually loads rules count as "applied":
 * - Cursor: .cursor/rules/* (not docs/ unless synced there)
 * - Claude: .claude/CLAUDE.md, .claude/rules/*
 * - Codex: .codex/neotoma_cli.md (project), ~/.codex/ (user)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as readline from "node:readline";

/** Patterns that indicate the Neotoma transport rule (MCP when available, CLI as backup) is already present. */
const PREFER_CLI_PATTERNS = [
  /prefer\s+(neotoma\s+)?mcp\s+when\s+(installed\s+and\s+)?running/i,
  /defer\s+to\s+mcp\s+if\s+(it'?s\s+)?installed\s+and\s+running/i,
  /mcp\s+when\s+(installed\s+and\s+)?running/i,
  /cli\s+as\s+backup/i,
  /prefer\s+mcp\s+when\s+available/i,
  /use\s+cli\s+(as\s+)?backup/i,
  /prefer\s+(the\s+)?neotoma\s+cli\s+when\s+local/i,
  /use\s+(the\s+)?neotoma\s+cli\s+(for|when)\s+.*local/i,
  /neotoma\s+cli\s+when\s+local/i,
  /prefer\s+cli\s+when\s+local.*neotoma/i,
  /transport:.*prefer.*cli.*local/i,
  /when\s+local.*neotoma\s+cli/i,
];

function hasPreferCliInstruction(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  return PREFER_CLI_PATTERNS.some((re) => re.test(normalized));
}

/** Project-relative paths that may contain agent instructions (for discovery only; applied status is separate). */
const PROJECT_INSTRUCTION_PATHS = [
  ".cursor/rules",
  "docs/developer",
  "docs/developer/mcp",
  "docs/conventions",
  "docs/context",
  "docs/foundation",
  ".claude",
  ".codex",
] as const;

/** File names or glob patterns to consider (we read files under the dirs above). */
const _RULE_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  "*.mdc",
  "*.md",
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List files under dir that match common rule/instruction names.
 * Does not recurse deeply (one level under dir, or exact file).
 * relPath is the project-relative path (e.g. "docs/developer") to allow special cases.
 */
async function listInstructionFiles(
  dir: string,
  relPath?: string
): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile()) {
        const match =
          e.name === "AGENTS.md" ||
          e.name === "CLAUDE.md" ||
          e.name.endsWith(".mdc") ||
          e.name.endsWith("_rules.md") ||
          e.name.endsWith("_rules.mdc");
        const devMatch =
          (relPath === "docs/developer" && e.name === "agent_cli_configuration.md") ||
          (relPath === "docs/developer/mcp" && e.name === "instructions.md");
        if (match || devMatch) {
          files.push(full);
        }
      }
    }
  } catch {
    // Dir may not exist
  }
  return files;
}

/** User-level paths that may contain agent instructions. */
function getUserLevelInstructionPaths(): { label: string; path: string }[] {
  const home = os.homedir();
  const platform = os.platform();
  const paths: { label: string; path: string }[] = [];
  if (platform === "darwin" || platform === "linux") {
    paths.push(
      { label: "Cursor user rules", path: path.join(home, ".cursor", "rules") },
      { label: "Claude user dir", path: path.join(home, ".claude") },
      { label: "Codex user config", path: path.join(home, ".codex") }
    );
  }
  if (platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) {
      paths.push(
        { label: "Cursor user rules", path: path.join(appdata, "Cursor", "User", "rules") },
        { label: "Claude user dir", path: path.join(appdata, "Claude") },
        { label: "Codex user config", path: path.join(appdata, "Codex") }
      );
    }
  }
  return paths;
}

/**
 * List files in a directory that are rule/instruction files (one level only).
 * For applied Cursor/Claude we only care about .mdc and .md; for Codex we use a single conventional file.
 */
async function _listAppliedRuleFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(dir, e.name);
      if (e.name.endsWith(".mdc") || e.name.endsWith(".md")) files.push(full);
    }
  } catch {
    // Dir may not exist
  }
  return files;
}

/**
 * Check whether the instruction is present in any of the given files.
 */
async function _instructionInAnyFile(filePaths: string[]): Promise<boolean> {
  for (const f of filePaths) {
    try {
      const content = await fs.readFile(f, "utf-8");
      if (hasPreferCliInstruction(content)) return true;
    } catch {
      // Skip unreadable
    }
  }
  return false;
}

/** Strip YAML frontmatter from written file content to get the rule body. */
function extractBodyFromWrittenFile(content: string): string {
  const stripped = content.replace(/^\s*---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
  return stripped || content.trim();
}

/** HTML comment markers for the auto-generated active-env section. */
const ACTIVE_ENV_START = "<!-- neotoma:active-env:start -->";
const ACTIVE_ENV_END = "<!-- neotoma:active-env:end -->";

/**
 * Build the active-environment section for the rule file.
 * Shows the current CLI session env and both dev/prod options.
 */
function buildEnvSection(env: "dev" | "prod"): string {
  const otherEnv = env === "dev" ? "prod" : "dev";
  const activePort = env === "dev" ? "8080" : "8180";
  const otherPort = env === "dev" ? "8180" : "8080";
  return [
    ACTIVE_ENV_START,
    `## Active environment: ${env}`,
    "",
    `Current Neotoma CLI session is **${env}** (port ${activePort}).`,
    `Use \`--env ${env}\` or \`--servers=start --env ${env}\` for CLI commands in this session.`,
    "",
    "| Environment | Flag | Port |",
    "|---|---|---|",
    `| **${env} (active)** | \`--env ${env}\` | ${activePort} |`,
    `| ${otherEnv} | \`--env ${otherEnv}\` | ${otherPort} |`,
    "",
    ACTIVE_ENV_END,
  ].join("\n");
}

/**
 * Inject or replace the active-env section in instruction body content.
 * Inserts after the first top-level heading. If an env section is already present,
 * replaces it in place so the rest of the content is preserved.
 */
export function buildEnvSpecificInstructions(body: string, env: "dev" | "prod"): string {
  // Strip the "source of truth" meta-comment — accurate only when file is a symlink
  const cleaned = body
    .replace(/^#\s*Source of truth for CLI agent instructions\..*\n\n?/m, "")
    .trim();

  const envSection = buildEnvSection(env);

  // Replace existing env section if present
  const startIdx = cleaned.indexOf(ACTIVE_ENV_START);
  const endIdx = cleaned.indexOf(ACTIVE_ENV_END);
  if (startIdx !== -1 && endIdx !== -1) {
    const before = cleaned.slice(0, startIdx).trimEnd();
    const after = cleaned.slice(endIdx + ACTIVE_ENV_END.length).trimStart();
    return before + "\n\n" + envSection + "\n\n" + after;
  }

  // Insert after first heading
  const firstHeadingMatch = cleaned.match(/^(#[^\n]+\n)/m);
  if (firstHeadingMatch?.index != null) {
    const insertAt = firstHeadingMatch.index + firstHeadingMatch[0].length;
    return (
      cleaned.slice(0, insertAt) +
      "\n" +
      envSection +
      "\n\n" +
      cleaned.slice(insertAt).trimStart()
    );
  }

  return envSection + "\n\n" + cleaned;
}

/**
 * Silently update the active environment section in the project-level cursor rule file.
 * Called on CLI session start to keep the rule file in sync with the current env.
 * Breaks symlinks (replaces with real files) so the env section can be written.
 * Returns true if the file was updated.
 */
export async function autoUpdateCliInstructionsEnv(
  projectRoot: string,
  env: "dev" | "prod"
): Promise<boolean> {
  const cursorPath = path.join(projectRoot, PROJECT_APPLIED_RULE_PATHS.cursor);
  const exists = await fileExists(cursorPath);
  if (!exists) return false;

  const baseBody = await loadCliAgentInstructions(projectRoot);
  const envBody = buildEnvSpecificInstructions(baseBody, env);
  const newContent = buildRuleContentForTarget(envBody, cursorPath);

  // Check whether the current path is a symlink
  let isSymlink = false;
  try {
    const lstat = await fs.lstat(cursorPath);
    isSymlink = lstat.isSymbolicLink();
  } catch {
    // ignore
  }

  if (isSymlink) {
    // Break the symlink and write a real file with env-specific content
    await fs.unlink(cursorPath);
    await fs.writeFile(cursorPath, newContent, "utf-8");
    return true;
  }

  // Real file: only rewrite when content differs
  const existing = await fs.readFile(cursorPath, "utf-8").catch(() => "");
  if (existing === newContent) return false;
  await fs.writeFile(cursorPath, newContent, "utf-8");
  return true;
}

/** Normalize body for comparison (line endings, trailing whitespace). */
function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}

export interface ScanResultLocation {
  path: string;
  hasInstruction: boolean;
  label?: string;
}

/** Per-environment applied status: instruction present in a path that the IDE actually loads. */
export interface AppliedStatus {
  cursor: boolean;
  claude: boolean;
  codex: boolean;
}

export interface AgentInstructionsScanResult {
  projectRoot: string;
  project: ScanResultLocation[];
  user: ScanResultLocation[];
  /** Applied in each environment (project or user). Based on exact rule file at expected path. */
  applied: AppliedStatus;
  /** Applied in project-level paths only (.cursor/rules, .claude, .codex). */
  appliedProject: AppliedStatus;
  /** Applied in user-level paths only (~/.cursor/rules, ~/.claude, ~/.codex). */
  appliedUser: AppliedStatus;
  /** True if rule file exists but content does not match current doc (needs update). */
  staleProject: AppliedStatus;
  /** True if rule file exists but content does not match current doc (needs update). */
  staleUser: AppliedStatus;
  /** True if instruction is missing in any applied environment. */
  missingInApplied: boolean;
  /** True if any applied path has outdated content (should run add/update to load latest). */
  needsUpdateInApplied: boolean;
  /** Legacy: true if any scanned project file has it (includes docs). */
  missingInProject: boolean;
  /** Legacy: true if no user-level scanned file has it. */
  missingInUser: boolean;
  /** True if applied rule at this path is a symlink (project: symlink to doc; user: always false by design). */
  symlinkProject: AppliedStatus;
  /** True if applied rule at this path is a symlink. */
  symlinkUser: AppliedStatus;
}

/**
 * Find project root (directory with .git, package.json, or .cursor).
 */
async function getProjectRoot(startDir: string): Promise<string> {
  let current = startDir;
  for (;;) {
    const hasGit = await fileExists(path.join(current, ".git"));
    const hasPkg = await fileExists(path.join(current, "package.json"));
    const hasCursor = await fileExists(path.join(current, ".cursor"));
    if (hasGit || hasPkg || hasCursor) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

/**
 * Scan project and optionally user-level paths for "prefer Neotoma CLI when local" instruction.
 */
export async function scanAgentInstructions(
  startDir: string,
  options?: { includeUserLevel?: boolean }
): Promise<AgentInstructionsScanResult> {
  const includeUserLevel = options?.includeUserLevel ?? true;
  const projectRoot = await getProjectRoot(startDir);
  const project: ScanResultLocation[] = [];
  const seen = new Set<string>();

  for (const rel of PROJECT_INSTRUCTION_PATHS) {
    const absPath = path.join(projectRoot, rel);
    const exists = await fileExists(absPath);
    if (!exists) continue;
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      const files = await listInstructionFiles(absPath, rel);
      for (const f of files) {
        if (seen.has(f)) continue;
        seen.add(f);
        let hasInstruction = false;
        try {
          const content = await fs.readFile(f, "utf-8");
          hasInstruction = hasPreferCliInstruction(content);
        } catch {
          // Skip unreadable
        }
        project.push({
          path: f,
          hasInstruction,
          label: path.relative(projectRoot, f),
        });
      }
    } else {
      if (seen.has(absPath)) continue;
      seen.add(absPath);
      let hasInstruction = false;
      try {
        const content = await fs.readFile(absPath, "utf-8");
        hasInstruction = hasPreferCliInstruction(content);
      } catch {
        // Skip unreadable
      }
      project.push({
        path: absPath,
        hasInstruction,
        label: path.relative(projectRoot, absPath),
      });
    }
  }

  const user: ScanResultLocation[] = [];
  if (includeUserLevel) {
    for (const { label: userLabel, path: userPath } of getUserLevelInstructionPaths()) {
      if (!(await fileExists(userPath))) continue;
      const stat = await fs.stat(userPath);
      if (stat.isDirectory()) {
        const files = await listInstructionFiles(userPath);
        for (const f of files) {
          let hasInstruction = false;
          try {
            const content = await fs.readFile(f, "utf-8");
            hasInstruction = hasPreferCliInstruction(content);
          } catch {
            // Skip unreadable
          }
          user.push({ path: f, hasInstruction, label: `${userLabel}: ${path.basename(f)}` });
        }
      }
    }
  }

  const missingInProject = project.length > 0 && !project.some((p) => p.hasInstruction);
  const missingInUser =
    includeUserLevel && user.length > 0 && !user.some((u) => u.hasInstruction);

  // Applied: exact rule file paths each IDE loads; compare content to current doc for staleness
  const canonicalBody = await loadCliAgentInstructions(projectRoot);
  const normalizedCanonical = normalizeBody(canonicalBody);

  async function checkPath(p: string): Promise<{ exists: boolean; stale: boolean; symlink: boolean }> {
    const exists = await fileExists(p);
    if (!exists) return { exists: false, stale: false, symlink: false };
    let symlink = false;
    try {
      const stat = await fs.lstat(p);
      symlink = stat.isSymbolicLink();
    } catch {
      // ignore
    }
    try {
      const content = await fs.readFile(p, "utf-8");
      const body = extractBodyFromWrittenFile(content);
      const matches = normalizeBody(body) === normalizedCanonical;
      return { exists: true, stale: !matches, symlink };
    } catch {
      return { exists: true, stale: true, symlink };
    }
  }

  const projectCursorPath = path.join(projectRoot, PROJECT_APPLIED_RULE_PATHS.cursor);
  const projectClaudePath = path.join(projectRoot, PROJECT_APPLIED_RULE_PATHS.claude);
  const projectCodexPath = path.join(projectRoot, PROJECT_APPLIED_RULE_PATHS.codex);

  const [projCursor, projClaude, projCodex] = await Promise.all([
    checkPath(projectCursorPath),
    checkPath(projectClaudePath),
    checkPath(projectCodexPath),
  ]);

  const appliedProject: AppliedStatus = {
    cursor: projCursor.exists,
    claude: projClaude.exists,
    codex: projCodex.exists,
  };
  const staleProject: AppliedStatus = {
    cursor: projCursor.stale,
    claude: projClaude.stale,
    codex: projCodex.stale,
  };
  const symlinkProject: AppliedStatus = {
    cursor: projCursor.symlink,
    claude: projClaude.symlink,
    codex: projCodex.symlink,
  };

  let appliedUser: AppliedStatus = { cursor: false, claude: false, codex: false };
  let staleUser: AppliedStatus = { cursor: false, claude: false, codex: false };
  let symlinkUser: AppliedStatus = { cursor: false, claude: false, codex: false };
  if (includeUserLevel) {
    const userPaths = getUserAppliedRulePaths();
    if (userPaths) {
      const [uCursor, uClaude, uCodex] = await Promise.all([
        checkPath(userPaths.cursor),
        checkPath(userPaths.claude),
        checkPath(userPaths.codex),
      ]);
      appliedUser = {
        cursor: uCursor.exists,
        claude: uClaude.exists,
        codex: uCodex.exists,
      };
      staleUser = {
        cursor: uCursor.stale,
        claude: uClaude.stale,
        codex: uCodex.stale,
      };
      symlinkUser = {
        cursor: uCursor.symlink,
        claude: uClaude.symlink,
        codex: uCodex.symlink,
      };
    }
  }

  const applied: AppliedStatus = {
    cursor: appliedProject.cursor || appliedUser.cursor,
    claude: appliedProject.claude || appliedUser.claude,
    codex: appliedProject.codex || appliedUser.codex,
  };
  const missingInApplied = !applied.cursor || !applied.claude || !applied.codex;
  const needsUpdateInApplied =
    staleProject.cursor ||
    staleProject.claude ||
    staleProject.codex ||
    staleUser.cursor ||
    staleUser.claude ||
    staleUser.codex;

  return {
    projectRoot,
    project,
    user,
    applied,
    appliedProject,
    appliedUser,
    staleProject,
    staleUser,
    symlinkProject,
    symlinkUser,
    missingInApplied,
    needsUpdateInApplied,
    missingInProject,
    missingInUser,
  };
}

/** Path to the CLI agent instructions doc (source of truth), relative to project root. */
export const CLI_AGENT_INSTRUCTIONS_DOC_PATH = "docs/developer/cli_agent_instructions.md";

/** Fallback rule content when the doc file is missing (e.g. packaged build). Used for snippet display in CLI. */
export const PREFER_CLI_RULE_CONTENT = `# Neotoma transport: MCP when available, CLI as backup

## Purpose

Prefer Neotoma MCP when it is installed and running in this environment; use the Neotoma CLI as backup when MCP is not available.

## Rule

- **When MCP is available:** Use MCP tools (store_structured, create_relationship, etc.) per docs/developer/mcp/instructions.md.
- **When MCP is not available:** Use \`neotoma dev <command>\` (e.g. neotoma dev entities list, neotoma dev store --json='...').

## When to load

Load when configuring or documenting agent behavior, or when choosing between MCP and CLI for Neotoma operations.
`;

/**
 * Load CLI agent instruction content from the docs file. Strips leading YAML frontmatter if present.
 * Returns fallback content if the file is missing or unreadable.
 */
export async function loadCliAgentInstructions(projectRoot: string): Promise<string> {
  const fullPath = path.join(projectRoot, CLI_AGENT_INSTRUCTIONS_DOC_PATH);
  try {
    const raw = await fs.readFile(fullPath, "utf-8");
    const stripped = raw.replace(/^\s*---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
    return stripped || raw.trim();
  } catch {
    return PREFER_CLI_RULE_CONTENT;
  }
}

/** Frontmatter for .mdc rule files (Cursor, Claude). */
const MDC_FRONTMATTER = `---
description: "Prefer Neotoma MCP when installed and running; use CLI as backup when MCP is not available. Same agent behaviors (chat persistence, entity extraction, conventions)."
globs: ["**/*"]
alwaysApply: true
---

`;

/**
 * Build the full content to write for a given target path. Adds frontmatter for .mdc files.
 */
export function buildRuleContentForTarget(body: string, targetPath: string): string {
  if (targetPath.endsWith(".mdc")) {
    return MDC_FRONTMATTER + body;
  }
  return body;
}

/** Project-level applied paths where the rule file is written (one per environment). */
export const PROJECT_APPLIED_RULE_PATHS = {
  cursor: ".cursor/rules/neotoma_cli.mdc",
  claude: ".claude/rules/neotoma_cli.mdc",
  codex: ".codex/neotoma_cli.md",
} as const;

/**
 * Create a symlink from the project rule path to the doc file so the rule is always up to date.
 * Removes existing file or symlink at linkPath first. Fails if the doc does not exist.
 */
export async function createSymlinkToDoc(projectRoot: string, linkPath: string): Promise<void> {
  const docPath = path.join(projectRoot, CLI_AGENT_INSTRUCTIONS_DOC_PATH);
  const docExists = await fileExists(docPath);
  if (!docExists) {
    throw new Error(`Doc not found: ${docPath}. Cannot create symlink.`);
  }
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  try {
    await fs.unlink(linkPath);
  } catch {
    // Ignore if missing
  }
  const target = path.relative(path.dirname(linkPath), docPath);
  await fs.symlink(target, linkPath, "file");
}

/**
 * Create a symlink from a user-level rule path to the doc file (absolute target).
 * Use when the link is outside the repo (e.g. ~/.cursor/rules/). Removes existing file or symlink first.
 */
export async function createUserSymlinkToDoc(
  projectRoot: string,
  linkPath: string
): Promise<void> {
  const docPath = path.resolve(projectRoot, CLI_AGENT_INSTRUCTIONS_DOC_PATH);
  const docExists = await fileExists(docPath);
  if (!docExists) {
    throw new Error(`Doc not found: ${docPath}. Cannot create symlink.`);
  }
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  try {
    await fs.unlink(linkPath);
  } catch {
    // Ignore if missing
  }
  await fs.symlink(docPath, linkPath, "file");
}

/**
 * Write the rule content to a file. Creates parent dirs if needed.
 * Used for user-level paths (copy). Content should be the full body; frontmatter is added for .mdc.
 */
export async function writePreferCliRule(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const toWrite = buildRuleContentForTarget(content, targetPath);
  await fs.writeFile(targetPath, toWrite, "utf-8");
}

/**
 * Get user-level rule file path for each environment (platform-specific).
 */
export function getUserAppliedRulePaths(): { cursor: string; claude: string; codex: string } | null {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === "darwin" || platform === "linux") {
    return {
      cursor: path.join(home, ".cursor", "rules", "neotoma_cli.mdc"),
      claude: path.join(home, ".claude", "rules", "neotoma_cli.mdc"),
      codex: path.join(home, ".codex", "neotoma_cli.md"),
    };
  }
  if (platform === "win32" && process.env.APPDATA) {
    return {
      cursor: path.join(process.env.APPDATA, "Cursor", "User", "rules", "neotoma_cli.mdc"),
      claude: path.join(process.env.APPDATA, "Claude", "rules", "neotoma_cli.mdc"),
      codex: path.join(process.env.APPDATA, "Codex", "neotoma_cli.md"),
    };
  }
  return null;
}

const ADD_TO_OPTIONS = [
  "(1) project (Cursor + Claude + Codex in this repo)",
  "(2) user (all three in ~)",
  "(3) both",
  "(4) skip",
] as const;

/**
 * Ask user to choose project-level or user-level (or both, or skip).
 * defaultChoice controls which option is pre-selected when the user presses Enter.
 * Returns "project" | "user" | "both" | null.
 */
export async function askWhereToAdd(
  defaultChoice: "1" | "2" | "3" = "1"
): Promise<"project" | "user" | "both" | null> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt =
    "Add or update to latest:\n  " + ADD_TO_OPTIONS.join("\n  ") + `\n[${defaultChoice}]: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim() || defaultChoice;
      if (normalized === "1") resolve("project");
      else if (normalized === "2") resolve("user");
      else if (normalized === "3") resolve("both");
      else resolve(null);
    });
  });
}

/**
 * Offer to add or update the canonical rule so the latest version is applied in Cursor, Claude, and Codex.
 * Writes to applied paths when missing or stale (content does not match current doc).
 *
 * When `env` is provided the written files contain an env-specific "Active environment" section
 * and are written as real files (not symlinks). Without `env`, project paths are created as symlinks
 * so they stay in sync with the docs source automatically.
 */
export async function offerAddPreferCliRule(
  result: AgentInstructionsScanResult,
  options?: { nonInteractive?: boolean; env?: "dev" | "prod" }
): Promise<{ added: string[]; skipped?: boolean }> {
  const added: string[] = [];
  if (options?.nonInteractive) return { added };

  const needProject =
    (!result.appliedProject.cursor || result.staleProject.cursor) ||
    (!result.appliedProject.claude || result.staleProject.claude) ||
    (!result.appliedProject.codex || result.staleProject.codex);
  const needUser =
    (!result.appliedUser.cursor || result.staleUser.cursor) ||
    (!result.appliedUser.claude || result.staleUser.claude) ||
    (!result.appliedUser.codex || result.staleUser.codex);
  if (!needProject && !needUser) return { added };

  // Default to the scope that actually needs work
  const defaultChoice: "1" | "2" | "3" = needProject && needUser ? "3" : needUser ? "2" : "1";
  const where = await askWhereToAdd(defaultChoice);
  if (where === null) return { added };

  const root = result.projectRoot;
  const body = await loadCliAgentInstructions(root);
  // When env is provided, build env-specific content and write real files.
  // Without env, use symlinks so files stay in sync with the docs source.
  const envBody = options?.env ? buildEnvSpecificInstructions(body, options.env) : null;

  if (where === "project" || where === "both") {
    if (!result.appliedProject.cursor || result.staleProject.cursor) {
      const p = path.join(root, PROJECT_APPLIED_RULE_PATHS.cursor);
      if (envBody) {
        await writePreferCliRule(p, envBody);
      } else {
        await createSymlinkToDoc(root, p);
      }
      added.push(p);
    }
    if (!result.appliedProject.claude || result.staleProject.claude) {
      const p = path.join(root, PROJECT_APPLIED_RULE_PATHS.claude);
      if (envBody) {
        await writePreferCliRule(p, envBody);
      } else {
        await createSymlinkToDoc(root, p);
      }
      added.push(p);
    }
    if (!result.appliedProject.codex || result.staleProject.codex) {
      const p = path.join(root, PROJECT_APPLIED_RULE_PATHS.codex);
      if (envBody) {
        await writePreferCliRule(p, envBody);
      } else {
        await createSymlinkToDoc(root, p);
      }
      added.push(p);
    }
  }

  if (where === "user" || where === "both") {
    const userPaths = getUserAppliedRulePaths();
    if (!userPaths) return { added };
    if (!result.appliedUser.cursor || result.staleUser.cursor) {
      if (envBody) {
        await writePreferCliRule(userPaths.cursor, envBody);
      } else {
        await createUserSymlinkToDoc(root, userPaths.cursor);
      }
      added.push(userPaths.cursor);
    }
    if (!result.appliedUser.claude || result.staleUser.claude) {
      if (envBody) {
        await writePreferCliRule(userPaths.claude, envBody);
      } else {
        await createUserSymlinkToDoc(root, userPaths.claude);
      }
      added.push(userPaths.claude);
    }
    if (!result.appliedUser.codex || result.staleUser.codex) {
      if (envBody) {
        await writePreferCliRule(userPaths.codex, envBody);
      } else {
        await createUserSymlinkToDoc(root, userPaths.codex);
      }
      added.push(userPaths.codex);
    }
  }

  // If the user chose a valid scope but nothing was written, the chosen paths were already up to date
  const skipped = added.length === 0;
  return { added, skipped };
}
