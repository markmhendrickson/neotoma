/**
 * Owned-paths manifest for the markdown mirror (issue #2939).
 *
 * Every mirror output root (the mirror path and each profile output_path)
 * carries a `.neotoma-mirror-manifest.json` listing the files the mirror wrote,
 * with a sha256 of the content it wrote, and the directories it created.
 *
 * Safety rules enforced here:
 * - A write never overwrites an existing file that is not in the manifest and
 *   whose content differs (skipped_foreign).
 * - `--clean` removes a file only if it is in the manifest, is no longer
 *   generated, and its current content hash equals the recorded hash. An
 *   edited file is kept (kept_edited) and released from the manifest.
 * - Without a manifest, `--clean` removes nothing; the run writes a manifest.
 * - Symlinks are never followed for deletion. A symlinked root refuses clean.
 * - A manifest with absolute, `..`, or out-of-root entries is rejected whole.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export const MIRROR_MANIFEST_FILENAME = ".neotoma-mirror-manifest.json";
const MANIFEST_VERSION = 1;

export interface MirrorSafetyReport {
  removed: number;
  kept_edited: number;
  skipped_foreign: number;
  refused: number;
  kept_edited_paths: string[];
  skipped_foreign_paths: string[];
  refused_paths: string[];
  notices: string[];
}

export function emptySafetyReport(): MirrorSafetyReport {
  return {
    removed: 0,
    kept_edited: 0,
    skipped_foreign: 0,
    refused: 0,
    kept_edited_paths: [],
    skipped_foreign_paths: [],
    refused_paths: [],
    notices: [],
  };
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Validate a manifest-relative path: relative, normalized, no `..`, inside root. */
export function isSafeRelativePath(root: string, rel: unknown): rel is string {
  if (typeof rel !== "string" || rel.length === 0) return false;
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel)) return false;
  if (rel.includes("\0") || rel.includes("\\")) return false;
  const segments = rel.split("/");
  if (segments.some((s) => s === ".." || s === "." || s === "")) return false;
  const resolved = path.resolve(root, rel);
  const relBack = path.relative(path.resolve(root), resolved);
  return relBack === rel && !relBack.startsWith("..");
}

type LoadState = "absent" | "valid" | "invalid";

export class RootManifest {
  readonly root: string;
  loadState: LoadState = "absent";
  /** rel path -> sha256 of content the mirror wrote. */
  files = new Map<string, string>();
  /** rel paths of directories the mirror created. */
  dirs = new Set<string>();
  dirty = false;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  get manifestPath(): string {
    return path.join(this.root, MIRROR_MANIFEST_FILENAME);
  }

  rel(absPath: string): string | null {
    const r = path.relative(this.root, path.resolve(absPath));
    if (!r || r.startsWith("..") || path.isAbsolute(r)) return null;
    return r.split(path.sep).join("/");
  }

  async load(report: MirrorSafetyReport): Promise<void> {
    let raw: string;
    try {
      const st = await fs.lstat(this.manifestPath);
      if (!st.isFile()) {
        this.loadState = "invalid";
        report.notices.push(
          `Mirror manifest at ${this.manifestPath} is not a regular file; ignored.`
        );
        return;
      }
      raw = await fs.readFile(this.manifestPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.loadState = "absent";
        return;
      }
      throw err;
    }
    try {
      const parsed = JSON.parse(raw) as {
        version?: unknown;
        files?: unknown;
        dirs?: unknown;
      };
      if (parsed.version !== MANIFEST_VERSION) throw new Error("unsupported version");
      if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
        throw new Error("files must be an object");
      }
      const files = new Map<string, string>();
      for (const [rel, hash] of Object.entries(parsed.files as Record<string, unknown>)) {
        if (!isSafeRelativePath(this.root, rel)) throw new Error(`unsafe path entry`);
        if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
          throw new Error(`bad hash entry`);
        }
        files.set(rel, hash);
      }
      const dirs = new Set<string>();
      if (parsed.dirs !== undefined) {
        if (!Array.isArray(parsed.dirs)) throw new Error("dirs must be an array");
        for (const d of parsed.dirs) {
          if (!isSafeRelativePath(this.root, d)) throw new Error(`unsafe dir entry`);
          dirs.add(d);
        }
      }
      this.files = files;
      this.dirs = dirs;
      this.loadState = "valid";
    } catch (err) {
      this.loadState = "invalid";
      this.files = new Map();
      this.dirs = new Set();
      report.refused++;
      report.refused_paths.push(this.manifestPath);
      report.notices.push(
        `Mirror manifest at ${this.manifestPath} was rejected (${(err as Error).message}); ` +
          `no files will be removed from this root, and a new manifest will be written.`
      );
    }
  }

  /** Atomic write: temp file in the same dir, then rename. */
  async save(): Promise<void> {
    if (!this.dirty) return;
    const files: Record<string, string> = {};
    for (const k of [...this.files.keys()].sort()) files[k] = this.files.get(k)!;
    const body =
      JSON.stringify({ version: MANIFEST_VERSION, files, dirs: [...this.dirs].sort() }, null, 2) +
      "\n";
    await fs.mkdir(this.root, { recursive: true });
    const tmp = `${this.manifestPath}.tmp-${process.pid}`;
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, this.manifestPath);
    this.dirty = false;
  }

  /** mkdir -p, recording every directory this call created. */
  async ensureDir(dir: string): Promise<void> {
    const abs = path.resolve(dir);
    const missing: string[] = [];
    let cur = abs;
    for (;;) {
      try {
        await fs.lstat(cur);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        missing.push(cur);
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }
    await fs.mkdir(abs, { recursive: true });
    for (const m of missing) {
      const r = this.rel(m);
      if (r && !this.dirs.has(r)) {
        this.dirs.add(r);
        this.dirty = true;
      }
    }
  }

  /**
   * Write `content` to `filePath` unless that would overwrite a file the
   * mirror does not own. Returns "skipped_foreign" in that case.
   */
  async write(
    filePath: string,
    content: string,
    report: MirrorSafetyReport
  ): Promise<"written" | "unchanged" | "skipped_foreign"> {
    const rel = this.rel(filePath);
    const hash = sha256(content);
    await this.ensureDir(path.dirname(filePath));
    let st: import("node:fs").Stats | null = null;
    try {
      st = await fs.lstat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (st) {
      if (!st.isFile()) {
        // Symlink, directory, or special file at a generated path: never touch.
        report.skipped_foreign++;
        report.skipped_foreign_paths.push(filePath);
        return "skipped_foreign";
      }
      const existing = await fs.readFile(filePath, "utf8");
      if (existing === content) {
        if (rel && this.files.get(rel) !== hash) {
          this.files.set(rel, hash);
          this.dirty = true;
        }
        return "unchanged";
      }
      if (!rel || !this.files.has(rel)) {
        report.skipped_foreign++;
        report.skipped_foreign_paths.push(filePath);
        return "skipped_foreign";
      }
    }
    await fs.writeFile(filePath, content, "utf8");
    if (rel) {
      this.files.set(rel, hash);
      this.dirty = true;
    }
    return "written";
  }

  /** Remove one owned file if it is unedited. Used by incremental removals. */
  async removeOwned(
    filePath: string,
    report: MirrorSafetyReport
  ): Promise<"removed" | "absent" | "kept"> {
    const rel = this.rel(filePath);
    if (!rel || !this.files.has(rel)) {
      try {
        await fs.lstat(filePath);
        return "kept";
      } catch {
        return "absent";
      }
    }
    return this.removeEntry(rel, report);
  }

  private async hasSymlinkComponent(rel: string): Promise<boolean> {
    const parts = rel.split("/");
    let cur = this.root;
    for (const part of parts) {
      cur = path.join(cur, part);
      try {
        const st = await fs.lstat(cur);
        if (st.isSymbolicLink()) return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private async removeEntry(
    rel: string,
    report: MirrorSafetyReport
  ): Promise<"removed" | "absent" | "kept"> {
    const abs = path.join(this.root, rel);
    if (await this.hasSymlinkComponent(rel)) {
      report.refused++;
      report.refused_paths.push(abs);
      return "kept";
    }
    let st: import("node:fs").Stats;
    try {
      st = await fs.lstat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.files.delete(rel);
        this.dirty = true;
        return "absent";
      }
      throw err;
    }
    if (!st.isFile()) {
      report.refused++;
      report.refused_paths.push(abs);
      return "kept";
    }
    const current = sha256(await fs.readFile(abs, "utf8"));
    if (current !== this.files.get(rel)) {
      // The user edited it: keep the file and release ownership.
      report.kept_edited++;
      report.kept_edited_paths.push(abs);
      this.files.delete(rel);
      this.dirty = true;
      return "kept";
    }
    await fs.unlink(abs);
    this.files.delete(rel);
    this.dirty = true;
    report.removed++;
    return "removed";
  }

  /**
   * `--clean` for one scope directory under this root. Removes owned, unedited
   * files under `scopeDir` that are not in `keep`, then owned empty dirs.
   * Returns the number of files removed.
   */
  async clean(
    scopeDir: string,
    keep: Set<string>,
    preserveNames: Set<string>,
    report: MirrorSafetyReport
  ): Promise<number> {
    const rootStat = await fs.lstat(this.root).catch(() => null);
    if (rootStat?.isSymbolicLink()) {
      report.refused++;
      report.refused_paths.push(this.root);
      report.notices.push(
        `--clean refused: mirror output root ${this.root} is a symlink; nothing was removed.`
      );
      return 0;
    }
    if (this.loadState !== "valid") {
      if (this.loadState === "absent") {
        report.notices.push(
          `--clean removed nothing in ${this.root}: cleanup needs an owned-paths manifest, ` +
            `which this rebuild has now written. The next --clean will remove stale generated files.`
        );
      }
      return 0;
    }
    const scopeRel = this.rel(scopeDir);
    const inScope = (rel: string) =>
      scopeRel === null ? true : rel === scopeRel || rel.startsWith(`${scopeRel}/`);
    const keepRel = new Set<string>();
    for (const k of keep) {
      const r = this.rel(k);
      if (r) keepRel.add(r);
    }
    let removed = 0;
    for (const rel of [...this.files.keys()].sort()) {
      if (!inScope(rel) || keepRel.has(rel)) continue;
      if (preserveNames.has(path.posix.basename(rel))) continue;
      if ((await this.removeEntry(rel, report)) === "removed") removed++;
    }
    // Owned dirs, deepest first; remove only if empty and a real directory.
    const dirs = [...this.dirs].filter(inScope).sort((a, b) => b.length - a.length);
    for (const rel of dirs) {
      if (await this.hasSymlinkComponent(rel)) continue;
      const abs = path.join(this.root, rel);
      try {
        const st = await fs.lstat(abs);
        if (!st.isDirectory()) continue;
        if ((await fs.readdir(abs)).length > 0) continue;
        await fs.rmdir(abs);
        this.dirs.delete(rel);
        this.dirty = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          this.dirs.delete(rel);
          this.dirty = true;
        }
      }
    }
    return removed;
  }
}

/**
 * A set of manifests for one rebuild or one incremental mirror operation.
 * Paths are routed to the deepest registered root that contains them.
 */
export class MirrorManifestSession {
  readonly report: MirrorSafetyReport;
  private roots = new Map<string, RootManifest>();

  constructor(report: MirrorSafetyReport = emptySafetyReport()) {
    this.report = report;
  }

  async addRoot(root: string): Promise<RootManifest> {
    const key = path.resolve(root);
    const existing = this.roots.get(key);
    if (existing) return existing;
    const m = new RootManifest(key);
    await m.load(this.report);
    // A freshly loaded absent/invalid manifest must be (re)written by this run.
    if (m.loadState !== "valid") m.dirty = true;
    this.roots.set(key, m);
    return m;
  }

  rootFor(filePath: string): RootManifest | null {
    let best: RootManifest | null = null;
    for (const m of this.roots.values()) {
      if (m.rel(filePath) !== null && (!best || m.root.length > best.root.length)) best = m;
    }
    return best;
  }

  async saveAll(): Promise<void> {
    for (const m of this.roots.values()) await m.save();
  }
}
