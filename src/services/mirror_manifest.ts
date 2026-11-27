/**
 * Ownership manifest for the markdown mirror (issue #2939).
 *
 * Every mirror output root (the mirror path and each profile output_path)
 * carries a `.neotoma-mirror-manifest.json` listing the files the mirror wrote
 * (or found byte-identical to what it generates), with a sha256 of that
 * content, and the folders it created.
 *
 * Writing is unchanged by the manifest: same-name files are overwritten
 * exactly as before. The manifest only narrows `--clean`:
 * - Only the mirror's own output files can be removed: a file entry must end
 *   in `.md` and no path segment may start with a dot; a folder entry may not
 *   have a dot-prefixed segment. A manifest with any other entry is rejected.
 * - `--clean` removes a file only if it is in the manifest, in scope, not
 *   generated anywhere in this run, its current content hash equals the
 *   recorded hash, and no path component is a symbolic link. An edited file
 *   is kept and reported.
 * - `--clean` removes only folders the mirror created and that are empty.
 * - Without a manifest, or with an invalid or unreadable one, `--clean`
 *   removes nothing.
 * - Bookkeeping never changes what a write or removal does: a root is saved
 *   only after this run wrote to, removed from or cleaned it, and a manifest
 *   that cannot be read or saved is reported, never thrown.
 * - A symlinked root refuses `--clean`.
 * - One physical folder is one root, however it is spelled (a symbolic link in
 *   a parent folder, letter case on a case-insensitive filesystem): spellings
 *   are matched by real path and by device and inode, and a file generated in
 *   this run is never removed under any spelling. When sameness cannot be
 *   established, the string path is used for writing and nothing is removed.
 * - Markdown files under a cleaned scope that the manifest does not record
 *   are listed in the report (walked without following links).
 */

import { createHash, randomBytes } from "node:crypto";
import { promises as fs, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

export const MIRROR_MANIFEST_FILENAME = ".neotoma-mirror-manifest.json";
const MANIFEST_VERSION = 1;

export interface MirrorSafetyReport {
  removed: number;
  kept_edited: number;
  refused: number;
  kept_edited_paths: string[];
  refused_paths: string[];
  /** Markdown files under a cleaned scope that the manifest does not record. */
  unrecorded_paths: string[];
  notices: string[];
}

export function emptySafetyReport(): MirrorSafetyReport {
  return {
    removed: 0,
    kept_edited: 0,
    refused: 0,
    kept_edited_paths: [],
    refused_paths: [],
    unrecorded_paths: [],
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

/** A manifest file entry: a Markdown file with no dot-prefixed path segment. */
export function isMirrorOutputFile(rel: string): boolean {
  return rel.endsWith(".md") && isMirrorOutputDir(rel);
}

/** A manifest folder entry: no dot-prefixed path segment. */
export function isMirrorOutputDir(rel: string): boolean {
  return !rel.split("/").some((s) => s.startsWith("."));
}

type LoadState = "absent" | "valid" | "invalid" | "unreadable";

/** Paths that do not exist yet (or sit under a non-folder) mean no manifest. */
function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** Device and inode of an existing path (links followed); null when absent. */
function fileId(p: string): string | null {
  try {
    const st = statSync(p);
    return `${st.dev}:${st.ino}`;
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/** Real path of the nearest existing ancestor, joined with the rest. */
function physicalPath(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync(cur), ...tail);
    } catch (err) {
      if (!isMissing(err)) throw err;
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/** "" when `abs` is `root`, the relative path when inside, else null. */
function lexicalRel(root: string, abs: string): string | null {
  const r = path.relative(root, abs);
  if (r === "") return "";
  if (r.startsWith("..") || path.isAbsolute(r)) return null;
  return r.split(path.sep).join("/");
}

/**
 * Where `absPath` sits under `root`, comparing the paths as written, then by
 * real path, then by device and inode of existing folders: "" for the root
 * itself, a relative path when inside, null when outside or when sameness
 * cannot be established.
 */
export function relWithin(root: string, absPath: string): string | null {
  const r = path.resolve(root);
  const abs = path.resolve(absPath);
  const lexical = lexicalRel(r, abs);
  if (lexical !== null) return lexical;
  try {
    const physical = lexicalRel(physicalPath(r), physicalPath(abs));
    if (physical !== null) return physical;
    const rootId = fileId(r);
    if (!rootId) return null;
    let cur = abs;
    const tail: string[] = [];
    for (;;) {
      if (fileId(cur) === rootId) return tail.join("/");
      const parent = path.dirname(cur);
      if (parent === cur) return null;
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  } catch {
    return null;
  }
}

/** True when two spellings name one existing folder (or one real path). */
function sameFolder(a: string, b: string): boolean {
  return relWithin(a, b) === "";
}

export class RootManifest {
  readonly root: string;
  loadState: LoadState = "absent";
  /** rel path -> sha256 of content the mirror wrote. */
  files = new Map<string, string>();
  /** rel paths of directories the mirror created. */
  dirs = new Set<string>();
  dirty = false;
  /** True once this run wrote to, removed from or cleaned this root. */
  touched = false;
  /** Absolute paths generated anywhere in this run (shared across roots). */
  readonly runWritten: Set<string>;
  /** Device and inode of files generated anywhere in this run (shared). */
  readonly runWrittenIds: Set<string>;
  /** Every configured spelling of this root's folder; `root` is the first. */
  readonly spellings: string[];

  constructor(
    root: string,
    runWritten: Set<string> = new Set(),
    runWrittenIds: Set<string> = new Set()
  ) {
    this.root = path.resolve(root);
    this.runWritten = runWritten;
    this.runWrittenIds = runWrittenIds;
    this.spellings = [this.root];
  }

  /** "" for the root itself, a relative path inside it, else null. */
  relOrSelf(absPath: string): string | null {
    for (const s of this.spellings) {
      const r = relWithin(s, absPath);
      if (r !== null) return r;
    }
    return null;
  }

  private markChanged(): void {
    this.dirty = true;
    this.touched = true;
  }

  get manifestPath(): string {
    return path.join(this.root, MIRROR_MANIFEST_FILENAME);
  }

  rel(absPath: string): string | null {
    const r = this.relOrSelf(absPath);
    return r ? r : null;
  }

  /** True when `absPath` is this root itself or a path inside it. */
  contains(absPath: string): boolean {
    return this.relOrSelf(absPath) !== null;
  }

  /** Was this file generated in this run, under any spelling? */
  private writtenThisRun(rel: string): boolean {
    for (const s of this.spellings) {
      if (this.runWritten.has(path.join(s, rel))) return true;
    }
    try {
      const id = fileId(path.join(this.root, rel));
      return id !== null && this.runWrittenIds.has(id);
    } catch {
      // Sameness cannot be established: treat it as generated and keep it.
      return true;
    }
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
      if (isMissing(err)) {
        this.loadState = "absent";
        return;
      }
      this.loadState = "unreadable";
      report.notices.push(
        `Mirror manifest at ${this.manifestPath} could not be read ` +
          `(${(err as NodeJS.ErrnoException).code ?? (err as Error).message}); ` +
          `--clean removes nothing from this root and the manifest is left as it is.`
      );
      return;
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
        if (!isMirrorOutputFile(rel)) throw new Error(`entry is not a mirror output file`);
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
          if (!isMirrorOutputDir(d)) throw new Error(`entry is not a mirror output folder`);
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
          `no files will be removed from this root, and a new manifest will be written ` +
          `when this run writes to it.`
      );
    }
  }

  /** Atomic write: temp file (unique per write) in the same dir, then rename. */
  async save(): Promise<void> {
    if (!this.dirty || !this.touched || this.loadState === "unreadable") return;
    const files: Record<string, string> = {};
    for (const k of [...this.files.keys()].sort()) files[k] = this.files.get(k)!;
    const body =
      JSON.stringify({ version: MANIFEST_VERSION, files, dirs: [...this.dirs].sort() }, null, 2) +
      "\n";
    await fs.mkdir(this.root, { recursive: true });
    const tmp = `${this.manifestPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await fs.writeFile(tmp, body, { encoding: "utf8", flag: "wx" });
      await fs.rename(tmp, this.manifestPath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
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
    if (this.loadState === "unreadable") return;
    for (const m of missing) {
      const r = this.rel(m);
      if (r && isMirrorOutputDir(r) && !this.dirs.has(r)) {
        this.dirs.add(r);
        this.markChanged();
      }
    }
  }

  /**
   * Write `content` to `filePath` exactly as the mirror always has (overwrite
   * when different), recording the written content's hash.
   */
  async write(filePath: string, content: string): Promise<"written" | "unchanged"> {
    const rel = this.rel(filePath);
    const hash = sha256(content);
    await this.ensureDir(path.dirname(filePath));
    let result: "written" | "unchanged" = "written";
    try {
      const existing = await fs.readFile(filePath, "utf8");
      if (existing === content) result = "unchanged";
    } catch {
      // Not present — fall through to write.
    }
    if (result === "written") await fs.writeFile(filePath, content, "utf8");
    this.runWritten.add(path.resolve(filePath));
    try {
      const id = fileId(filePath);
      if (id) this.runWrittenIds.add(id);
    } catch {
      // Bookkeeping never fails a write.
    }
    this.touched = true;
    if (this.loadState === "unreadable") return result;
    if (rel && isMirrorOutputFile(rel) && this.files.get(rel) !== hash) {
      this.files.set(rel, hash);
      this.markChanged();
    }
    return result;
  }

  /** Drop a file the mirror removed (incremental removal) from the manifest. */
  forget(filePath: string): void {
    this.touched = true;
    const rel = this.rel(filePath);
    if (rel && this.files.delete(rel)) this.markChanged();
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
        this.markChanged();
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
      this.markChanged();
      return "kept";
    }
    await fs.unlink(abs);
    this.files.delete(rel);
    this.markChanged();
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
    for (const spelling of this.spellings) {
      const st = spelling === this.root ? rootStat : await fs.lstat(spelling).catch(() => null);
      if (st?.isSymbolicLink()) {
        report.refused++;
        report.refused_paths.push(spelling);
        report.notices.push(
          `--clean refused: mirror output root ${spelling} is a symlink; nothing was removed.`
        );
        return 0;
      }
    }
    if (this.loadState !== "valid") {
      if (this.loadState === "absent") {
        report.notices.push(
          `--clean removed nothing in ${this.root}: no ownership manifest was found. ` +
            `This rebuild writes one; the next --clean can remove stale generated files.`
        );
      }
      // Cleaning is part of this run: write a fresh manifest for an absent or
      // rejected one, but only where the root already exists.
      if (this.loadState !== "unreadable" && rootStat?.isDirectory()) this.markChanged();
      await this.listUnrecorded(scopeDir, report);
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
    if (rootStat?.isDirectory()) this.touched = true;
    for (const rel of [...this.files.keys()].sort()) {
      if (!inScope(rel) || keepRel.has(rel)) continue;
      // Never remove anything this run generated, under any root.
      if (this.writtenThisRun(rel)) continue;
      if (!isMirrorOutputFile(rel)) continue;
      if (preserveNames.has(path.posix.basename(rel))) continue;
      if ((await this.removeEntry(rel, report)) === "removed") removed++;
    }
    // Owned dirs, deepest first; remove only if empty and a real directory.
    const dirs = [...this.dirs].filter(inScope).sort((a, b) => b.length - a.length);
    for (const rel of dirs) {
      if (!isMirrorOutputDir(rel)) continue;
      if (await this.hasSymlinkComponent(rel)) continue;
      const abs = path.join(this.root, rel);
      try {
        const st = await fs.lstat(abs);
        if (!st.isDirectory()) continue;
        if ((await fs.readdir(abs)).length > 0) continue;
        await fs.rmdir(abs);
        this.dirs.delete(rel);
        this.markChanged();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          this.dirs.delete(rel);
          this.markChanged();
        }
      }
    }
    await this.listUnrecorded(scopeDir, report);
    return removed;
  }

  /**
   * Add every Markdown file under `scopeDir` that the manifest does not record
   * to `report.unrecorded_paths`. Never follows symbolic links and does not
   * descend into a folder that holds its own manifest (a nested root).
   */
  private async listUnrecorded(scopeDir: string, report: MirrorSafetyReport): Promise<void> {
    const seen = new Set(report.unrecorded_paths);
    const walk = async (dir: string, isRoot: boolean): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      if (!isRoot && entries.some((e) => e.name === MIRROR_MANIFEST_FILENAME)) return;
      for (const entry of entries.sort((x, y) => (x.name < y.name ? -1 : 1))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, false);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const rel = this.rel(full);
          if (rel && this.files.has(rel)) continue;
          if (!seen.has(full)) {
            seen.add(full);
            report.unrecorded_paths.push(full);
          }
        }
      }
    };
    const st = await fs.lstat(scopeDir).catch(() => null);
    if (!st || !st.isDirectory()) return;
    await walk(scopeDir, this.relOrSelf(scopeDir) === "");
  }
}

/**
 * A set of manifests for one rebuild or one incremental mirror operation.
 * Paths are routed to the deepest registered root that contains them.
 */
export class MirrorManifestSession {
  readonly report: MirrorSafetyReport;
  private roots = new Map<string, RootManifest>();
  /** Absolute paths generated anywhere in this run; never removed by a clean. */
  readonly runWritten = new Set<string>();
  readonly runWrittenIds = new Set<string>();

  constructor(report: MirrorSafetyReport = emptySafetyReport()) {
    this.report = report;
  }

  async addRoot(root: string): Promise<RootManifest> {
    const key = path.resolve(root);
    const existing = this.roots.get(key);
    if (existing) return existing;
    // Another spelling of a registered folder routes to the same manifest.
    for (const m of this.roots.values()) {
      if (sameFolder(m.root, key)) {
        m.spellings.push(key);
        this.roots.set(key, m);
        return m;
      }
    }
    const m = new RootManifest(key, this.runWritten, this.runWrittenIds);
    // Registering a root writes nothing: it is saved only once this run
    // writes to, removes from or cleans it.
    await m.load(this.report);
    this.roots.set(key, m);
    return m;
  }

  /** Distinct manifests (one per physical folder). */
  private manifests(): RootManifest[] {
    return [...new Set(this.roots.values())];
  }

  /**
   * Merge `other` into `into` when two roots registered before their folder
   * existed turn out to be one folder: both loaded the same manifest file.
   */
  private merge(into: RootManifest, other: RootManifest): void {
    for (const s of other.spellings) {
      into.spellings.push(s);
      this.roots.set(s, into);
    }
    for (const [k, v] of other.files) into.files.set(k, v);
    for (const d of other.dirs) into.dirs.add(d);
    into.dirty ||= other.dirty;
    into.touched ||= other.touched;
    const rank: LoadState[] = ["absent", "valid", "invalid", "unreadable"];
    if (rank.indexOf(other.loadState) > rank.indexOf(into.loadState)) {
      into.loadState = other.loadState;
    }
  }

  /** The deepest registered root that contains `filePath`, under any spelling. */
  rootFor(filePath: string): RootManifest | null {
    let best: RootManifest | null = null;
    let bestDepth = Infinity;
    for (const m of this.manifests()) {
      const r = m.relOrSelf(filePath);
      if (r === null) continue;
      const depth = r === "" ? 0 : r.split("/").length;
      if (best && depth === bestDepth && best !== m) {
        this.merge(best, m);
      } else if (depth < bestDepth) {
        best = m;
        bestDepth = depth;
      }
    }
    return best;
  }

  /** Save every changed root. A failed save is reported, never thrown. */
  async saveAll(): Promise<void> {
    const list = this.manifests();
    const live = (x: RootManifest) => this.roots.get(x.root) === x;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (live(list[i]) && live(list[j]) && sameFolder(list[i].root, list[j].root)) {
          this.merge(list[i], list[j]);
        }
      }
    }
    for (const m of this.manifests()) {
      try {
        await m.save();
      } catch (err) {
        m.dirty = false;
        this.report.notices.push(
          `Mirror manifest at ${m.manifestPath} could not be saved ` +
            `(${(err as NodeJS.ErrnoException).code ?? (err as Error).message}); ` +
            `files were written as usual, but this run's ownership records were not kept.`
        );
      }
    }
  }
}
