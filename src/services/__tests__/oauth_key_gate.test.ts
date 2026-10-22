import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

function loadOauthKeyGateModule(cacheBust: string) {
  const moduleUrl = new URL("../oauth_key_gate.js", import.meta.url).href;
  return import(`${moduleUrl}?cacheBust=${cacheBust}`);
}

describe("oauth_key_gate", () => {
  it("validates credentials against configured key file", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "neotoma-oauth-key-gate-"));
    const keyPath = path.join(tempDir, "neotoma.key");
    const keyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    writeFileSync(keyPath, keyHex, "utf8");

    process.env.NEOTOMA_KEY_FILE_PATH = keyPath;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;

    const mod = await loadOauthKeyGateModule(String(Date.now()));
    const valid = mod.isOauthKeyCredentialValid({ privateKeyHex: keyHex });
    const invalid = mod.isOauthKeyCredentialValid({
      privateKeyHex: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("normalizes next path to oauth-only paths", async () => {
    const mod = await loadOauthKeyGateModule(String(Date.now() + 1));
    expect(mod.normalizeOauthNextPath("/mcp/oauth/authorize?x=1")).toBe("/mcp/oauth/authorize?x=1");
    expect(mod.normalizeOauthNextPath("https://evil.example")).toBe("/mcp/oauth/authorize");
    expect(mod.normalizeOauthNextPath("/api/admin")).toBe("/mcp/oauth/authorize");
  });

  it("accepts configured bearer token as OAuth preflight credential", async () => {
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
    process.env.NEOTOMA_BEARER_TOKEN = "test-shared-bearer";

    const mod = await loadOauthKeyGateModule(String(Date.now() + 3));
    const valid = mod.isOauthKeyCredentialValid({ bearerToken: "test-shared-bearer" });
    const invalid = mod.isOauthKeyCredentialValid({ bearerToken: "wrong-bearer" });

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
  });

  it("expires key-auth sessions", async () => {
    const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
    const store = new mod.OAuthKeySessionStore(10);
    const createdAt = Date.now();
    const token = store.create(createdAt);

    expect(store.isValid(token, createdAt + 5)).toBe(true);
    expect(store.isValid(token, createdAt + 11)).toBe(false);
  });

  // #2005 — sign-in sessions must not inherit the key-entry gate's short TTL,
  // and a bound user must never outlive the session it belongs to.
  describe("sign-in session TTL + user binding (#2005)", () => {
    it("honors a per-session TTL override longer than the store default", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10); // short gate default
      const createdAt = Date.now();
      const token = store.create(createdAt, 10_000); // sign-in override

      // Past the 10ms gate default, still valid on the override.
      expect(store.isValid(token, createdAt + 500)).toBe(true);
      expect(store.isValid(token, createdAt + 9_999)).toBe(true);
      expect(store.isValid(token, createdAt + 10_001)).toBe(false);
    });

    it("does not widen the default TTL for sessions that pass no override", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const gateToken = store.create(createdAt); // no override

      expect(store.isValid(gateToken, createdAt + 11)).toBe(false);
    });

    it("resolves a bound user while the session is live", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 10_000);

      expect(store.bindUser(token, "user-abc", createdAt)).toBe(true);
      expect(store.getBoundUser(token, createdAt + 5_000)).toBe("user-abc");
    });

    it("stops resolving the bound user once the session expires", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 1_000);
      store.bindUser(token, "user-abc", createdAt);

      expect(store.getBoundUser(token, createdAt + 500)).toBe("user-abc");
      // The binding must not survive its session — this is the unbounded-map
      // leak the old module-level Map had.
      expect(store.getBoundUser(token, createdAt + 1_001)).toBeUndefined();
    });

    it("refuses to bind a user to an expired or unknown session", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 1_000);

      expect(store.bindUser(token, "user-abc", createdAt + 2_000)).toBe(false);
      expect(store.getBoundUser(token, createdAt + 2_000)).toBeUndefined();
      expect(store.bindUser("never-issued", "user-abc", createdAt)).toBe(false);
    });

    it("evicts bound users during cleanup so the map cannot grow unbounded", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 1_000);
      store.bindUser(token, "user-abc", createdAt);

      store.cleanup(createdAt + 5_000);
      expect(store.getBoundUser(token, createdAt + 5_000)).toBeUndefined();
    });
  });

  /**
   * #2228 — a binding carries the graph scope AND who signed in. Before this,
   * only a bare user_id was bound, so under shared-graph mode the verified
   * Google email had nowhere to live and was simply dropped.
   */
  describe("identity binding alongside graph scope (#2228)", () => {
    it("returns graph scope and signed-in identity as distinct values", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 10));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 60_000);

      expect(
        store.bindUser(
          token,
          {
            graphUserId: "shared-graph-owner",
            authenticatedUserId: "per-email-teammate",
            authenticatedEmail: "teammate@example.com",
          },
          createdAt
        )
      ).toBe(true);

      // getBoundUser answers "which graph", not "who" — data scoping depends on
      // it continuing to mean the scope.
      expect(store.getBoundUser(token, createdAt + 1_000)).toBe("shared-graph-owner");

      const identity = store.getBoundIdentity(token, createdAt + 1_000);
      expect(identity).toEqual({
        graphUserId: "shared-graph-owner",
        authenticatedUserId: "per-email-teammate",
        authenticatedEmail: "teammate@example.com",
      });
    });

    it("still accepts a bare user_id as the graph scope", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 11));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 60_000);

      store.bindUser(token, "solo-user", createdAt);

      expect(store.getBoundUser(token, createdAt + 1_000)).toBe("solo-user");
      expect(store.getBoundIdentity(token, createdAt + 1_000)).toEqual({
        graphUserId: "solo-user",
      });
    });

    it("expires the identity with the session, not just the graph scope", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 12));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 1_000);
      store.bindUser(
        token,
        {
          graphUserId: "shared-graph-owner",
          authenticatedUserId: "per-email-teammate",
          authenticatedEmail: "teammate@example.com",
        },
        createdAt
      );

      expect(store.getBoundIdentity(token, createdAt + 500)).toBeDefined();
      // An expired session must not keep answering with a stale email.
      expect(store.getBoundIdentity(token, createdAt + 1_001)).toBeUndefined();
      expect(store.getBoundUser(token, createdAt + 1_001)).toBeUndefined();
    });

    it("does not let a caller mutate the stored binding through the returned object", async () => {
      const mod = await loadOauthKeyGateModule(String(Date.now() + 13));
      const store = new mod.OAuthKeySessionStore(10);
      const createdAt = Date.now();
      const token = store.create(createdAt, 60_000);
      store.bindUser(
        token,
        { graphUserId: "shared-graph-owner", authenticatedEmail: "teammate@example.com" },
        createdAt
      );

      const identity = store.getBoundIdentity(token, createdAt + 1_000)!;
      identity.graphUserId = "attacker-controlled";

      expect(store.getBoundUser(token, createdAt + 1_000)).toBe("shared-graph-owner");
    });
  });
});
