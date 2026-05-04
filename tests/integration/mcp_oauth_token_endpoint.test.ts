import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let currentTempDir: string | null = null;
let importCounter = 0;

async function loadLocalModules(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const oauthUrl = new URL("../../src/services/mcp_oauth.js", import.meta.url).href;
  const localAuthUrl = new URL("../../src/services/local_auth.js", import.meta.url).href;
  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const cacheBust = `cacheBust=${Date.now()}-${importCounter++}`;
  const oauth = await import(`${oauthUrl}?${cacheBust}`);
  const localAuth = await import(`${localAuthUrl}?${cacheBust}`);
  const actions = await import(`${actionsUrl}?${cacheBust}`);
  return { oauth, localAuth, app: actions.app };
}

describe("MCP OAuth token endpoint", () => {
  afterEach(() => {
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("accepts refresh_token grant for local OAuth sessions", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-token-endpoint-${Date.now()}`);
    const { oauth, localAuth, app } = await loadLocalModules(currentTempDir);
    localAuth.createLocalAuthUser("token-endpoint@example.com", "password123");
    const user = localAuth.getLocalAuthUserByEmail("token-endpoint@example.com");
    if (!user) {
      throw new Error("Local auth user not found in test");
    }

    const connectionId = "cursor-local-token-endpoint";
    const request = await oauth.createLocalAuthorizationRequest({
      connectionId,
      redirectUri: "cursor://oauth",
      clientState: "client-state",
      codeChallenge: "test-challenge",
    });
    await oauth.completeLocalAuthorization(request.state, user.id);
    const firstToken = await oauth.getTokenResponseForConnection(connectionId);
    if (!firstToken.refresh_token) {
      throw new Error("Expected local OAuth flow to return a refresh token");
    }

    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("Expected HTTP server to bind to an ephemeral port");
      }
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: firstToken.refresh_token,
      });
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.access_token).toMatch(/^local_access_/);
      expect(json.access_token).not.toBe(firstToken.access_token);
      expect(json.refresh_token).toBe(firstToken.refresh_token);
      expect(json.expires_in).toBeGreaterThan(3_000);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()));
      });
    }
  });
});
