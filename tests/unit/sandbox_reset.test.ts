import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSandbox } from "../../scripts/reset_sandbox";

// Build a stub fetch that records every request and returns a minimal
// happy-path response.
function makeStubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, init });
    return new Response(
      JSON.stringify({ ok: true, entities_created: 1, replayed: false }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("reset_sandbox", () => {
  let tmpRoot: string;
  let dataDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-sandbox-reset-"));
    dataDir = path.join(tmpRoot, "data");
    repoRoot = path.join(tmpRoot, "repo");
    await fs.mkdir(dataDir, { recursive: true });
    // Copy the real manifest + its inline fixtures into repoRoot so the
    // seeder can load them without touching the main repo during tests.
    const manifestSrc = path.resolve(__dirname, "../fixtures/sandbox/manifest.json");
    const manifestDest = path.join(repoRoot, "tests/fixtures/sandbox/manifest.json");
    await fs.mkdir(path.dirname(manifestDest), { recursive: true });
    // Minimal manifest with only inline fixtures so the test does not depend
    // on the full contact/transaction fixtures being in the test repo root.
    const testManifest = {
      schema_version: "1.0",
      description: "Test manifest",
      agent_identities: [
        {
          agent_sub: "test-agent-a@sandbox",
          client_name: "sandbox-test-a",
          client_version: "0.0.1",
          label: "Test A",
        },
      ],
      entity_batches: [
        {
          agent_index: 0,
          idempotency_prefix: "sandbox-test-conv",
          fixture: "inline://conversation_chatgpt",
          entity_type_override: "conversation",
        },
      ],
      unstructured_sources: [],
      excluded_fixtures: [],
    };
    await fs.writeFile(manifestDest, JSON.stringify(testManifest, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    vi.restoreAllMocks();
  });

  it("refuses to run without NEOTOMA_SANDBOX_MODE or --force", async () => {
    await expect(
      resetSandbox({
        dataDir,
        baseUrl: "http://localhost:9999",
        repoRoot,
        sandboxMode: undefined,
      }),
    ).rejects.toThrow(/NEOTOMA_SANDBOX_MODE/);
  });

  it("removes sqlite files + sources/ contents then re-seeds over HTTP", async () => {
    // Plant fake db + sources files to prove they get cleared.
    await fs.writeFile(path.join(dataDir, "neotoma.db"), "fake");
    await fs.writeFile(path.join(dataDir, "neotoma.db-wal"), "fake");
    await fs.writeFile(path.join(dataDir, "neotoma.db-shm"), "fake");
    const userSources = path.join(dataDir, "sources", "user-1");
    await fs.mkdir(userSources, { recursive: true });
    await fs.writeFile(path.join(userSources, "blob-a"), "payload-a");
    await fs.writeFile(path.join(userSources, "blob-b"), "payload-b");

    const { impl: stubFetch, calls } = makeStubFetch();

    const result = await resetSandbox({
      dataDir,
      baseUrl: "http://localhost:9999",
      sandboxMode: "1",
      repoRoot,
      fetchImpl: stubFetch,
      logger: () => {},
    });

    // Sqlite files removed.
    for (const f of ["neotoma.db", "neotoma.db-wal", "neotoma.db-shm"]) {
      await expect(fs.access(path.join(dataDir, f))).rejects.toThrow();
    }
    // sources/ itself recreated but empty.
    const sourcesEntries = await fs.readdir(path.join(dataDir, "sources"));
    expect(sourcesEntries).toEqual([]);

    // Files removed count includes the 3 sqlite + 2 blobs.
    expect(result.files_removed).toBe(5);
    // At least the 1 user-1 directory removed.
    expect(result.directories_removed).toBeGreaterThanOrEqual(1);

    // Seed performed exactly one /store call.
    const storeCalls = calls.filter((c) => c.url.endsWith("/store"));
    expect(storeCalls.length).toBe(1);
    const body = JSON.parse((storeCalls[0].init?.body as string) ?? "{}");
    expect(body.entities).toHaveLength(3); // conversation + 2 conversation_messages
    expect(body.entities[0].entity_type).toBe("conversation");
    expect(body.entities[1].entity_type).toBe("conversation_message");
    expect(body.idempotency_key).toMatch(/^sandbox-test-conv-/);

    // Agent identity surfaced via X-Client-Name header.
    const headers = storeCalls[0].init?.headers as Record<string, string>;
    expect(headers["x-client-name"]).toBe("sandbox-test-a");
    expect(headers["x-client-version"]).toBe("0.0.1");
  });

  it("is idempotent — second reset submits the same idempotency_key", async () => {
    await fs.writeFile(path.join(dataDir, "neotoma.db"), "fake");

    const firstFetch = makeStubFetch();
    await resetSandbox({
      dataDir,
      baseUrl: "http://localhost:9999",
      sandboxMode: "1",
      repoRoot,
      fetchImpl: firstFetch.impl,
      logger: () => {},
    });

    const secondFetch = makeStubFetch();
    await resetSandbox({
      dataDir,
      baseUrl: "http://localhost:9999",
      sandboxMode: "1",
      repoRoot,
      fetchImpl: secondFetch.impl,
      logger: () => {},
    });

    const firstBody = JSON.parse(
      (firstFetch.calls[0].init?.body as string) ?? "{}",
    );
    const secondBody = JSON.parse(
      (secondFetch.calls[0].init?.body as string) ?? "{}",
    );

    expect(firstBody.idempotency_key).toBe(secondBody.idempotency_key);
    expect(firstBody.entities).toEqual(secondBody.entities);
  });

  it("supports --dry-run without touching disk or HTTP", async () => {
    await fs.writeFile(path.join(dataDir, "neotoma.db"), "fake");
    const { impl: stubFetch, calls } = makeStubFetch();

    const result = await resetSandbox({
      dataDir,
      baseUrl: "http://localhost:9999",
      sandboxMode: "1",
      dryRun: true,
      repoRoot,
      fetchImpl: stubFetch,
      logger: () => {},
    });

    expect(result.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
    // DB file untouched.
    await expect(fs.access(path.join(dataDir, "neotoma.db"))).resolves.toBeUndefined();
  });
});
