/**
 * Integration test for the sandbox abuse-report pipeline.
 *
 * Covers the full roundtrip of `LocalSandboxReportTransport`:
 *   - submit redacts PII from description + reporter_contact
 *   - access_token can be exchanged for status
 *   - unknown tokens fail cleanly
 *   - `resolveSandboxReportTransport` picks `HttpSandboxReportTransport`
 *     when a forward URL + bearer are configured, and successfully
 *     forwards + fetches status against a mock HTTP transport.
 */

import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  HttpSandboxReportTransport,
  LocalSandboxReportTransport,
  resolveSandboxReportTransport,
} from "../../src/services/sandbox/transport.js";
import { resolveSandboxReportTransportKind } from "../../src/services/sandbox/types.js";

describe("LocalSandboxReportTransport", () => {
  let tmpDir: string;
  let storePath: string;
  let transport: LocalSandboxReportTransport;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "sandbox-report-"));
    storePath = path.join(tmpDir, "sandbox_reports", "records.json");
    transport = new LocalSandboxReportTransport(storePath);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("submits + returns redacted description and valid access_token", async () => {
    const res = await transport.submit(
      {
        reason: "abuse",
        description:
          "Please remove user alice@example.com data, their API key sk-abc1234567890123456789 is leaked.",
        reporter_contact: "reporter@example.org",
      },
      "203.0.113.5",
    );

    expect(res.report_id).toMatch(/^sbx_/);
    expect(res.access_token).toBeTruthy();
    expect(res.status).toBe("received");
    expect(res.submitted_at).toBeTruthy();
    expect(res.next_check_suggested_at).toBeTruthy();
    expect(res.redaction_preview?.applied).toBe(true);
    expect(res.redaction_preview?.redacted_description).not.toContain(
      "alice@example.com",
    );
    expect(res.redaction_preview?.redacted_description).not.toContain(
      "sk-abc1234567890123456789",
    );
  });

  it("exchanges access_token for a status response with same report_id", async () => {
    const submitted = await transport.submit(
      {
        reason: "spam",
        description: "This demo user keeps spamming the same conversation.",
      },
      "203.0.113.6",
    );
    const status = await transport.status(submitted.access_token);
    expect(status.report_id).toBe(submitted.report_id);
    expect(status.status).toBe("received");
    expect(status.resolution_notes).toBeNull();
    expect(status.status_updated_at).toBeTruthy();
    expect(status.next_check_suggested_at).toBeTruthy();
  });

  it("rejects unknown access tokens", async () => {
    await expect(transport.status("definitely-not-a-real-token")).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects empty description", async () => {
    await expect(
      transport.submit(
        { reason: "bug", description: "   " },
        "203.0.113.7",
      ),
    ).rejects.toThrow(/description/i);
  });
});

describe("resolveSandboxReportTransport selection", () => {
  const originalUrl = process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL;
  const originalBearer = process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER;
  const originalKind = process.env.NEOTOMA_SANDBOX_REPORT_TRANSPORT;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL;
    else process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL = originalUrl;
    if (originalBearer === undefined) delete process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER;
    else process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER = originalBearer;
    if (originalKind === undefined) delete process.env.NEOTOMA_SANDBOX_REPORT_TRANSPORT;
    else process.env.NEOTOMA_SANDBOX_REPORT_TRANSPORT = originalKind;
  });

  it("defaults to local when no forward URL is set", () => {
    delete process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL;
    delete process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER;
    delete process.env.NEOTOMA_SANDBOX_REPORT_TRANSPORT;
    expect(resolveSandboxReportTransportKind()).toBe("local");
    const transport = resolveSandboxReportTransport();
    expect(transport).toBeInstanceOf(LocalSandboxReportTransport);
  });

  it("picks http when forward URL + bearer are set", () => {
    process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL = "https://example.test/sandbox/report/submit";
    process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER = "shared-bearer";
    delete process.env.NEOTOMA_SANDBOX_REPORT_TRANSPORT;
    expect(resolveSandboxReportTransportKind()).toBe("http");
    const transport = resolveSandboxReportTransport();
    expect(transport).toBeInstanceOf(HttpSandboxReportTransport);
  });
});

describe("HttpSandboxReportTransport roundtrip (against mock receiver)", () => {
  const app = express();
  app.use(express.json());

  const SUBMITTED = new Map<
    string,
    { report_id: string; status: string; submitted_at: string; status_updated_at: string }
  >();

  app.post("/sandbox/report/submit", (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== "Bearer mock-shared") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const ipHash = req.headers["x-sandbox-submitter-ip-hash"];
    if (!ipHash) {
      res.status(400).json({ error: "ip_hash_required" });
      return;
    }
    const id = `sbx_mock_${SUBMITTED.size + 1}`;
    const token = `tok_${SUBMITTED.size + 1}`;
    const now = new Date().toISOString();
    SUBMITTED.set(token, {
      report_id: id,
      status: "received",
      submitted_at: now,
      status_updated_at: now,
    });
    res.json({
      report_id: id,
      access_token: token,
      status: "received",
      submitted_at: now,
      next_check_suggested_at: null,
    });
  });

  app.get("/sandbox/report/status", (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== "Bearer mock-shared") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const token = (req.query.access_token as string) ?? "";
    const record = SUBMITTED.get(token);
    if (!record) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      report_id: record.report_id,
      status: record.status,
      submitted_at: record.submitted_at,
      status_updated_at: record.status_updated_at,
      resolution_notes: null,
      next_check_suggested_at: null,
    });
  });

  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("forwards submission with bearer + hashed ip header", async () => {
    const transport = new HttpSandboxReportTransport(
      `${baseUrl}/sandbox/report/submit`,
      "mock-shared",
    );
    const submit = await transport.submit(
      { reason: "other", description: "sandbox demo report" },
      "198.51.100.42",
    );
    expect(submit.report_id).toBe("sbx_mock_1");
    expect(submit.access_token).toBe("tok_1");

    const status = await transport.status("tok_1");
    expect(status.report_id).toBe("sbx_mock_1");
    expect(status.status).toBe("received");
  });

  it("rejects on bad bearer", async () => {
    const transport = new HttpSandboxReportTransport(
      `${baseUrl}/sandbox/report/submit`,
      "wrong-bearer",
    );
    await expect(
      transport.submit(
        { reason: "other", description: "should fail" },
        "198.51.100.43",
      ),
    ).rejects.toThrow(/forward failed.*401/i);
  });
});
