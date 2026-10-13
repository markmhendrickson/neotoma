/**
 * CLI surface for #2241: `neotoma store` without `--observation-source`
 * stores observations as `unspecified` (not `llm_summary`) and prints the
 * OBSERVATION_SOURCE_OMITTED store warning; an explicit flag value is
 * persisted exactly as passed. Read-back uses the CLI's own
 * `observations list`, so the assertion is on what was persisted, not on
 * what the store call echoed.
 *
 * Runs the built CLI (`dist/cli/index.js`) against the shared test API server
 * started by vitest.global_setup.ts. Every store passes an explicit
 * `--idempotency-key`.
 */

import { afterAll, describe, expect, it } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";
const RUN = `obs2241cli-${Date.now()}`;
const ENTITY_TYPE = "test_obs_source_2241_cli_note";

type StoreOutput = {
  entities?: Array<{ entity_id: string }>;
  store_warnings?: Array<{ code: string; entity_id: string }>;
};

describe("CLI store: observation_source omission (#2241)", () => {
  afterAll(async () => {
    await cleanupEntityType(ENTITY_TYPE, LOCAL_DEV_USER_ID);
  });

  async function cliStore(label: string, extraFlags = ""): Promise<StoreOutput> {
    // Same call shape as the acceptance criterion: `store --entities '<json>'`.
    // The JSON never contains a single quote, so single-quoting is safe.
    const entities = JSON.stringify([
      { entity_type: ENTITY_TYPE, canonical_name: `${RUN} ${label}`, title: label },
    ]);
    const { stdout } = await execAsync(
      `${CLI_PATH} store --entities '${entities}' --idempotency-key "${RUN}-${label}" ${extraFlags} --json`
    );
    return JSON.parse(stdout) as StoreOutput;
  }

  async function cliObservationSources(entityId: string): Promise<Array<string | null>> {
    const { stdout } = await execAsync(
      `${CLI_PATH} observations list --entity-id "${entityId}" --json`
    );
    const parsed = JSON.parse(stdout) as {
      observations: Array<{ observation_source: string | null }>;
    };
    return parsed.observations.map((o) => o.observation_source);
  }

  it("no --observation-source → persisted unspecified and the warning is in the output", async () => {
    const out = await cliStore("omitted");
    const entityId = out.entities![0].entity_id;
    // The effect first: what was persisted (pre-#2241 this read llm_summary).
    expect(await cliObservationSources(entityId)).toEqual(["unspecified"]);
    const warnings = (out.store_warnings ?? []).filter(
      (w) => w.code === "OBSERVATION_SOURCE_OMITTED"
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].entity_id).toBe(entityId);
  });

  it.each(["llm_summary", "import"])(
    "--observation-source %s → persisted exactly, no omission warning",
    async (kind) => {
      const out = await cliStore(`explicit-${kind}`, `--observation-source ${kind}`);
      expect((out.store_warnings ?? []).some((w) => w.code === "OBSERVATION_SOURCE_OMITTED")).toBe(
        false
      );
      expect(await cliObservationSources(out.entities![0].entity_id)).toEqual([kind]);
    }
  );

  it("--observation-source unspecified is accepted and does not warn", async () => {
    const out = await cliStore("explicit-unspecified", "--observation-source unspecified");
    expect((out.store_warnings ?? []).some((w) => w.code === "OBSERVATION_SOURCE_OMITTED")).toBe(
      false
    );
    expect(await cliObservationSources(out.entities![0].entity_id)).toEqual(["unspecified"]);
  });
});
