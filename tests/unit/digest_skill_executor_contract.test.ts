import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveNeotomaPackageRoot } from "../../src/mcp_instruction_doc.js";
import { validateFieldsWithConverters } from "../../src/services/field_validation.js";
import type { FieldDefinition } from "../../src/services/schema_registry.js";

interface Executor {
  kind: string;
  name: string;
  status: string;
  ref?: string;
}

interface ExecutorCase {
  id: string;
  lookup: "verified" | "verified-empty" | "unreadable";
  task: string | null;
  tracking_defect?: string;
  executor: Executor;
}

function readDigestSkill(): string {
  const overridePath = process.env.NEOTOMA_DIGEST_SKILL_CONTRACT_PATH?.trim();
  return readFileSync(
    overridePath || join(resolveNeotomaPackageRoot(), "skills", "status", "SKILL.md"),
    "utf8"
  );
}

function readExecutorFixture(skill: string): ExecutorCase[] {
  const match = skill.match(/```json digest-executor-fixture\n([\s\S]*?)\n```/);
  if (!match) throw new Error("digest executor behavior fixture is missing");
  return JSON.parse(match[1]) as ExecutorCase[];
}

function renderFixtureCase(entry: ExecutorCase) {
  return {
    workboard: {
      executor:
        entry.executor.kind === "unassigned" || entry.executor.kind === "unknown"
          ? entry.executor.kind
          : `${entry.executor.kind}: ${entry.executor.name}`,
      status: entry.executor.status,
      task: entry.task ?? "task: missing",
      trackingDefect: entry.tracking_defect ?? null,
    },
    persistedExecutor: { ...entry.executor },
  };
}

describe("digest skill executor visibility behavior", () => {
  const skill = readDigestSkill();
  const cases = readExecutorFixture(skill);

  it("renders a verified peer session and persists the same executor", () => {
    const peer = cases.find((entry) => entry.id === "peer-session");
    expect(peer).toBeDefined();

    const rendered = renderFixtureCase(peer!);
    expect(rendered.workboard).toMatchObject({
      executor: "peer_session: review-task",
      status: "in progress",
      task: "ent_review",
    });
    expect(rendered.persistedExecutor).toEqual(peer!.executor);
    expect(rendered.persistedExecutor.kind).toBe("peer_session");
  });

  it("keeps live work visible when its durable task binding is missing", () => {
    const missingTask = cases.find((entry) => entry.id === "missing-task");
    expect(missingTask).toBeDefined();

    const rendered = renderFixtureCase(missingTask!);
    expect(rendered.workboard).toEqual({
      executor: "background_task: export-42",
      status: "running",
      task: "task: missing",
      trackingDefect: "task: missing",
    });
    expect(rendered.persistedExecutor).toEqual(missingTask!.executor);
  });

  it("distinguishes verified-empty from unreadable live state", () => {
    const unassigned = cases.find((entry) => entry.lookup === "verified-empty");
    const unreadable = cases.find((entry) => entry.lookup === "unreadable");
    expect(unassigned).toBeDefined();
    expect(unreadable).toBeDefined();

    expect(renderFixtureCase(unassigned!).workboard).toMatchObject({
      executor: "unassigned",
      status: "queued",
    });
    expect(renderFixtureCase(unreadable!).workboard).toMatchObject({
      executor: "unknown",
      status: "live state unreadable",
    });
    expect(unassigned!.executor).not.toEqual(unreadable!.executor);
  });

  it("documents the complete nested executor and schema contract", () => {
    expect(skill).toContain("The active `session_digest` schema is **v1.4.0**");
    expect(skill).toContain('Write `schema_version: "1.4.0"`');
    expect(skill).toContain("idempotency key `session-digest-<root-session-id>`");
    expect(skill).toContain("verification_note, verified_at, mutability, executor");
    expect(skill).toContain(
      "`root_session | subagent | background_task | automation | peer_session | operator | external_party | unassigned | unknown`"
    );
    expect(skill).toContain("Do not add separate top-level executor fields to `session_digest`.");
  });

  it("preserves the nested executor through the declared tasks_claimed array", () => {
    const peer = cases.find((entry) => entry.id === "peer-session")!;
    const tasksClaimed = [
      {
        claim: "Peer-owned review",
        status_claimed: "outstanding",
        evidence_pointers: ["thread-review"],
        verification_state: "confirmed",
        verification_note: "live peer session read",
        verified_at: "2026-09-21T15:00:00Z",
        mutability: "perishable",
        executor: peer.executor,
      },
    ];
    const fields: Record<string, FieldDefinition> = {
      tasks_claimed: { type: "array", required: false },
    };

    const result = validateFieldsWithConverters({ tasks_claimed: tasksClaimed }, fields);

    expect(result.unknownFields).toEqual({});
    expect(result.validFields.tasks_claimed).toEqual(tasksClaimed);
  });
});
