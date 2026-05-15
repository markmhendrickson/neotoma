/**
 * File discovery engine for Neotoma onboarding.
 *
 * Scans local directories shallowly, ranks files by likely value for
 * state reconstruction, and groups results into domain clusters.
 * Used by `neotoma discover` CLI command and agent-driven onboarding.
 */
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  paths: string[];
  depth: number;
  top: number;
  mode: "quick" | "guided" | "full";
  preferences?: string[];
}

export interface ScoredFile {
  filePath: string;
  score: number;
  signals: string[];
  modifiedAt: Date;
  sizeBytes: number;
}

export interface DomainCluster {
  name: string;
  rootPath: string;
  files: ScoredFile[];
  totalScore: number;
  explanation: string;
}

export interface DiscoveryResult {
  clusters: DomainCluster[];
  totalFilesScanned: number;
  totalCandidates: number;
  harnessTranscripts?: HarnessTranscriptSummary[];
}

export interface HarnessTranscriptSummary {
  harness: "claude-code" | "codex" | "cursor";
  paths: string[];
  fileCount: number;
  estimatedDateRange: { earliest: Date; latest: Date } | null;
  sampleTitles: string[];
  requiresSqlite?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "vendor",
  "bower_components",
  "build",
  "dist",
  ".cache",
  ".next",
  ".nuxt",
  "target",
  "out",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
  "venv",
  "env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "coverage",
  ".nyc_output",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".svg",
  ".webp",
  ".ico",
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".webm",
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".aac",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".rar",
  ".7z",
  ".dmg",
  ".iso",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".pem",
  ".key",
  ".pfx",
  ".p12",
  ".DS_Store",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

const HIGH_VALUE_FILENAME_PATTERNS = [
  /meeting/i,
  /notes?/i,
  /brief/i,
  /proposal/i,
  /contract/i,
  /transcript/i,
  /agreement/i,
  /scope/i,
  /amendment/i,
  /invoice/i,
  /receipt/i,
  /statement/i,
];

const VERSION_PATTERNS = [/v\d+/i, /draft/i, /revision/i, /rev\d+/i, /version/i];

const DATE_FILENAME_PATTERN = /\d{4}[-_]\d{2}[-_]\d{2}/;

const TRANSCRIPT_EXTENSIONS = new Set([".json", ".md", ".txt", ".vtt", ".srt"]);
const TRANSCRIPT_FILENAME_PATTERNS = [
  /conversations?\.json/i,
  /chat[-_]?export/i,
  /slack[-_]?export/i,
  /transcript/i,
  /chatgpt/i,
  /claude/i,
  /discord/i,
];

const CONTENT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".rtf",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".vtt",
  ".srt",
]);

const SENSITIVE_PATH_SEGMENTS = new Set([".ssh", ".gnupg", ".aws", "credentials"]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreFile(filePath: string, stat: { mtimeMs: number; size: number }): ScoredFile | null {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  const dirParts = filePath.split(path.sep);

  if (EXCLUDED_EXTENSIONS.has(ext)) return null;
  if (stat.size > MAX_FILE_SIZE) return null;
  if (stat.size === 0) return null;
  if (!CONTENT_EXTENSIONS.has(ext)) return null;

  for (const part of dirParts) {
    if (SENSITIVE_PATH_SEGMENTS.has(part.toLowerCase())) return null;
  }

  let score = 0;
  const signals: string[] = [];

  // Recency
  const ageMs = Date.now() - stat.mtimeMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) {
    score += 3;
    signals.push("modified in last 30 days");
  } else if (ageDays <= 90) {
    score += 2;
    signals.push("modified in last 90 days");
  } else if (ageDays <= 180) {
    score += 1;
    signals.push("modified in last 6 months");
  }

  // High-value filename patterns
  for (const pattern of HIGH_VALUE_FILENAME_PATTERNS) {
    if (pattern.test(basename)) {
      score += 3;
      signals.push(`filename matches: ${pattern.source}`);
      break;
    }
  }

  // Version markers
  for (const pattern of VERSION_PATTERNS) {
    if (pattern.test(basename)) {
      score += 2;
      signals.push("version marker in filename");
      break;
    }
  }

  // Date in filename
  if (DATE_FILENAME_PATTERN.test(basename)) {
    score += 2;
    signals.push("date in filename");
  }

  // Transcript detection
  let transcriptHit = false;
  for (const pattern of TRANSCRIPT_FILENAME_PATTERNS) {
    if (pattern.test(basename)) {
      score += 4;
      signals.push("likely chat transcript");
      transcriptHit = true;
      break;
    }
  }
  if (!transcriptHit && TRANSCRIPT_EXTENSIONS.has(ext)) {
    score += 1;
    signals.push("transcript-friendly file type");
  }

  // PDF/doc types get a small boost (often contracts, proposals)
  if (ext === ".pdf" || ext === ".doc" || ext === ".docx") {
    score += 1;
    signals.push("document format");
  }

  if (score === 0) return null;

  return {
    filePath,
    score,
    signals,
    modifiedAt: new Date(stat.mtimeMs),
    sizeBytes: stat.size,
  };
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

async function scanDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
): Promise<ScoredFile[]> {
  const results: ScoredFile[] = [];

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.name.startsWith(".") && EXCLUDED_DIRS.has(entry.name)) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    if (entry.isDirectory() && currentDepth < maxDepth) {
      const subResults = await scanDirectory(fullPath, currentDepth + 1, maxDepth);
      results.push(...subResults);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        const scored = scoreFile(fullPath, { mtimeMs: stat.mtimeMs, size: stat.size });
        if (scored) results.push(scored);
      } catch {
        // Skip files we can't stat
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Domain clustering
// ---------------------------------------------------------------------------

function clusterByDirectory(files: ScoredFile[]): DomainCluster[] {
  const dirMap = new Map<string, ScoredFile[]>();

  for (const file of files) {
    const dir = path.dirname(file.filePath);
    // Group by parent or grandparent directory for coherent clusters
    const parts = dir.split(path.sep);
    let clusterDir = dir;
    if (parts.length > 2) {
      // Use the meaningful folder name (2 levels up from file for better grouping)
      const depth = Math.max(0, parts.length - 2);
      clusterDir = parts.slice(0, depth + 1).join(path.sep);
    }

    const existing = dirMap.get(clusterDir) ?? [];
    existing.push(file);
    dirMap.set(clusterDir, existing);
  }

  const clusters: DomainCluster[] = [];

  for (const [dirPath, clusterFiles] of dirMap) {
    const totalScore = clusterFiles.reduce((sum, f) => sum + f.score, 0);
    const dirName = path.basename(dirPath);

    const allSignals = new Set<string>();
    for (const f of clusterFiles) {
      for (const s of f.signals) allSignals.add(s);
    }

    const signalSummary = Array.from(allSignals).slice(0, 3).join(", ");
    const explanation = `${clusterFiles.length} file${clusterFiles.length === 1 ? "" : "s"} with signals: ${signalSummary}`;

    clusters.push({
      name: dirName || dirPath,
      rootPath: dirPath,
      files: clusterFiles.sort((a, b) => b.score - a.score),
      totalScore,
      explanation,
    });
  }

  return clusters.sort((a, b) => b.totalScore - a.totalScore);
}

// ---------------------------------------------------------------------------
// Harness transcript discovery
// ---------------------------------------------------------------------------

async function globFiles(pattern: string): Promise<string[]> {
  // Simple glob implementation for known patterns: dir/**/*.ext or dir/*.ext
  const results: string[] = [];

  if (pattern.includes("/**/*.")) {
    const parts = pattern.split("/**/");
    const baseDir = parts[0];
    const ext = parts[1].replace("*", "");

    const walk = async (dir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(full);
        }
      }
    }

    try {
      await walk(baseDir);
    } catch {
      // Directory doesn't exist
    }
  } else if (pattern.includes("/*.")) {
    const dir = path.dirname(pattern);
    const ext = path.extname(pattern);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist
    }
  } else {
    // Exact path
    try {
      await fs.stat(pattern);
      results.push(pattern);
    } catch {
      // File doesn't exist
    }
  }

  return results;
}

async function findCursorStoreDbs(homeDir: string): Promise<string[]> {
  const results: string[] = [];
  const cursorChatsDir = path.join(homeDir, ".cursor", "chats");

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name === "store.db") {
        results.push(full);
      }
    }
  }

  try {
    await walk(cursorChatsDir, 0);
  } catch {
    // Directory doesn't exist
  }

  return results;
}

export async function discoverHarnessTranscripts(homeDir: string): Promise<HarnessTranscriptSummary[]> {
  const summaries: HarnessTranscriptSummary[] = [];

  // Claude Code
  const claudeCodeFiles = await globFiles(path.join(homeDir, ".claude", "projects", "**", "*.jsonl"));
  if (claudeCodeFiles.length > 0) {
    const stats = await Promise.all(
      claudeCodeFiles.map((f) => fs.stat(f).catch(() => null)),
    );
    const mtimes = stats.filter(Boolean).map((s) => s!.mtime);
    const sorted = [...mtimes].sort((a, b) => a.getTime() - b.getTime());

    summaries.push({
      harness: "claude-code",
      paths: claudeCodeFiles,
      fileCount: claudeCodeFiles.length,
      estimatedDateRange: sorted.length > 0
        ? { earliest: sorted[0], latest: sorted[sorted.length - 1] }
        : null,
      sampleTitles: claudeCodeFiles.slice(0, 3).map((f) =>
        path.basename(path.dirname(f)) + "/" + path.basename(f),
      ),
    });
  }

  // Codex
  const codexFiles = await globFiles(path.join(homeDir, ".codex", "archived_sessions", "*.jsonl"));
  if (codexFiles.length > 0) {
    const stats = await Promise.all(
      codexFiles.map((f) => fs.stat(f).catch(() => null)),
    );
    const mtimes = stats.filter(Boolean).map((s) => s!.mtime);
    const sorted = [...mtimes].sort((a, b) => a.getTime() - b.getTime());

    summaries.push({
      harness: "codex",
      paths: codexFiles,
      fileCount: codexFiles.length,
      estimatedDateRange: sorted.length > 0
        ? { earliest: sorted[0], latest: sorted[sorted.length - 1] }
        : null,
      sampleTitles: codexFiles.slice(0, 3).map((f) => path.basename(f, ".jsonl")),
    });
  }

  // Cursor — per-workspace store.db files + global state.vscdb
  const cursorStoreDbs = await findCursorStoreDbs(homeDir);
  const cursorStateVscdb = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Cursor",
    "User",
    "globalStorage",
    "state.vscdb",
  );

  const stateVscdbExists = await fs.stat(cursorStateVscdb).then(() => true).catch(() => false);
  const cursorPaths = [...cursorStoreDbs, ...(stateVscdbExists ? [cursorStateVscdb] : [])];

  if (cursorPaths.length > 0) {
    const stats = await Promise.all(
      cursorPaths.map((f) => fs.stat(f).catch(() => null)),
    );
    const mtimes = stats.filter(Boolean).map((s) => s!.mtime);
    const sorted = [...mtimes].sort((a, b) => a.getTime() - b.getTime());

    summaries.push({
      harness: "cursor",
      paths: cursorPaths,
      fileCount: cursorPaths.length,
      estimatedDateRange: sorted.length > 0
        ? { earliest: sorted[0], latest: sorted[sorted.length - 1] }
        : null,
      sampleTitles: cursorStoreDbs.slice(0, 3).map((f) =>
        path.basename(path.dirname(f)),
      ),
      requiresSqlite: true,
    });
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function discover(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const allFiles: ScoredFile[] = [];
  let totalScanned = 0;

  for (const scanPath of options.paths) {
    const resolved = path.resolve(scanPath);
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const files = await scanDirectory(resolved, 0, options.depth);
    totalScanned += files.length;
    allFiles.push(...files);
  }

  // Sort by score descending and take top N
  allFiles.sort((a, b) => b.score - a.score);
  const topFiles = allFiles.slice(0, options.top * 3); // Over-select for clustering

  const clusters = clusterByDirectory(topFiles);
  const topClusters = clusters.slice(0, options.top);

  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const harnessTranscripts = homeDir ? await discoverHarnessTranscripts(homeDir) : [];

  return {
    clusters: topClusters,
    totalFilesScanned: totalScanned,
    totalCandidates: allFiles.length,
    harnessTranscripts: harnessTranscripts.length > 0 ? harnessTranscripts : undefined,
  };
}

/**
 * Format discovery results for terminal output.
 */
export function formatDiscoveryOutput(result: DiscoveryResult): string {
  if (result.clusters.length === 0) {
    return "No high-value file clusters detected in the scanned directories.";
  }

  const lines: string[] = [];
  lines.push(
    `Detected ${result.clusters.length} likely high-value domain${result.clusters.length === 1 ? "" : "s"}:\n`,
  );

  for (let i = 0; i < result.clusters.length; i++) {
    const cluster = result.clusters[i];
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const displayPath = homeDir ? cluster.rootPath.replace(homeDir, "~") : cluster.rootPath;

    lines.push(`${i + 1}. ${cluster.name} (${displayPath}) -- ${cluster.files.length} file${cluster.files.length === 1 ? "" : "s"}`);
    lines.push(`   ${cluster.explanation}`);

    for (const file of cluster.files.slice(0, 5)) {
      const fileName = path.basename(file.filePath);
      const age = Math.round((Date.now() - file.modifiedAt.getTime()) / (1000 * 60 * 60 * 24));
      lines.push(`   - ${fileName} (score: ${file.score}, ${age}d ago)`);
    }

    if (cluster.files.length > 5) {
      lines.push(`   ... and ${cluster.files.length - 5} more`);
    }

    lines.push("");
  }

  lines.push(
    `Scanned ${result.totalFilesScanned} files, found ${result.totalCandidates} candidates.`,
  );

  if (result.harnessTranscripts && result.harnessTranscripts.length > 0) {
    lines.push("");
    lines.push("Harness transcripts detected:");
    for (const h of result.harnessTranscripts) {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const dateRange = h.estimatedDateRange
        ? ` (${h.estimatedDateRange.earliest.toISOString().slice(0, 7)} → ${h.estimatedDateRange.latest.toISOString().slice(0, 7)})`
        : "";
      const countLabel = h.harness === "cursor" && h.fileCount === 1
        ? "1 db"
        : `${h.fileCount} ${h.harness === "cursor" ? "db" + (h.fileCount > 1 ? "s" : "") : "file" + (h.fileCount > 1 ? "s" : "")}`;
      const sampleDir = h.paths[0] ? path.dirname(h.paths[0]).replace(homeDir, "~") : "";
      lines.push(`  ${h.harness}: ${countLabel}${dateRange}, ${sampleDir}`);
    }
    lines.push("");
    lines.push("Use `neotoma ingest-transcript --harness <name>` to preview and import.");
  }

  return lines.join("\n");
}

/**
 * Format discovery results as JSON for programmatic consumption.
 */
export function formatDiscoveryJson(result: DiscoveryResult): string {
  return JSON.stringify(
    {
      clusters: result.clusters.map((c) => ({
        name: c.name,
        path: c.rootPath,
        fileCount: c.files.length,
        totalScore: c.totalScore,
        explanation: c.explanation,
        files: c.files.map((f) => ({
          path: f.filePath,
          score: f.score,
          signals: f.signals,
          modifiedAt: f.modifiedAt.toISOString(),
          sizeBytes: f.sizeBytes,
        })),
      })),
      totalFilesScanned: result.totalFilesScanned,
      totalCandidates: result.totalCandidates,
      harnessTranscripts: result.harnessTranscripts?.map((h) => ({
        harness: h.harness,
        fileCount: h.fileCount,
        paths: h.paths,
        estimatedDateRange: h.estimatedDateRange
          ? {
              earliest: h.estimatedDateRange.earliest.toISOString(),
              latest: h.estimatedDateRange.latest.toISOString(),
            }
          : null,
        sampleTitles: h.sampleTitles,
        requiresSqlite: h.requiresSqlite ?? false,
      })),
    },
    null,
    2,
  );
}
