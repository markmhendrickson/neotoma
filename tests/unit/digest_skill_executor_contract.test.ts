import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveNeotomaPackageRoot } from "../../src/mcp_instruction_doc.js";

function readDigestSkill(): string {
  const overridePath = process.env.NEOTOMA_DIGEST_SKILL_CONTRACT_PATH?.trim();
  return readFileSync(
    overridePath || join(resolveNeotomaPackageRoot(), "skills", "status", "SKILL.md"),
    "utf8"
  );
}

describe("digest skill executor visibility contract", () => {
  it("shows a live executor for every remaining workstream", () => {
    const skill = readDigestSkill();

    expect(skill).toContain("Every remaining workstream also names its **live executor**");
    expect(skill).toContain("Owner and executor are different facts.");
    expect(skill).toContain("label the workstream `queued — unassigned`");
  });

  it("keeps live work visible when the durable task binding is missing", () => {
    const skill = readDigestSkill();

    expect(skill).toContain("label the durable binding `task: missing`");
    expect(skill).toContain("surface the missing task binding as a tracking defect");
  });

  it("persists executor state only as the nested tasks_claimed object", () => {
    const skill = readDigestSkill();

    expect(skill).toContain("`executor` is a compact nested object `{kind, name, status, ref?}`");
    expect(skill).toContain(
      "`root_session | subagent | background_task | automation | operator | external_party | unassigned`"
    );
    expect(skill).toContain("Do not add separate top-level executor fields to `session_digest`.");
  });
});
