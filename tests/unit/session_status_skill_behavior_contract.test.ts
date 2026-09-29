import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as yaml from "yaml";

const repoRoot = process.env.NEOTOMA_SKILL_ROOT ?? process.cwd();
const skillsRoot = join(repoRoot, "skills");
const migrationPath = join(repoRoot, "docs", "developer", "status_to_digest_migration.md");
const evalPath = join(repoRoot, "tests", "fixtures", "skill_eval", "session_status_behavior.json");

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
        triggers: Array.isArray(frontmatter.triggers) ? frontmatter.triggers.map(String) : [],
        supportedHarnesses: Array.isArray(frontmatter.supported_harnesses)
          ? frontmatter.supported_harnesses.map(String)
          : [],
        sideEffectClass: (frontmatter.side_effect_class ?? "state_changing") as SideEffectClass,
        userInvocable: frontmatter.user_invocable === true,
      };
    });
}

/** Routing key: case-, whitespace- and trailing-punctuation-insensitive. */
function triggerKey(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/, "")
    .trim();
}

function routesFor(prompt: string, skills: PublishedSkill[]): PublishedSkill[] {
  const normalized = triggerKey(prompt);
  return skills.filter((skill) =>
    skill.triggers.some((trigger) => {
      const normalizedTrigger = triggerKey(trigger);
      return (
        normalized === normalizedTrigger ||
        (normalizedTrigger.startsWith("/") && normalized.startsWith(`${normalizedTrigger} `))
      );
    })
  );
}

function unsafeTriggerCollisions(skills: PublishedSkill[]): Array<{
  trigger: string;
  owners: string[];
}> {
  const owners = new Map<string, PublishedSkill[]>();
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      const key = triggerKey(trigger);
      owners.set(key, [...(owners.get(key) ?? []), skill]);
    }
  }

  return [...owners.entries()]
    .filter(([, triggerOwners]) => new Set(triggerOwners.map((s) => s.sideEffectClass)).size > 1)
    .map(([trigger, triggerOwners]) => ({
      trigger,
      owners: triggerOwners.map((skill) => `${skill.name}:${skill.sideEffectClass}`).sort(),
    }));
}

describe("session status skills behavior contract", () => {
  const skills = loadPublishedSkills();
  const byName = new Map(skills.map((skill) => [skill.name, skill]));

  it("routes natural-language orientation only to the read-only where skill", () => {
    expect(routesFor("where are we", skills).map((skill) => skill.name)).toEqual(["where"]);
    expect(byName.get("where")?.sideEffectClass).toBe("read_only");
    expect(byName.get("digest")?.sideEffectClass).toBe("state_changing");
  });

  it("normalizes punctuation and whitespace variants when routing and detecting collisions", () => {
    expect(routesFor("Where  are we?", skills).map((skill) => skill.name)).toEqual(["where"]);
    const where = byName.get("where")!;
    const digest = byName.get("digest")!;
    const planted = [where, { ...digest, triggers: [...digest.triggers, "Where are  we?"] }];
    expect(unsafeTriggerCollisions(planted).map((c) => c.trigger)).toEqual(["where are we"]);
  });

  it("rejects repository-wide trigger collisions across side-effect classes", () => {
    expect(unsafeTriggerCollisions(skills)).toEqual([]);
  });

  it("detects a planted read-only/state-changing trigger collision", () => {
    const where = byName.get("where")!;
    const digest = byName.get("digest")!;
    const planted = [where, { ...digest, triggers: [...digest.triggers, "where are we"] }];

    expect(unsafeTriggerCollisions(planted)).toEqual([
      {
        trigger: "where are we",
        owners: ["digest:state_changing", "where:read_only"],
      },
    ]);
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
    expect(end).not.toMatch(
      /most recently modified|newest transcript|choose[^.]*modification time/i
    );
  });

  it("keeps digest master-plan-first and production-store semantics harness-neutral", () => {
    const digest = byName.get("digest")?.body ?? "";

    expect(digest).toMatch(/^## Master-plan-first reporting$/m);
    expect(digest).toContain("production Neotoma `store` capability");
    expect(digest).toContain("resolve its harness-specific tool name at runtime");
    expect(digest).not.toContain("mcp__mcpsrv_neotoma__store");
  });

  it("never tells where users that digest is read-only or limited to one bookkeeping write", () => {
    const where = byName.get("where")?.body ?? "";

    expect(where).not.toMatch(/`\/digest`[^|\n]*\bis read-only\b/);
    expect(where).not.toMatch(/single permitted write is bookkeeping/);
    expect(where).not.toMatch(/\|\s*one `session_digest`\s*\|/);
    expect(where).toContain("it is NOT read-only");
    expect(where).toContain(
      "Run `/digest --report-only` for a verified read-out, or `/digest` to verify and act on it."
    );
    expect(where).toContain("that is `/digest --report-only project`");
    expect(where).not.toMatch(/that is `\/digest project`/);
    expect(where).toMatch(/MUST NOT describe `\/digest` as read-only/);
  });

  it("runs digest verification in both modes, outside the default-only bookkeeping section", () => {
    const digest = byName.get("digest")?.body ?? "";
    const sectionOf = (heading: string): string => {
      const start = digest.indexOf(`\n## ${heading}\n`);
      expect(start, heading).toBeGreaterThanOrEqual(0);
      const next = digest.indexOf("\n## ", start + 4);
      return digest.slice(start, next === -1 ? undefined : next);
    };

    const verify = sectionOf("Verify every claim (both modes)");
    const defaultOnly = sectionOf("Session digest (default mode only)");

    for (const marker of [
      "### Check each claim live",
      "### Tag each verdict `mutability`",
      "### Report a verification scorecard",
      "### Missing tooling is a DISTINCT state",
    ]) {
      expect(verify, marker).toContain(marker);
      expect(defaultOnly, marker).not.toContain(marker);
    }
    expect(verify).toContain("runs identically in default mode and under `--report-only`");
    expect(verify).toContain("Under `--report-only`, a tooling gap is report content only.");
    expect(digest).toContain("`--report-only` MUST NOT skip verification");
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
      cases: Array<{
        id: string;
        prompt: string;
        expected_skill?: string;
        expected_actions?: string[];
        forbidden_actions?: string[];
        harnesses?: string[];
        expected_skills?: string[];
      }>;
    };
    expect(fixture.cases.map((scenario) => scenario.id).sort()).toEqual([
      "default_proactive_dispatch",
      "exact_lineage_fail_closed",
      "harness_parity",
      "natural_language_routing",
      "report_only_suppression",
    ]);

    const cases = new Map(fixture.cases.map((scenario) => [scenario.id, scenario]));
    const defaultDigest = cases.get("default_proactive_dispatch")!;
    expect(routesFor(defaultDigest.prompt, skills).map((skill) => skill.name)).toEqual([
      defaultDigest.expected_skill,
    ]);
    expect(defaultDigest.expected_actions).toEqual(
      expect.arrayContaining(["dispatch_agent_movable", "write_session_digest"])
    );
    expect(byName.get("digest")?.body).toContain("MUST act on every agent-movable recommendation");

    const reportOnly = cases.get("report_only_suppression")!;
    expect(routesFor(reportOnly.prompt, skills).map((skill) => skill.name)).toEqual([
      reportOnly.expected_skill,
    ]);
    expect(reportOnly.forbidden_actions).toEqual(
      expect.arrayContaining(["dispatch", "store", "state_changing_question"])
    );
    expect(reportOnly.expected_actions).toEqual(
      expect.arrayContaining(["verify_claims", "render_report", "report_verification_scorecard"])
    );
    expect(byName.get("digest")?.body).toContain("no action and no writes of any kind");

    const routing = cases.get("natural_language_routing")!;
    expect(routesFor(routing.prompt, skills).map((skill) => skill.name)).toEqual([
      routing.expected_skill,
    ]);
    expect(byName.get(routing.expected_skill!)?.sideEffectClass).toBe("read_only");

    const lineage = cases.get("exact_lineage_fail_closed")!;
    expect(lineage.harnesses?.sort()).toEqual(["claude-code", "codex", "cursor"]);
    expect(lineage.forbidden_actions).toEqual(
      expect.arrayContaining(["select_newest", "transcript_derived_write"])
    );
    expect(byName.get("end")?.body).toContain("keep all transcript-derived writes suppressed");

    const parity = cases.get("harness_parity")!;
    expect(parity.harnesses?.sort()).toEqual(["claude-code", "codex", "cursor"]);
    expect(parity.expected_skills?.sort()).toEqual(["digest", "end", "where"]);
    for (const name of parity.expected_skills ?? []) {
      expect(byName.get(name)?.supportedHarnesses.sort(), name).toEqual(parity.harnesses);
    }
  });
});
