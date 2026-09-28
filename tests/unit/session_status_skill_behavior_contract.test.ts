import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as yaml from "yaml";

const repoRoot = process.env.NEOTOMA_SKILL_ROOT ?? process.cwd();
const skillsRoot = join(repoRoot, "skills");
const migrationPath = join(repoRoot, "docs", "developer", "status_to_digest_migration.md");
const evalPath = join(
  repoRoot,
  "tests",
  "fixtures",
  "skill_eval",
  "session_status_behavior.json"
);

type SideEffectClass = "read_only" | "state_changing";

interface PublishedSkill {
  name: string;
  body: string;
  triggers: string[];
  supportedHarnesses: string[];
  sideEffectClass: SideEffectClass;
  userInvocable: boolean;
}

function loadPublishedSkills(): PublishedSkill[] {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsRoot, entry.name, "SKILL.md"))
    .filter((path) => existsSync(path))
    .map((path) => {
      const source = readFileSync(path, "utf8");
      const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      expect(match, path).not.toBeNull();
      const frontmatter = yaml.parse(match![1]) as Record<string, unknown>;
      return {
        name: String(frontmatter.name),
        body: match![2],
        triggers: Array.isArray(frontmatter.triggers)
          ? frontmatter.triggers.map(String)
          : [],
        supportedHarnesses: Array.isArray(frontmatter.supported_harnesses)
          ? frontmatter.supported_harnesses.map(String)
          : [],
        sideEffectClass: (frontmatter.side_effect_class ?? "state_changing") as SideEffectClass,
        userInvocable: frontmatter.user_invocable === true,
      };
    });
}

function routesFor(prompt: string, skills: PublishedSkill[]): PublishedSkill[] {
  const normalized = prompt.trim().toLowerCase();
  return skills.filter((skill) =>
    skill.triggers.some((trigger) => {
      const normalizedTrigger = trigger.trim().toLowerCase();
      return (
        normalized === normalizedTrigger ||
        (normalizedTrigger.startsWith("/") && normalized.startsWith(`${normalizedTrigger} `))
      );
    })
  );
}

describe("session status skills behavior contract", () => {
  const skills = loadPublishedSkills();
  const byName = new Map(skills.map((skill) => [skill.name, skill]));

  it("routes natural-language orientation only to the read-only where skill", () => {
    expect(routesFor("where are we", skills).map((skill) => skill.name)).toEqual(["where"]);
    expect(byName.get("where")?.sideEffectClass).toBe("read_only");
    expect(byName.get("digest")?.sideEffectClass).toBe("state_changing");
  });

  it("rejects repository-wide trigger collisions across side-effect classes", () => {
    const owners = new Map<string, PublishedSkill[]>();
    for (const skill of skills) {
      for (const trigger of skill.triggers) {
        const key = trigger.trim().toLowerCase();
        owners.set(key, [...(owners.get(key) ?? []), skill]);
      }
    }

    const unsafe = [...owners.entries()]
      .filter(([, triggerOwners]) => new Set(triggerOwners.map((s) => s.sideEffectClass)).size > 1)
      .map(([trigger, triggerOwners]) => ({
        trigger,
        owners: triggerOwners.map((skill) => `${skill.name}:${skill.sideEffectClass}`).sort(),
      }));

    expect(unsafe).toEqual([]);
  });

  it("makes the side-effect class explicit on every user-invocable skill", () => {
    for (const skill of skills.filter((candidate) => candidate.userInvocable)) {
      const source = readFileSync(join(skillsRoot, skill.name, "SKILL.md"), "utf8");
      expect(source, skill.name).toMatch(/^side_effect_class: (read_only|state_changing)$/m);
    }
  });

  it("keeps digest, where, and end available on every declared session harness", () => {
    for (const name of ["digest", "where", "end"]) {
      expect(byName.get(name)?.supportedHarnesses.sort(), name).toEqual([
        "claude-code",
        "codex",
        "cursor",
      ]);
    }
  });

  it("makes end bind exact session lineage and suppress transcript-derived writes on ambiguity", () => {
    const end = byName.get("end")?.body ?? "";

    expect(end).toContain("exact active session identity");
    expect(end).toContain("session_meta.payload.id");
    expect(end).toContain("transcript-derived writes");
    expect(end).toContain("suppressed");
    expect(end).not.toMatch(/most recently modified|newest transcript|choose[^.]*modification time/i);
  });

  it("keeps digest master-plan-first and production-store semantics harness-neutral", () => {
    const digest = byName.get("digest")?.body ?? "";

    expect(digest).toMatch(/^## Master-plan-first reporting$/m);
    expect(digest).toContain("production Neotoma `store` capability");
    expect(digest).toContain("resolve its harness-specific tool name at runtime");
    expect(digest).not.toContain("mcp__mcpsrv_neotoma__store");
  });

  it("documents the breaking status-to-digest migration and stale-link behavior", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("`/status` is removed");
    expect(migration).toContain("`/digest --report-only`");
    expect(migration).toContain("`/where`");
    expect(migration).toMatch(/stale.*skills\/status/i);
    expect(migration).toMatch(/breaking/i);
  });

  it("ships agent-facing scenarios for dispatch, suppression, routing, lineage, and parity", () => {
    expect(existsSync(evalPath)).toBe(true);
    const fixture = JSON.parse(readFileSync(evalPath, "utf8")) as {
      cases: Array<{ id: string }>;
    };
    expect(fixture.cases.map((scenario) => scenario.id).sort()).toEqual([
      "default_proactive_dispatch",
      "exact_lineage_fail_closed",
      "harness_parity",
      "natural_language_routing",
      "report_only_suppression",
    ]);
  });
});
