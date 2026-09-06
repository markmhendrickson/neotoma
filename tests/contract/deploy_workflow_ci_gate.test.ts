import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contract test over the operator deploy workflow's "Wait for CI" gate and
 * "Escalate on failure" step, added alongside the fix for two regressions
 * (see PR #2301 / issue #2303):
 *
 *  1. `cancelled` check-run conclusions (produced when a rapid follow-up push
 *     cancels an in-progress `ci-test-lanes-<ref>` concurrency-group run for
 *     an older commit) were treated identically to `failure`, hard-failing
 *     the deploy on a false "CI is not green" verdict for a commit that was
 *     never actually red.
 *  2. The escalation step lacked `issues: write` and hard-failed on
 *     `gh issue create --label autodeploy-failure` whenever the preceding
 *     `gh label create` silently failed — so 0 issues were ever filed across
 *     6 recorded autodeploy failures.
 *
 * These are shell-embedded behaviors inside YAML, not TypeScript units, so
 * this test follows the existing pattern in
 * `deploy_workflow_config.test.ts`: assert against the workflow's source
 * text rather than executing the step live. It cannot invoke `gh api` here,
 * so it does not simulate the live poll loop end-to-end; it asserts the
 * specific source-level properties that are necessary for the fix to hold.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WORKFLOW = ".github/workflows/deploy-operator-instance.yml";

function readWorkflow(): string {
  return fs.readFileSync(path.join(repoRoot, WORKFLOW), "utf8");
}

describe("deploy_workflow_ci_gate_and_escalation", () => {
  it("grants issues: write, without which the escalation issue can never be filed", () => {
    const wf = readWorkflow();
    const permsBlock = wf.match(/^permissions:\n((?:^ {2}.+\n)+)/m)?.[1] ?? "";
    expect(permsBlock).toMatch(/^\s*issues:\s*write\b/m);
  });

  it("does not classify a cancelled check-run conclusion as FAILED", () => {
    const wf = readWorkflow();
    // The case statement's fallthrough `*)` arm appends to FAILED. `cancelled`
    // must have its own arm ABOVE that fallthrough, or it silently re-inherits
    // the failure classification this PR exists to remove.
    const caseBlock = wf.match(/case "\$CONCLUSION" in([\s\S]*?)esac/)?.[1] ?? "";
    expect(caseBlock).toMatch(/cancelled\)/);
    const cancelledArmIndex = caseBlock.indexOf("cancelled)");
    const fallthroughIndex = caseBlock.indexOf("*)");
    expect(cancelledArmIndex).toBeGreaterThan(-1);
    expect(fallthroughIndex).toBeGreaterThan(-1);
    expect(cancelledArmIndex).toBeLessThan(fallthroughIndex);
    // The cancelled arm must count toward PENDING (keep polling), not FAILED.
    const cancelledArm = caseBlock.slice(cancelledArmIndex, fallthroughIndex);
    expect(cancelledArm).toMatch(/PENDING=\$\(\(PENDING \+ 1\)\)/);
    expect(cancelledArm).not.toMatch(/FAILED="\$\{FAILED\}/);
  });

  it("reports timeout as inconclusive (not a hard FAIL assertion of red) when only cancellations were seen", () => {
    const wf = readWorkflow();
    const timeoutBlock =
      wf.match(/if \[ "\$\(date \+%s\)" -ge "\$DEADLINE" \]; then([\s\S]*?)\n\s*exit 1\n\s*fi/)?.[1] ??
      "";
    expect(timeoutBlock).toMatch(/INCONCLUSIVE/);
    // Must still refuse to deploy either way (exit 1 unconditionally reached).
    expect(wf).toMatch(/INCONCLUSIVE[\s\S]*?exit 1/);
  });

  it("creates the escalation issue unconditionally before attempting to attach the label", () => {
    const wf = readWorkflow();
    // Match the real create assignment, not the comment mentioning
    // `gh issue create --label` (that comment is historical rationale and
    // would false-red if we naively indexOf("gh issue create")).
    expect(wf).toMatch(
      /ISSUE_URL=\$\(gh issue create --repo "\$REPO" --title "\$TITLE" --body "\$BODY"\)/,
    );
    // Exclude YAML/shell comment lines: the historical rationale still mentions
    // `gh issue create --label`, which must not false-red this assertion.
    expect(wf).not.toMatch(/^[^#\n]*gh issue create[^\n]*--label/m);

    // Capture through the || guard on the edit continuation so we assert
    // the non-fatal attach, not just the first line of `gh issue edit`.
    const escalation =
      wf.match(/gh label create autodeploy-failure[\s\S]*?gh issue edit[\s\S]*?\|\|[\s\S]*?\n/)?.[0] ??
      "";
    expect(escalation).not.toBe("");
    expect(escalation.indexOf("ISSUE_URL=$(gh issue create")).toBeLessThan(
      escalation.indexOf("gh issue edit"),
    );
    expect(escalation).toMatch(/gh issue edit[\s\S]*?\|\|/);
  });
});
