import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyGithubSignature, mapEventToStore } from "../../src/services/github_webhook.js";

describe("verifyGithubSignature", () => {
  const secret = "test-webhook-secret";

  function sign(body: string): string {
    const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return `sha256=${hmac}`;
  }

  it("returns true for a valid signature", () => {
    const body = Buffer.from('{"action":"opened"}');
    const sig = sign(body.toString());
    expect(verifyGithubSignature(body, sig, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = Buffer.from('{"action":"opened"}');
    expect(verifyGithubSignature(body, "sha256=deadbeef00000000000000000000000000000000000000000000000000000000", secret)).toBe(false);
  });

  it("returns false for a tampered body with stale signature", () => {
    const originalBody = '{"action":"opened"}';
    const sig = sign(originalBody);
    const tamperedBody = Buffer.from('{"action":"closed"}');
    expect(verifyGithubSignature(tamperedBody, sig, secret)).toBe(false);
  });

  it("returns false when secret is empty", () => {
    const body = Buffer.from("test");
    expect(verifyGithubSignature(body, "sha256=abc", "")).toBe(false);
  });

  it("returns false when signature header is empty", () => {
    const body = Buffer.from("test");
    expect(verifyGithubSignature(body, "", secret)).toBe(false);
  });

  it("returns false for non-sha256 prefix", () => {
    const body = Buffer.from("test");
    expect(verifyGithubSignature(body, "sha1=abc", secret)).toBe(false);
  });
});

describe("mapEventToStore", () => {
  const deliveryId = "delivery-uuid-1234";

  it("maps an issues opened event to a store payload", () => {
    const payload = {
      action: "opened",
      issue: {
        number: 42,
        title: "Test issue",
        body: "Issue body",
        state: "open",
        labels: [{ name: "bug" }],
        html_url: "https://github.com/owner/repo/issues/42",
        user: { login: "octocat", id: 1, type: "User" },
        created_at: "2026-01-01T00:00:00Z",
        closed_at: null,
      },
      repository: { full_name: "owner/repo" },
    };

    const result = mapEventToStore("issues", payload, deliveryId);
    expect(result).not.toBeNull();
    expect(result!.external_actor.login).toBe("octocat");
    expect(result!.external_actor.verified_via).toBe("webhook_signature");
    expect(result!.external_actor.delivery_id).toBe(deliveryId);
    expect(result!.external_actor.event_type).toBe("issues");
    expect(result!.observation_source).toBe("sensor");
    expect(result!.entities).toHaveLength(3);
    expect(result!.entities[0]).toMatchObject({
      entity_type: "issue",
      github_number: 42,
      title: "Test issue",
    });
  });

  it("maps an issue_comment created event", () => {
    const payload = {
      action: "created",
      comment: {
        id: 999,
        body: "Hello world",
        user: { login: "commenter", id: 2, type: "User" },
        created_at: "2026-01-02T00:00:00Z",
      },
      issue: {
        number: 42,
        title: "Test issue",
      },
      repository: { full_name: "owner/repo" },
    };

    const result = mapEventToStore("issue_comment", payload, deliveryId);
    expect(result).not.toBeNull();
    expect(result!.external_actor.login).toBe("commenter");
    expect(result!.external_actor.comment_id).toBe(999);
    expect(result!.external_actor.verified_via).toBe("webhook_signature");
    expect(result!.entities).toHaveLength(2);
  });

  it("returns null for unsupported event types", () => {
    expect(mapEventToStore("push", {}, deliveryId)).toBeNull();
    expect(mapEventToStore("pull_request", {}, deliveryId)).toBeNull();
  });

  it("returns null for unsupported issue actions", () => {
    const payload = {
      action: "deleted",
      issue: { number: 1, title: "T", body: "", state: "open", labels: [], html_url: "", user: null, created_at: "", closed_at: null },
      repository: { full_name: "o/r" },
    };
    expect(mapEventToStore("issues", payload, deliveryId)).toBeNull();
  });
});
