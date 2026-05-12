import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  captureHarnessPlan,
  deriveIdentityFromFilename,
  detectHarnessFromPath,
  parsePlanMarkdown,
} from "./capture_harness_plan.js";

const SAMPLE_PLAN = `---
name: Process Issues Skill
overview: Author a process-issues skill that walks open issues and emits plans.
todos:
  - id: plan_schema
    content: Add the generic plan schema.
    status: completed
  - id: skill_file
    content: Author the skill markdown file.
    status: in_progress
isProject: false
---

# Plan body

This plan describes the work needed to ship the skill.
`;

describe("capture_harness_plan helpers", () => {
  it("detects the cursor harness from the file path", () => {
    const cursorPath = path.join("/repo", ".cursor", "plans", "x.plan.md");
    expect(detectHarnessFromPath(cursorPath)).toBe("cursor");
  });

  it("returns 'other' for unknown paths", () => {
    expect(detectHarnessFromPath("/tmp/random.plan.md")).toBe("other");
  });

  it("derives slug + harness_plan_id from a Cursor-style filename", () => {
    const id = deriveIdentityFromFilename("/repo/.cursor/plans/process-issues_skill_2d3bdfdc.plan.md", "cursor");
    expect(id.slug).toBe("process-issues_skill_2d3bdfdc");
    expect(id.harness_plan_id).toBe("2d3bdfdc");
    expect(id.harness).toBe("cursor");
  });

  it("derives slug only when the filename has no hex suffix", () => {
    const id = deriveIdentityFromFilename("/repo/.claude/plans/feature-x.plan.md", "claude_code");
    expect(id.slug).toBe("feature-x");
    expect(id.harness_plan_id).toBeNull();
  });

  it("parses YAML frontmatter and splits the markdown body", () => {
    const parsed = parsePlanMarkdown(SAMPLE_PLAN);
    expect(parsed.frontmatter.name).toBe("Process Issues Skill");
    expect(parsed.frontmatter.isProject).toBe(false);
    expect(parsed.body.startsWith("# Plan body")).toBe(true);
    expect(Array.isArray(parsed.frontmatter.todos)).toBe(true);
  });

  it("treats files without frontmatter as raw body", () => {
    const parsed = parsePlanMarkdown("# Just a body\n\nSome text.");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body.startsWith("# Just a body")).toBe(true);
  });
});

describe("captureHarnessPlan", () => {
  async function writeSample(prefix: string, name: string, body: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const file = path.join(dir, name);
    await fs.writeFile(file, body, "utf8");
    return file;
  }

  it("builds a combined-store payload with structured plan, file linkage, and idempotency keys", async () => {
    const file = await writeSample(
      "neotoma-plan-cap-",
      "process-issues_skill_2d3bdfdc.plan.md",
      SAMPLE_PLAN,
    );
    try {
      const result = await captureHarnessPlan({
        file_path: file,
        harness: "cursor",
        source_entity_id: "ent_issue_123",
        source_entity_type: "issue",
        repository_name: "neotoma",
      });

      expect(result.identity.slug).toBe("process-issues_skill_2d3bdfdc");
      expect(result.identity.harness).toBe("cursor");
      expect(result.identity.harness_plan_id).toBe("2d3bdfdc");

      expect(result.storePayload.entities).toHaveLength(1);
      const plan = result.storePayload.entities[0] as Record<string, unknown>;
      expect(plan.entity_type).toBe("plan");
      expect(plan.title).toBe("Process Issues Skill");
      expect(plan.harness).toBe("cursor");
      expect(plan.harness_plan_id).toBe("2d3bdfdc");
      expect(plan.plan_kind).toBe("harness_plan");
      expect(plan.source_entity_id).toBe("ent_issue_123");
      expect(plan.source_entity_type).toBe("issue");
      expect(plan.repository_name).toBe("neotoma");
      expect(typeof plan.body).toBe("string");
      expect(plan.body).toContain("# Plan body");
      expect(plan.is_project).toBe(false);
      expect(Array.isArray(plan.todos)).toBe(true);
      expect((plan.todos as unknown[]).length).toBe(2);

      expect(result.storePayload.file_path).toBe(file);
      expect(result.storePayload.idempotency_key).toBe(
        "plan-capture-cursor-2d3bdfdc",
      );
      expect(result.storePayload.file_idempotency_key).toBe(
        "plan-file-cursor-2d3bdfdc",
      );
    } finally {
      await fs.rm(path.dirname(file), { recursive: true, force: true });
    }
  });

  it("emits a REFERS_TO relationship from the prompting message when supplied", async () => {
    const file = await writeSample("neotoma-plan-cap-", "ad-hoc.plan.md", SAMPLE_PLAN);
    try {
      const result = await captureHarnessPlan({
        file_path: file,
        source_message_entity_id: "ent_msg_xyz",
      });
      expect(result.storePayload.relationships).toEqual([
        {
          relationship_type: "REFERS_TO",
          source_entity_id: "ent_msg_xyz",
          target_index: 0,
        },
      ]);
    } finally {
      await fs.rm(path.dirname(file), { recursive: true, force: true });
    }
  });

  it("falls back to the filename slug when no frontmatter is present", async () => {
    const file = await writeSample("neotoma-plan-cap-", "fallback.plan.md", "# Just a plan\n");
    try {
      const result = await captureHarnessPlan({ file_path: file, harness: "cli" });
      const plan = result.storePayload.entities[0] as Record<string, unknown>;
      expect(plan.title).toBe("fallback");
      expect(plan.harness).toBe("cli");
      expect(plan.body).toContain("Just a plan");
    } finally {
      await fs.rm(path.dirname(file), { recursive: true, force: true });
    }
  });
});
