/**
 * Parity test for `neotoma store --entities` vs `neotoma store --file`.
 *
 * v0.5.0 verification (issue #2) reported that `store --file <path>` could
 * silently return `entities_created_count: 0` while the same payload via
 * `store --entities '<json>'` committed successfully. Both paths must:
 *
 *   - Commit equivalent entities for the same structured payload.
 *   - Surface `replayed: true` on a second call with the same
 *     `--idempotency-key` (and only then).
 *   - Trigger the CLI's defensive stderr guard when a commit-mode response
 *     reports `entities_created: 0` without `replayed: true`.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("CLI store --entities vs --file parity", () => {
  let scratchDir: string;

  beforeAll(async () => {
    scratchDir = path.join(tmpdir(), `neotoma-parity-${Date.now()}`);
    await mkdir(scratchDir, { recursive: true });
  });

  function buildEntities(marker: string) {
    return [
      {
        entity_type: "task",
        title: `Parity task ${marker}`,
        canonical_name: `parity-task-${marker}`,
      },
    ];
  }

  it("both paths create the same number of entities for the same payload", async () => {
    const markerA = `inline-${Date.now()}`;
    const entitiesA = buildEntities(markerA);

    const { stdout: stdoutInline } = await execAsync(
      `${CLI_PATH} store --entities '${JSON.stringify(entitiesA)}' --user-id "${TEST_USER_ID}" --json`
    );
    const inline = JSON.parse(stdoutInline);
    expect(inline.entities_created_count).toBeGreaterThan(0);

    const markerB = `file-${Date.now()}`;
    const entitiesB = buildEntities(markerB);
    const entitiesFile = path.join(scratchDir, `entities-${markerB}.json`);
    await writeFile(entitiesFile, JSON.stringify(entitiesB));

    const { stdout: stdoutFile } = await execAsync(
      `${CLI_PATH} store --file "${entitiesFile}" --user-id "${TEST_USER_ID}" --json`
    );
    const fileResult = JSON.parse(stdoutFile);
    expect(fileResult.entities_created_count).toBe(inline.entities_created_count);
  });

  it("second call with same --idempotency-key returns replayed: true on both paths", async () => {
    // Use distinct entities per path so the two paths don't collide on a
    // shared entity (which would surface an unrelated observation-id
    // uniqueness bug). Scope of this test is strictly the `replayed` flag.
    const inlineEntities = buildEntities(`idem-inline-${Date.now()}`);
    const fileEntities = buildEntities(`idem-file-${Date.now()}`);
    const fileKey = `parity-idem-file-${Date.now()}`;
    const inlineKey = `parity-idem-inline-${Date.now()}`;
    const entitiesFile = path.join(scratchDir, `idem-entities-${fileKey}.json`);
    await writeFile(entitiesFile, JSON.stringify(fileEntities));

    // Path A: --entities, called twice with same idempotency key.
    const { stdout: firstInline } = await execAsync(
      `${CLI_PATH} store --entities '${JSON.stringify(inlineEntities)}' --idempotency-key "${inlineKey}" --user-id "${TEST_USER_ID}" --json`
    );
    const firstInlineJson = JSON.parse(firstInline);
    expect(firstInlineJson.replayed).toBe(false);

    const { stdout: secondInline } = await execAsync(
      `${CLI_PATH} store --entities '${JSON.stringify(inlineEntities)}' --idempotency-key "${inlineKey}" --user-id "${TEST_USER_ID}" --json`
    );
    const secondInlineJson = JSON.parse(secondInline);
    expect(secondInlineJson.replayed).toBe(true);

    // Path B: --file, called twice with same idempotency key.
    const { stdout: firstFile } = await execAsync(
      `${CLI_PATH} store --file "${entitiesFile}" --idempotency-key "${fileKey}" --user-id "${TEST_USER_ID}" --json`
    );
    const firstFileJson = JSON.parse(firstFile);
    expect(firstFileJson.replayed).toBe(false);

    const { stdout: secondFile } = await execAsync(
      `${CLI_PATH} store --file "${entitiesFile}" --idempotency-key "${fileKey}" --user-id "${TEST_USER_ID}" --json`
    );
    const secondFileJson = JSON.parse(secondFile);
    expect(secondFileJson.replayed).toBe(true);
  });

  it("wires the commit-mode stderr guard on both store and store-structured", async () => {
    // The guard fires only when a live store returns entities_created=0
    // with replayed!=true. Contriving that condition in a black-box CLI
    // test without mocking is fragile, so instead we verify both command
    // handlers contain the guard text in the compiled bundle. This locks
    // in the behavior against accidental regression (guard removed).
    const { readFile } = await import("node:fs/promises");
    const compiled = await readFile(
      path.resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    const matches = compiled.match(
      /warning: store returned entities_created=0 without replayed=true/g
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
