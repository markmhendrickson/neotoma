import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contract test over the `security_gates` CI job's wiring.
 *
 * neotoma#2180 and its follow-up comments found `main`'s branch protection
 * required-status-checks regressed from a non-empty set (`["security_gates",
 * "graph_render_smoke"]`, confirmed 2026-06-03) to an empty, disabled set
 * (`enforcement_level: "off"`, confirmed still true as of 2026-09-15 and
 * again 2026-09-26) — with no commit responsible, because that setting lives
 * in GitHub's branch-protection/ruleset API, not in a workflow file or any
 * other git-tracked config. Nothing in this repo asserted the job that
 * required-checks depends on was even still wired to run on the events that
 * matter, so a second, independent regression — the workflow's own `on:`
 * trigger narrowing, or a job/step-level `if: false` or blanket
 * `continue-on-error: true` added to `security_gates` itself — would be just
 * as silent and just as undetectable from the outside as the branch-
 * protection regression was.
 *
 * This test locks the half of that contract that lives in git: the workflow
 * triggers on `pull_request` and on `push` to `main`, and the `security_gates`
 * job carries no job-level `if` that could skip it and no step carries a
 * blanket `continue-on-error: true` that would let a failing gate step pass
 * the job anyway. It does NOT reach GitHub's live ruleset/branch-protection
 * API — that enforcement lives outside this repo's git history by
 * construction, so no commit-triggered test can watch it; verify it directly
 * with `gh api repos/markmhendrickson/neotoma/rulesets` (look for a ruleset
 * targeting `~DEFAULT_BRANCH` whose `required_status_checks` includes
 * `security_gates`) or the legacy `gh api repos/.../branches/main --jq
 * '.protection'`.
 *
 * Parses the workflow with plain string/regex reads (the convention already
 * used by `tests/contract/deploy_workflow_config.test.ts`), not a YAML
 * parser dependency, to avoid adding one for a single contract test.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WORKFLOW_PATH = ".github/workflows/ci_test_lanes.yml";

function readWorkflow(): string {
  return fs.readFileSync(path.join(repoRoot, WORKFLOW_PATH), "utf8");
}

/** Lines of the `on:` trigger block, up to the next top-level (unindented) key. */
function onTriggerBlock(source: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (start === -1) throw new Error("no top-level `on:` block found in workflow");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\S/.test(l)); // next unindented top-level key
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/** Lines of the named job's block, up to the next job at the same (2-space) indent. */
function jobBlock(source: string, jobName: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^  ${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`no job named "${jobName}" found in workflow`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l)); // next job at the same indent
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/**
 * Sub-block of `block` (a trigger's or job's own body) starting at the named
 * key, up to the next line at or below that key's own indent — i.e. "this
 * key's value, however it's shaped." Used to scope a `pull_request:` or
 * `push:` trigger's own body so a `paths`/`paths-ignore` filter check can't
 * cross into a sibling trigger.
 */
function subBlockAt(block: string, keyPattern: RegExp): string | null {
  const lines = block.split("\n");
  const start = lines.findIndex((l) => keyPattern.test(l));
  if (start === -1) return null;
  const startIndent = lines[start]!.match(/^(\s*)/)![1]!.length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    if (l.trim() === "") return false;
    const indent = l.match(/^(\s*)/)![1]!.length;
    return indent <= startIndent;
  });
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/**
 * Parses the `security_gates` job's `steps:` into `{ name, run }` pairs,
 * each step's OWN `run:` value rather than the whole job block's text — so a
 * check can assert what a specific named step actually executes, not merely
 * that some substring appears anywhere in the job (which a hollowed-out
 * step's now-empty `run:` would still pass, as long as an unrelated line —
 * e.g. this file's own doc comment about that step — happened to contain
 * the same text).
 */
function parseSteps(jobBlockText: string): Array<{ name: string; run: string | null }> {
  const lines = jobBlockText.split("\n");
  const stepsStart = lines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (stepsStart === -1) throw new Error("no `steps:` key found in job block");
  const stepLines = lines.slice(stepsStart + 1);

  const steps: Array<{ name: string; run: string | null }> = [];
  let current: { name: string; run: string | null } | null = null;
  let inRunBlock = false;
  let runIndent = -1;

  for (const line of stepLines) {
    const nameMatch = line.match(/^\s*- name:\s*(.+)$/);
    if (nameMatch) {
      if (current) steps.push(current);
      current = { name: nameMatch[1]!.trim(), run: null };
      inRunBlock = false;
      continue;
    }
    if (!current) continue; // before the first step, or malformed
    const runMatch = line.match(/^(\s*)run:\s*(.*)$/);
    if (runMatch) {
      const indent = runMatch[1]!.length;
      const rest = runMatch[2]!.trim();
      if (rest === "|" || rest === ">") {
        // Multi-line block scalar: collect subsequent more-indented lines.
        inRunBlock = true;
        runIndent = indent;
        current.run = "";
        continue;
      }
      // Single-line run: (may be quoted or bare).
      current.run = rest;
      inRunBlock = false;
      continue;
    }
    if (inRunBlock) {
      const lineIndent = line.match(/^(\s*)/)![1]!.length;
      if (line.trim() === "" || lineIndent > runIndent) {
        current.run = (current.run ?? "") + "\n" + line;
        continue;
      }
      inRunBlock = false;
    }
  }
  if (current) steps.push(current);
  return steps;
}

describe("security_gates CI job wiring (contract, not live branch protection)", () => {
  it("the workflow triggers on pull_request and on push to main", () => {
    const source = readWorkflow();
    const onBlock = onTriggerBlock(source);

    expect(
      onBlock,
      "workflow no longer triggers on pull_request — security_gates would stop running pre-merge"
    ).toMatch(/^\s*pull_request:\s*$/m);

    expect(
      onBlock,
      "workflow no longer triggers on push — security_gates would stop running on main"
    ).toMatch(/^\s*push:\s*$/m);

    // The push trigger's own `branches:` list, scoped so a `branches:` under
    // some OTHER top-level trigger key can't produce a false pass.
    const pushIndex = onBlock.search(/^\s*push:\s*$/m);
    const afterPush = onBlock.slice(pushIndex);
    const branchesMatch = afterPush.match(/branches:\s*\n((?:\s*-\s*\S+\s*\n?)+)/);
    expect(
      branchesMatch?.[1] ?? "",
      "push trigger no longer includes main — security_gates would stop running on pushes to main"
    ).toMatch(/^\s*-\s*main\s*$/m);
  });

  it("neither pull_request nor push carries a paths/paths-ignore filter", () => {
    // A path filter is a narrowing, not a removal — GitHub still reports
    // this job "required" on any excluded PR/push, it just never runs, so
    // GitHub blocks the merge on a check that will NEVER report. This is
    // the same silent-narrowing shape as the trigger-removal case above,
    // one layer more granular: reverting the fix locally for this exact
    // shape (adding `paths-ignore: ["**"]` under pull_request) left the
    // OTHER assertions in this file green, because none of them looked
    // inside the trigger body for a paths key.
    const onBlock = onTriggerBlock(readWorkflow());
    for (const trigger of [/^\s*pull_request:\s*$/m, /^\s*push:\s*$/m]) {
      const body = subBlockAt(onBlock, trigger);
      expect(body, `${trigger} trigger block not found in workflow \`on:\``).not.toBeNull();
      expect(
        body,
        `${trigger} carries a paths/paths-ignore filter — security_gates would silently ` +
          `stop running on excluded paths while GitHub still reports the check as required`
      ).not.toMatch(/^\s*paths(-ignore)?:\s*$/m);
    }
  });

  it("the security_gates job has no job-level `if` that could skip it", () => {
    const block = jobBlock(readWorkflow(), "security_gates");
    // A job-level `if:` sits at 4-space indent, directly under the job key
    // (2-space) and before any `steps:` (also 4-space) — same indent as
    // `runs-on:`. Distinguish it from a per-step `if:` (6-space, under a
    // `- name:` step entry) by requiring exactly 4 leading spaces.
    expect(
      block,
      "security_gates carries a job-level `if:` — this can silently skip the job " +
        "on events it used to run on, the same class of silent regression as the " +
        "branch-protection required-checks list going empty with no commit behind it"
    ).not.toMatch(/^ {4}if:/m);
  });

  it("no step in the security_gates job carries a blanket continue-on-error: true", () => {
    const block = jobBlock(readWorkflow(), "security_gates");
    expect(block).not.toMatch(/continue-on-error:\s*true\s*$/m);
  });

  it("the security_gates job still has its known gating steps with real commands", () => {
    const block = jobBlock(readWorkflow(), "security_gates");
    const steps = parseSteps(block);
    // Each of these names a step whose OWN run: field must invoke the real
    // security check (G1-G3 + manifest sync, per the job's own header
    // comment) — checked against parseSteps' per-step run field, not a
    // substring match over the whole job block's text. A substring match
    // over the whole block would still pass if a step's run: were hollowed
    // to a no-op while its name: comment (which mentions the check by name,
    // e.g. "G2 — security:lint") stayed put right next to it; reverting the
    // fix locally for exactly that shape confirmed the substring-match
    // version stayed green while this per-step version goes red.
    for (const runScript of [
      "security:classify-diff",
      "security:lint",
      "security:manifest:check",
      "test:security:auth-matrix",
    ]) {
      const step = steps.find((s) => (s.run ?? "").includes(runScript));
      expect(
        step,
        `no step's own run: field invokes \`npm run ${runScript}\` — found step names: ` +
          steps.map((s) => s.name).join(", ")
      ).toBeDefined();
      expect(step!.run, `step "${step!.name}"'s run: field is empty`).not.toBe("");
    }
  });

  it("every run:-based step's own run: is non-empty (none hollowed to a no-op)", () => {
    const block = jobBlock(readWorkflow(), "security_gates");
    const steps = parseSteps(block);
    expect(steps.length, "security_gates has no steps at all").toBeGreaterThan(0);
    // Steps that use an action (`uses:`, e.g. actions/checkout) legitimately
    // have no `run:` — this only checks steps parseSteps found a run: KEY
    // for, asserting that key's VALUE wasn't hollowed to empty.
    const runSteps = steps.filter((s) => s.run !== null);
    expect(runSteps.length, "no run:-based steps found — parseSteps may be broken").toBeGreaterThan(
      0
    );
    for (const step of runSteps) {
      expect((step.run ?? "").trim().length, `step "${step.name}"'s run: is empty`).toBeGreaterThan(
        0
      );
    }
  });
});
