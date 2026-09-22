import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { listNeotomaServerProcesses } from "../../src/cli/api_server_process_probe.js";
import {
  classifyProcessProbeError,
  DEFAULT_PROCESS_PROBE_TIMEOUT_MS,
  execProcessProbeSync,
  isProcessProbeTimeoutError,
  isProcessProbeUnavailableError,
  mergeProcessProbeStatus,
  resolveProcessProbeTimeoutMs,
} from "../../src/cli/process_probe.js";

function parseCliReferenceJsonExample(command: string): unknown {
  const markdown = readFileSync(
    new URL("../../docs/developer/cli_reference.md", import.meta.url),
    "utf-8"
  );
  const commandBlock = `\`\`\`bash\n${command}\n\`\`\``;
  const commandIndex = markdown.indexOf(commandBlock);
  expect(commandIndex).toBeGreaterThanOrEqual(0);
  const jsonFenceStart = markdown.indexOf("```json\n", commandIndex + commandBlock.length);
  expect(jsonFenceStart).toBeGreaterThanOrEqual(0);
  const payloadStart = jsonFenceStart + "```json\n".length;
  const payloadEnd = markdown.indexOf("\n```", payloadStart);
  expect(payloadEnd).toBeGreaterThan(payloadStart);
  return JSON.parse(markdown.slice(payloadStart, payloadEnd));
}

function resolveKillPortTimeouts(cases: Array<Record<string, string>>): number[] {
  const moduleUrl = new URL("../../scripts/kill_port.js", import.meta.url).href;
  const source = [
    `import { resolveProcessProbeTimeoutMs } from ${JSON.stringify(moduleUrl)};`,
    `const cases = ${JSON.stringify(cases)};`,
    "process.stdout.write(JSON.stringify(cases.map(resolveProcessProbeTimeoutMs)));",
  ].join("\n");
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output) as number[];
}

describe("process_probe", () => {
  const previousTimeout = process.env.NEOTOMA_PROCESS_PROBE_TIMEOUT_MS;

  afterEach(() => {
    if (previousTimeout === undefined) delete process.env.NEOTOMA_PROCESS_PROBE_TIMEOUT_MS;
    else process.env.NEOTOMA_PROCESS_PROBE_TIMEOUT_MS = previousTimeout;
  });

  it("resolveProcessProbeTimeoutMs uses default and parses override", () => {
    expect(resolveProcessProbeTimeoutMs({})).toBe(DEFAULT_PROCESS_PROBE_TIMEOUT_MS);
    expect(resolveProcessProbeTimeoutMs({ NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "2500" })).toBe(2500);
    expect(resolveProcessProbeTimeoutMs({ NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "0" })).toBe(
      DEFAULT_PROCESS_PROBE_TIMEOUT_MS
    );
    expect(resolveProcessProbeTimeoutMs({ NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "nope" })).toBe(
      DEFAULT_PROCESS_PROBE_TIMEOUT_MS
    );
  });

  it("kill_port.js uses the same positive-integer timeout contract", () => {
    const cases = [
      {},
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "" },
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "2500" },
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "0" },
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "-5" },
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "1.5" },
      { NEOTOMA_PROCESS_PROBE_TIMEOUT_MS: "nope" },
    ];
    const expected = cases.map(resolveProcessProbeTimeoutMs);
    expect(resolveKillPortTimeouts(cases)).toEqual(expected);
    expect(expected).toEqual([5000, 5000, 2500, 5000, 5000, 5000, 5000]);
  });

  it("documents complete parseable dry-run and timed-out JSON responses", () => {
    expect(
      parseCliReferenceJsonExample("NEOTOMA_API_STOP_DRY_RUN=1 neotoma api stop --env dev --json")
    ).toEqual({
      env: "dev",
      port: 3080,
      stop_ran: false,
      dry_run: true,
      message:
        "[COPY: dry-run] NEOTOMA_API_STOP_DRY_RUN=1 — skipped stopping port 3080 (no processes killed).",
    });
    expect(parseCliReferenceJsonExample("neotoma api processes --json")).toEqual({
      processes: [],
      ports_checked: [3080, 3180],
      probe_status: "timed_out",
      warnings: [
        {
          code: "process_probe_timed_out",
          ports: [3080, 3180],
          timeout_ms: 5000,
        },
      ],
    });
  });

  it("classifyProcessProbeError distinguishes timeout, empty, unavailable", () => {
    expect(classifyProcessProbeError({ code: "ETIMEDOUT", killed: true })).toBe("timed_out");
    expect(classifyProcessProbeError({ status: 1 })).toBe("empty");
    expect(classifyProcessProbeError({ code: 1 })).toBe("empty");
    expect(classifyProcessProbeError({ code: "ENOENT" })).toBe("unavailable");
    expect(classifyProcessProbeError({ status: 2 })).toBe("other");
    expect(isProcessProbeTimeoutError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isProcessProbeUnavailableError({ code: "ENOENT" })).toBe(true);
  });

  it("mergeProcessProbeStatus prefers timed_out over unavailable", () => {
    expect(mergeProcessProbeStatus("ok", "empty")).toBe("ok");
    expect(mergeProcessProbeStatus("ok", "unavailable")).toBe("unavailable");
    expect(mergeProcessProbeStatus("unavailable", "timed_out")).toBe("timed_out");
    expect(mergeProcessProbeStatus("timed_out", "unavailable")).toBe("timed_out");
  });

  it("hang-bound effect: short timeout yields ETIMEDOUT well under wall-clock sleep", () => {
    const started = Date.now();
    let caught: unknown;
    try {
      execProcessProbeSync("sleep 5", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 100,
      });
    } catch (err) {
      caught = err;
    }
    const elapsedMs = Date.now() - started;
    expect(caught).toBeDefined();
    expect(isProcessProbeTimeoutError(caught)).toBe(true);
    expect(classifyProcessProbeError(caught)).toBe("timed_out");
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("hang-bound effect also holds for raw execSync with explicit timeout", () => {
    const started = Date.now();
    let caught: unknown;
    try {
      execSync("sleep 5", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 100 });
    } catch (err) {
      caught = err;
    }
    expect(isProcessProbeTimeoutError(caught)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("listNeotomaServerProcesses surfaces probe_status timed_out when exec times out", () => {
    const timeoutErr = Object.assign(new Error("timeout"), {
      code: "ETIMEDOUT",
      killed: true,
    });
    const result = listNeotomaServerProcesses({
      platform: "darwin",
      ports: [3080],
      execSync: () => {
        throw timeoutErr;
      },
    });
    expect(result.processes).toEqual([]);
    expect(result.probe_status).toBe("timed_out");
    expect(result.warnings?.[0]?.code).toBe("process_probe_timed_out");
  });

  it("listNeotomaServerProcesses treats exit status 1 as ok empty", () => {
    const emptyErr = Object.assign(new Error("no match"), { status: 1 });
    const result = listNeotomaServerProcesses({
      platform: "darwin",
      ports: [3080],
      execSync: () => {
        throw emptyErr;
      },
    });
    expect(result.processes).toEqual([]);
    expect(result.probe_status).toBe("ok");
    expect(result.warnings).toBeUndefined();
  });
});
