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

  it("expires key-auth sessions", async () => {
    const mod = await loadOauthKeyGateModule(String(Date.now() + 2));
    const store = new mod.OAuthKeySessionStore(10);
    const createdAt = Date.now();
    const token = store.create(createdAt);

    expect(store.isValid(token, createdAt + 5)).toBe(true);
    expect(store.isValid(token, createdAt + 11)).toBe(false);
  });
});
