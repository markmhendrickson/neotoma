/** Closed private runtime descriptor. Artifact integrity is not action authority. */
import { lstatSync, realpathSync, readFileSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname, sep } from "node:path";
import { createHash } from "node:crypto";

export class LifecycleExecutorRefused extends Error {
  constructor(readonly category: string) {
    super(category);
  }
}
export function refuse(category: string): never {
  throw new LifecycleExecutorRefused(category);
}
export interface Artifact {
  path: string;
  sha256: string;
}
export interface ExecutorManifest {
  version: "entity_lifecycle_executor_v1";
  candidate: {
    root: string;
    commit: string;
    tree: string;
    source_sha256: string;
    files: Artifact[];
    runtime: Artifact;
    proofs: Artifact[];
  };
  target: {
    deployment_id: string;
    deployment_version: string;
    environment: "development" | "production";
    application: string;
    machine: string;
    volume: string;
    backend: "sqlite";
    database: string;
    data: string;
    raw: string;
    logs: string;
    encryption_mode: "plaintext_sqlite";
    isolation: { kind: "owned_synthetic"; source_database: string; source_sha256: string };
  };
  expected_before: { inventory: Artifact; source_files: Artifact[] };
  backup: { manifest: Artifact; restore: Artifact; custody: Artifact };
  maintenance: {
    method: string;
    inventory: Artifact;
    exclusion: Artifact;
    valid_from: string;
    valid_until: string;
    resume: Artifact;
  };
  action_binding: { admission_id: string; admission_version: string; artifact: Artifact };
  expected_after: {
    state: "pre_cutover" | "committed";
    inventory: Artifact | null;
    schema: Artifact | null;
    materialized: Artifact | null;
    preserved_tables: string[];
    baselines: number;
    members: number;
  };
  evidence: { directory: string };
}
export function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  )
    refuse("manifest_invalid");
  return value as Record<string, unknown>;
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.includes("\0")) refuse("manifest_invalid");
}
function strings(object: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) text(object[key]);
}
function hash(value: unknown): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) refuse("manifest_invalid");
}
function artifact(value: unknown): void {
  const object = closed(value, ["path", "sha256"]);
  text(object.path);
  hash(object.sha256);
}
function artifacts(value: unknown): void {
  if (!Array.isArray(value)) refuse("manifest_invalid");
  for (const item of value) artifact(item);
}
export function validateManifest(value: unknown): ExecutorManifest {
  const object = closed(value, [
    "version",
    "candidate",
    "target",
    "expected_before",
    "backup",
    "maintenance",
    "action_binding",
    "expected_after",
    "evidence",
  ]);
  if (object.version !== "entity_lifecycle_executor_v1") refuse("manifest_invalid");
  const candidate = closed(object.candidate, [
    "root",
    "commit",
    "tree",
    "source_sha256",
    "files",
    "runtime",
    "proofs",
  ]);
  strings(candidate, ["root", "commit", "tree"]);
  hash(candidate.source_sha256);
  artifacts(candidate.files);
  artifact(candidate.runtime);
  artifacts(candidate.proofs);
  if (
    !/^[a-f0-9]{40}$/.test(candidate.commit as string) ||
    !/^[a-f0-9]{40}$/.test(candidate.tree as string)
  )
    refuse("manifest_invalid");
  const target = closed(object.target, [
    "deployment_id",
    "deployment_version",
    "environment",
    "application",
    "machine",
    "volume",
    "backend",
    "database",
    "data",
    "raw",
    "logs",
    "encryption_mode",
    "isolation",
  ]);
  strings(target, [
    "deployment_id",
    "deployment_version",
    "application",
    "machine",
    "volume",
    "database",
    "data",
    "raw",
    "logs",
  ]);
  if (
    !["development", "production"].includes(target.environment as string) ||
    target.backend !== "sqlite" ||
    target.encryption_mode !== "plaintext_sqlite"
  )
    refuse("backend_unsupported");
  const isolation = closed(target.isolation, ["kind", "source_database", "source_sha256"]);
  if (isolation.kind !== "owned_synthetic") refuse("custody_verifier_unavailable");
  text(isolation.source_database);
  hash(isolation.source_sha256);
  const before = closed(object.expected_before, ["inventory", "source_files"]);
  artifact(before.inventory);
  artifacts(before.source_files);
  const backup = closed(object.backup, ["manifest", "restore", "custody"]);
  for (const key of Object.keys(backup)) artifact(backup[key]);
  const maintenance = closed(object.maintenance, [
    "method",
    "inventory",
    "exclusion",
    "valid_from",
    "valid_until",
    "resume",
  ]);
  text(maintenance.method);
  for (const key of ["inventory", "exclusion", "resume"]) artifact(maintenance[key]);
  for (const key of ["valid_from", "valid_until"])
    if (
      typeof maintenance[key] !== "string" ||
      !Number.isFinite(Date.parse(maintenance[key] as string))
    )
      refuse("manifest_invalid");
  if (Date.parse(maintenance.valid_from as string) >= Date.parse(maintenance.valid_until as string))
    refuse("manifest_invalid");
  const action = closed(object.action_binding, ["admission_id", "admission_version", "artifact"]);
  strings(action, ["admission_id", "admission_version"]);
  artifact(action.artifact);
  const after = closed(object.expected_after, [
    "state",
    "inventory",
    "schema",
    "materialized",
    "preserved_tables",
    "baselines",
    "members",
  ]);
  if (!["pre_cutover", "committed"].includes(after.state as string)) refuse("manifest_invalid");
  for (const key of ["inventory", "schema", "materialized"])
    if (after[key] !== null) artifact(after[key]);
  if (
    !Array.isArray(after.preserved_tables) ||
    new Set(after.preserved_tables).size !== after.preserved_tables.length
  )
    refuse("manifest_invalid");
  for (const item of after.preserved_tables) text(item);
  for (const key of ["baselines", "members"])
    if (!Number.isSafeInteger(after[key]) || Number(after[key]) < 0) refuse("manifest_invalid");
  const evidence = closed(object.evidence, ["directory"]);
  text(evidence.directory);
  return value as ExecutorManifest;
}
export function existingPath(path: string, directory = false): string {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path)
    refuse("target_invalid");
  const stat = lstatSync(path);
  if (directory ? !stat.isDirectory() : !stat.isFile()) refuse("target_invalid");
  return path;
}
export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  if (value === undefined || (typeof value === "number" && !Number.isFinite(value)))
    refuse("evidence_invalid");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) refuse("evidence_invalid");
  return encoded;
}
export function artifactBytes(item: Artifact, root?: string): Buffer {
  existingPath(item.path);
  if (root) {
    const part = relative(root, item.path);
    if (!part || part.startsWith(`..${sep}`) || part === ".." || isAbsolute(part))
      refuse("evidence_invalid");
  }
  const bytes = readFileSync(item.path);
  if (sha256(bytes) !== item.sha256) refuse("evidence_invalid");
  return bytes;
}
export function artifactJson(item: Artifact, root: string): unknown {
  try {
    const stat = statSync(item.path);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
      refuse("evidence_invalid");
    return JSON.parse(artifactBytes(item, root).toString("utf8"));
  } catch (error) {
    if (error instanceof LifecycleExecutorRefused) throw error;
    refuse("evidence_invalid");
  }
}
export function protectedDirectory(path: string): void {
  existingPath(path, true);
  const stat = statSync(path);
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
    refuse("recording_unavailable");
}
export function outputPath(path: string, directory: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || dirname(path) !== directory)
    refuse("recording_unavailable");
}
