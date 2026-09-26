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
    // Each of these names a step that runs an actual security check (G1–G3 +
    // manifest sync, per the job's own header comment). If a future edit
    // renames or removes one, this should fail loudly rather than the job
    // quietly doing less than its name promises.
    for (const runScript of [
      "security:classify-diff",
      "security:lint",
      "security:manifest:check",
      "test:security:auth-matrix",
    ]) {
      expect(block, `security_gates no longer runs \`npm run ${runScript}\``).toContain(runScript);
    }
  });
});
