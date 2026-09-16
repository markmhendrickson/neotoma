/**
 * neotoma#2418 — the six build_landing_page_* scenarios must actually BIND.
 *
 * These scenarios are the qa-evidence for markmhendrickson/ateles#1026, and
 * the eval_scenarios runner SKIPS rather than fails on two conditions: a
 * `meta.quarantine` value, and a missing cassette. The CLI then exits 0
 * because it keys on `summary.failed`, not on skips. So the six could stop
 * covering anything while the lane stayed green — a control that does not bind
 * is not a control.
 *
 * This test is the thing that fails when that happens. It is a static check
 * (loader + filesystem), so it costs nothing and runs in the ordinary unit
 * lane rather than depending on the eval lane it protects.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadScenariosFromDir,
  DEFAULT_SCENARIO_DIR,
} from "../../packages/eval-harness/src/scenario.js";
import { cassetteFilename } from "../../packages/eval-harness/src/cassette.js";
import { DEFAULT_CASSETTE_DIR } from "../../packages/eval-harness/src/runner.js";

/** The exact ids Phoenicurus' QA guidance names. No aliases. */
const REQUIRED_IDS = [
  "build_landing_page_eight_stage_happy_path",
  "build_landing_page_upstream_reuse_no_duplicate",
  "build_landing_page_json_string_decision_register",
  "build_landing_page_readback_fail_closed",
  "build_landing_page_stage8_correct_verify",
  "build_landing_page_missing_context_blocks",
] as const;

const scenarios = loadScenariosFromDir(DEFAULT_SCENARIO_DIR, "build_landing_page");
const byId = new Map(scenarios.map((s) => [s.meta.id, s]));

describe("#2418 build_landing_page scenarios bind", () => {
  it("all six required ids exist, under exactly those names", () => {
    expect([...byId.keys()].sort()).toEqual([...REQUIRED_IDS].sort());
  });

  it.each(REQUIRED_IDS)("%s is not quarantined (quarantine = skipped = no evidence)", (id) => {
    expect(byId.get(id)?.meta.quarantine).toBeUndefined();
  });

  it.each(REQUIRED_IDS)("%s has a committed cassette for every model (missing = skipped)", (id) => {
    const scenario = byId.get(id)!;
    for (const model of scenario.models) {
      const path = join(
        DEFAULT_CASSETTE_DIR,
        cassetteFilename(id, model.provider, model.model, model.cassette_id)
      );
      expect(existsSync(path), `missing cassette ${path}`).toBe(true);
    }
  });

  it.each(REQUIRED_IDS)("%s asserts something (an empty expected[] passes vacuously)", (id) => {
    expect(byId.get(id)!.expected.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_IDS)("%s carries the tier2 + skill tags CI and humans filter on", (id) => {
    const tags = byId.get(id)!.meta.tags ?? [];
    expect(tags).toContain("tier2");
    expect(tags).toContain("skill:build-landing-page");
  });

  it("no scenario re-introduces the retired `publish_rendered_page == 0` build rule", () => {
    // ateles#1026 head 57494466: "Neither call is banned and neither
    // substitutes for the other." A stage-8 scenario asserting the call count
    // is zero pins a rule the canonical skill rejects. The fail-closed
    // scenarios may still assert it — there the claim is "no page was built by
    // ANY path", which both readings agree on — so this is scoped to the
    // build-stage scenario only.
    const stage8 = byId.get("build_landing_page_stage8_correct_verify")!;
    const offending = stage8.expected.filter(
      (p) => p.type === "mcp_tool.invocations" && p.tool_name === "publish_rendered_page"
    );
    expect(
      offending,
      "stage8_correct_verify must assert the EFFECT (correct on html_body, stable id, markers moved), " +
        "not that publish_rendered_page went uncalled — see the rationale comment in that file"
    ).toEqual([]);
  });

  it("every count / negative-existence assertion is marker-scoped or deliberately global", () => {
    // An `entity.count` without `where` counts EVERY entity of that type in the
    // isolated DB. That is legitimate — and STRONGER — for an eq-0 / eq-1
    // assertion whose point is "nothing else of this type exists anywhere in
    // the run", which is how these scenarios catch an artifact invented under a
    // name the marker cannot see. Anything else unscoped is the
    // silent-wrong-green authoring defect.
    for (const s of scenarios) {
      for (const p of s.expected) {
        if (p.type !== "entity.count") continue;
        if (p.where) continue;
        const global_ok = p.op === "eq" && (p.value === 0 || p.value === 1);
        expect(
          global_ok,
          `${s.meta.id}: unscoped entity.count on "${p.entity_type}" (${p.op} ${p.value}) — ` +
            `add where: { <declared isolation field>: … }, since an unscoped count is not isolation-safe`
        ).toBe(true);
      }
    }
  });

  it("the invention-evasion scenarios pair each marker-scoped count with an unscoped one", () => {
    // A negative assert scoped only by the run marker cannot fail on an
    // artifact invented under a different name — and an agent inventing an ICP
    // names it after the product, never after the run token. Both scenarios
    // below passed that mutation before this pairing was added.
    for (const [id, type] of [
      ["build_landing_page_missing_context_blocks", "target_persona"],
      ["build_landing_page_missing_context_blocks", "rendered_page"],
      ["build_landing_page_upstream_reuse_no_duplicate", "target_persona"],
    ] as const) {
      const counts = byId
        .get(id)!
        .expected.filter((p) => p.type === "entity.count" && p.entity_type === type);
      expect(
        counts.some((p) => !p.where),
        `${id}: entity.count on "${type}" is only marker-scoped; add an unscoped eq 0/1 so an ` +
          `artifact invented under another name cannot pass`
      ).toBe(true);
    }
  });
});
