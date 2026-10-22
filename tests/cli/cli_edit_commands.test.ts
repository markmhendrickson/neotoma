/**
 * Behavioral coverage for `neotoma edit <id>`.
 *
 * The interactive path (opening $EDITOR) is covered by the underlying
 * `applyBatchCorrection` unit tests; here we validate:
 *   - the command is registered and accepts <id>
 *   - `--editor` override is wired through
 *   - a no-op edit (editor exits without changing the buffer) produces
 *     `status: "no_changes"` without hitting the API
 */
import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { resolveBaseUrl } from "../../src/cli/config.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI edit command", () => {
  let testEntityId: string;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-edit-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "edit-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: "company",
            canonical_name: "Edit Test Company",
            properties: { name: "Edit Test Company" },
          },
        ],
      })
    );

    const { stdout } = await execAsync(`${CLI_PATH} store --file "${entityFile}" --json`);
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
    expect(testEntityId, "test entity should be created").toBeTruthy();
  });

  it("shows edit in top-level help", async () => {
    const { stdout } = await execAsync(`${CLI_PATH} --help`);
    expect(stdout).toMatch(/\bedit\b/);
  });

  it("returns no_changes when the editor exits without modifying the buffer", async () => {
    // `true` exits 0 without touching the file, so the buffer is unchanged
    // and `edit` should short-circuit to no_changes without contacting the
    // batch_correct endpoint.
    const { stdout } = await execAsync(`${CLI_PATH} edit "${testEntityId}" --editor true --json`);
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      success: true,
      status: "no_changes",
      entity_id: testEntityId,
    });
  });

  it("fails without an entity id argument", async () => {
    let exitCode = 0;
    try {
      await execAsync(`${CLI_PATH} edit --editor true --json`);
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { code?: number };
      exitCode = typeof e.code === "number" ? e.code : 1;
    }
    expect(exitCode).toBeGreaterThan(0);
  });

  it("corrections create resolves entity_type and exposes CAS success, conflict, retry, and replay", async () => {
    const { stdout: beforeOut } = await execAsync(
      `${CLI_PATH} entities get "${testEntityId}" --json`
    );
    const before = JSON.parse(beforeOut);
    const originalVersion = before.entity_version as string;
    expect(originalVersion).toMatch(/^[a-f0-9]{64}$/);

    const idempotencyKey = `cli-correct-replay-${Date.now()}`;
    const base = `${CLI_PATH} corrections create "${testEntityId}" --field-name name --corrected-value "CLI CAS Winner" --idempotency-key "${idempotencyKey}"`;
    const { stdout: firstOut } = await execAsync(
      `${base} --expected-version "${originalVersion}" --json`
    );
    const first = JSON.parse(firstOut);
    expect(first.status).toBe("applied");
    expect(first.entity_type).toBe("company");
    expect(first.entity_version).toMatch(/^[a-f0-9]{64}$/);

    const { stdout: replayOut } = await execAsync(
      `${base} --expected-version "stale-on-purpose" --json`
    );
    const replay = JSON.parse(replayOut);
    expect(replay.replayed).toBe(true);
    expect(replay.observation_id).toBe(first.observation_id);
    expect(replay.value).toBe("CLI CAS Winner");

    let conflictOut = "";
    try {
      await execAsync(
        `${CLI_PATH} corrections create "${testEntityId}" --field-name name --corrected-value "Must Not Land" --expected-version "${originalVersion}" --idempotency-key "cli-correct-stale-${Date.now()}" --json`
      );
    } catch (error) {
      conflictOut = (error as { stdout?: string }).stdout ?? "";
    }
    const conflict = JSON.parse(conflictOut);
    expect(conflict.status).toBe("conflict");
    expect(conflict.error_code).toBe("ERR_FIELD_VERSION_CONFLICT");
    expect(conflict.hint).toMatch(/retry/i);

    const { stdout: afterConflictOut } = await execAsync(
      `${CLI_PATH} entities get "${testEntityId}" --json`
    );
    const afterConflict = JSON.parse(afterConflictOut);
    expect(afterConflict.snapshot?.name).toBe("CLI CAS Winner");

    const { stdout: retryOut } = await execAsync(
      `${CLI_PATH} corrections create "${testEntityId}" --field-name name --corrected-value "CLI CAS Retry" --expected-version "${afterConflict.entity_version}" --idempotency-key "cli-correct-retry-${Date.now()}" --json`
    );
    expect(JSON.parse(retryOut).status).toBe("applied");

    let mismatchOut = "";
    try {
      await execAsync(
        `${CLI_PATH} corrections create "${testEntityId}" --field-name name --corrected-value "Different Payload" --idempotency-key "${idempotencyKey}" --json`
      );
    } catch (error) {
      mismatchOut = (error as { stdout?: string }).stdout ?? "";
    }
    expect(JSON.parse(mismatchOut).error_code).toBe("ERR_IDEMPOTENCY_MISMATCH");
  });

  // Waxwing ADR (ent_4b41bb83a4faf4428a73bfc8) planted test #7: the conflict
  // branch of applyBatchCorrection (stale expected_last_observation_at
  // without overwrite=true) had no dedicated coverage. `neotoma edit` is a
  // thin wrapper around POST /entities/:id/batch_correct; drive that
  // endpoint directly with a deliberately stale expected_last_observation_at
  // to assert the documented contract deterministically: nothing is written.
  //
  // Uses its OWN freshly created entity (not the shared testEntityId) with a
  // unique canonical_name so this test is immune to entity-resolution reuse
  // across repeated local runs against a persistent dev database.
  it("POST /entities/:id/batch_correct aborts with nothing written when expected_last_observation_at is stale and overwrite is not set", async () => {
    const conflictEntityFile = join(testDir, "conflict-entity.json");
    const uniqueName = `Conflict Test Company ${Date.now()}`;
    await writeFile(
      conflictEntityFile,
      JSON.stringify({
        entities: [
          { entity_type: "company", canonical_name: uniqueName, properties: { name: uniqueName } },
        ],
      })
    );
    const { stdout: seedStdout } = await execAsync(
      `${CLI_PATH} store --file "${conflictEntityFile}" --json`
    );
    const conflictEntityId = JSON.parse(seedStdout).entities?.[0]?.entity_id;
    expect(conflictEntityId, "conflict test entity should be created").toBeTruthy();

    const { stdout: entityJson } = await execAsync(
      `${CLI_PATH} entities get "${conflictEntityId}" --json`
    );
    const before = JSON.parse(entityJson);
    const staleTimestamp = before.last_observation_at;

    // Advance the entity so the snapshot's last_observation_at moves past
    // staleTimestamp.
    await execAsync(
      `${CLI_PATH} corrections create "${conflictEntityId}" --entity-type company --field-name name --corrected-value "Advanced Before Conflict" --json`
    );

    const baseUrl = await resolveBaseUrl(undefined, {});
    const res = await fetch(`${baseUrl}/entities/${conflictEntityId}/batch_correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        changes: [{ field: "name", value: "Should Not Land" }],
        expected_last_observation_at: staleTimestamp,
        overwrite: false,
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { status: string; conflict?: Record<string, unknown> };
    expect(body.status).toBe("conflict");
    expect(body.conflict?.conflicting_fields).toEqual(["name"]);

    // Confirm nothing was written by the stale (aborted) attempt: the
    // advancing correction's value is still current, not the aborted
    // "Should Not Land" value.
    const { stdout: afterJson } = await execAsync(
      `${CLI_PATH} entities get "${conflictEntityId}" --json`
    );
    const after = JSON.parse(afterJson);
    expect(after.snapshot?.name).toBe("Advanced Before Conflict");
    expect(after.snapshot?.name).not.toBe("Should Not Land");
  });
});
