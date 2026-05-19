/**
 * Unit tests for the ENV_CONTAMINATION audit check.
 *
 * Tests cover:
 *   - classifyIndicator() — pattern matching against known indicators
 *   - scanSnapshotForContamination() — per-entity snapshot scan
 *   - Severity escalation (highest-severity hit wins)
 *   - Skip-field behaviour (structural metadata excluded)
 *   - Clean snapshots produce no findings
 *   - Non-string field values are stringified before matching
 */

import { describe, expect, it } from "vitest";
import {
  classifyIndicator,
  scanSnapshotForContamination,
  ENV_CONTAMINATION_INDICATORS,
} from "../../src/services/env_contamination_audit.js";

// ---------------------------------------------------------------------------
// classifyIndicator
// ---------------------------------------------------------------------------

describe("classifyIndicator", () => {
  it("returns null for a clean production URL", () => {
    expect(classifyIndicator("https://api.example.com/v1")).toBeNull();
    expect(classifyIndicator("postgres://db.us-east-1.rds.amazonaws.com:5432/prod")).toBeNull();
    expect(classifyIndicator("mark@example.com")).toBeNull();
    expect(classifyIndicator("Acme Corp")).toBeNull();
  });

  it("detects loopback IP (127.0.0.1)", () => {
    const m = classifyIndicator("http://127.0.0.1:3000/api");
    expect(m).not.toBeNull();
    expect(m!.label).toBe("loopback_ip");
    expect(m!.severity).toBe("high");
  });

  it("detects loopback IPv6 (::1)", () => {
    const m = classifyIndicator("[::1]:8080");
    expect(m).not.toBeNull();
    expect(m!.label).toBe("loopback_ipv6");
    expect(m!.severity).toBe("high");
  });

  it("detects localhost hostname (case-insensitive)", () => {
    expect(classifyIndicator("http://localhost:4000")?.label).toBe("localhost");
    expect(classifyIndicator("LOCALHOST")?.label).toBe("localhost");
  });

  it("detects .local mDNS suffix", () => {
    const m = classifyIndicator("myserver.local/api");
    expect(m!.label).toBe("dot_local");
    expect(m!.severity).toBe("medium");
  });

  it("does not flag 'local' as a standalone word without the dot prefix", () => {
    expect(classifyIndicator("local store name")).toBeNull();
  });

  it("detects dev. subdomain", () => {
    const m = classifyIndicator("https://dev.example.com");
    expect(m!.label).toBe("dev_subdomain");
    expect(m!.severity).toBe("medium");
  });

  it("detects staging. subdomain", () => {
    const m = classifyIndicator("https://staging.example.com/login");
    expect(m!.label).toBe("staging_subdomain");
    expect(m!.severity).toBe("medium");
  });

  it("detects test- prefix", () => {
    const m = classifyIndicator("test-org-123");
    expect(m!.label).toBe("test_prefix");
    expect(m!.severity).toBe("low");
  });

  it("detects -dev suffix", () => {
    const m = classifyIndicator("api-dev");
    expect(m!.label).toBe("dev_suffix");
    expect(m!.severity).toBe("low");
  });

  it("detects -staging suffix", () => {
    const m = classifyIndicator("api-staging");
    expect(m!.label).toBe("staging_suffix");
    expect(m!.severity).toBe("low");
  });

  it("detects nil UUID", () => {
    const m = classifyIndicator("00000000-0000-0000-0000-000000000000");
    expect(m!.label).toBe("nil_uuid");
    expect(m!.severity).toBe("medium");
  });

  it("detects test_user pattern", () => {
    const m = classifyIndicator("test_user_42");
    expect(m!.label).toBe("test_user_id");
    expect(m!.severity).toBe("medium");
  });

  it("detects Docker bridge IP range (172.16-31)", () => {
    const m = classifyIndicator("172.17.0.1");
    expect(m!.label).toBe("private_docker_ip");
    expect(m!.severity).toBe("low");
  });

  it("does not flag public IPs in the 172.x range outside Docker bridge range", () => {
    expect(classifyIndicator("172.15.0.1")).toBeNull();
    expect(classifyIndicator("172.32.0.1")).toBeNull();
  });

  it("detects Kubernetes cluster-internal DNS", () => {
    const m = classifyIndicator("http://my-service.default.svc.cluster.local");
    expect(m!.label).toBe("kube_svc_dns");
    expect(m!.severity).toBe("high");
  });

  it("truncates very long matched values to 200 chars + ellipsis", () => {
    const longValue = "localhost/" + "x".repeat(250);
    const m = classifyIndicator(longValue);
    expect(m).not.toBeNull();
    expect(m!.matched_value.length).toBeLessThanOrEqual(204); // 200 + "…"
    expect(m!.matched_value.endsWith("…")).toBe(true);
  });

  it("covers every exported indicator label (pattern registry completeness check)", () => {
    const testedLabels = new Set([
      "loopback_ip",
      "loopback_ipv6",
      "localhost",
      "dot_local",
      "dev_subdomain",
      "staging_subdomain",
      "test_prefix",
      "dev_suffix",
      "staging_suffix",
      "nil_uuid",
      "test_user_id",
      "private_docker_ip",
      "kube_svc_dns",
    ]);
    const exportedLabels = new Set(ENV_CONTAMINATION_INDICATORS.map((i) => i.label));
    for (const label of exportedLabels) {
      expect(testedLabels.has(label)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// scanSnapshotForContamination
// ---------------------------------------------------------------------------

describe("scanSnapshotForContamination", () => {
  const ENT_ID = "ent_abc123";
  const ENT_TYPE = "api_config";

  it("returns null when no fields match any indicator", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Production API", {
      api_url: "https://api.example.com",
      region: "us-east-1",
      name: "Production API",
    });
    expect(result).toBeNull();
  });

  it("returns a finding when a field matches", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Local API", {
      api_url: "http://localhost:8080/v1",
      name: "Local API",
    });
    expect(result).not.toBeNull();
    expect(result!.check_id).toBe("ENV_CONTAMINATION");
    expect(result!.entity_id).toBe(ENT_ID);
    expect(result!.entity_type).toBe(ENT_TYPE);
    expect(result!.hits).toHaveLength(1);
    expect(result!.hits[0].field).toBe("api_url");
    expect(result!.hits[0].match.label).toBe("localhost");
    expect(result!.severity).toBe("high");
    expect(result!.hint).toContain("`api_url`");
  });

  it("aggregates multiple field hits into a single finding", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Dev Config", {
      api_url: "http://127.0.0.1:8080",
      webhook_url: "https://staging.example.com/hook",
      name: "Dev Config",
    });
    expect(result!.hits.length).toBe(2);
    const fields = result!.hits.map((h) => h.field);
    expect(fields).toContain("api_url");
    expect(fields).toContain("webhook_url");
  });

  it("escalates severity to the highest match across fields", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Mixed", {
      api_url: "https://api-dev",   // low (-dev suffix)
      db_host: "127.0.0.1",        // high (loopback)
    });
    expect(result!.severity).toBe("high");
  });

  it("severity is medium when only medium indicators are present", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Mid", {
      api_url: "https://dev.example.com/api",
    });
    expect(result!.severity).toBe("medium");
  });

  it("severity is low when only low indicators are present", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Low", {
      name: "api-dev",
    });
    expect(result!.severity).toBe("low");
  });

  it("skips default skip-fields (entity_id, user_id, etc.)", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Safe", {
      entity_id: "127.0.0.1",    // skip — structural
      user_id: "test_user_999",  // skip — structural
      created_at: "localhost",    // skip — structural
      name: "Acme Corp",         // should not match -> no finding
    });
    expect(result).toBeNull();
  });

  it("respects a custom skip_fields set", () => {
    const customSkip = new Set(["internal_host"]);
    const result = scanSnapshotForContamination(
      ENT_ID,
      ENT_TYPE,
      "Custom",
      { internal_host: "localhost", name: "Safe Name" },
      customSkip,
    );
    expect(result).toBeNull();
  });

  it("stringifies non-string field values before matching", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Nested", {
      config: { api_url: "http://localhost:3000" },
    });
    expect(result).not.toBeNull();
    expect(result!.hits[0].field).toBe("config");
    expect(result!.hits[0].match.label).toBe("localhost");
  });

  it("skips null field values without throwing", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Null fields", {
      api_url: null as unknown as string,
      name: "Production",
    });
    expect(result).toBeNull();
  });

  it("uses entity_id as fallback label in hint when canonical_name is null", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, null, {
      host: "127.0.0.1",
    });
    expect(result!.hint).toContain(ENT_ID);
  });

  it("produces a hint that references the matched fields", () => {
    const result = scanSnapshotForContamination(ENT_ID, ENT_TYPE, "Contaminated", {
      base_url: "http://localhost:9000",
    });
    expect(result!.hint).toContain("`base_url`");
    expect(result!.hint).toContain("localhost");
  });
});
