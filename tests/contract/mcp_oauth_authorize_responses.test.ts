/**
 * Contract coverage for `GET /mcp/oauth/authorize` (operationId
 * `mcpOAuthAuthorize`).
 *
 * Why this file exists: until the change that added it, `openapi.yaml` declared
 * a single `302` for this operation while the handler in `src/actions.ts` also
 * emitted five distinct `400`s and a `500`. Every one of those refusals was an
 * observable response with no declaration behind it, so contract tests and
 * clients were blind to the entire refusal surface — including the one whose
 * body #2383 changed.
 *
 * `docs/architecture/openapi_contract_flow.md` puts handlers downstream of the
 * spec: "When handlers and spec disagree, the contract tests fail and the spec
 * wins". That only has teeth if some test actually compares the two. This is
 * that test for this endpoint: it drives the REAL handler over HTTP for each
 * documented refusal and asserts the status it returns is declared, with the
 * media type the spec says it uses.
 *
 * The `400` is deliberately `text/plain` rather than the canonical
 * `ErrorEnvelope`. This endpoint is reached by a BROWSER mid-OAuth-redirect, so
 * the body renders in the address bar for a human; a JSON envelope shown raw
 * there is strictly worse for the person who has to act on it. That choice is
 * declared in the spec, and asserted here, rather than left implicit.
 */

import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { readFileSync } from "node:fs";

import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";

import type { Server } from "node:http";

/** A public (non-loopback) client IP, so `isLocalRequest` returns false. */
const TUNNEL_CLIENT_IP = "203.0.113.7";

const VALID_PKCE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

type DeclaredResponses = Record<string, { content?: Record<string, unknown> }>;

let declared: DeclaredResponses;
let currentTempDir: string | null = null;
let importCounter = 0;

beforeAll(() => {
  const spec = load(readFileSync(resolveOpenApiPath(), "utf8")) as {
    paths: Record<string, Record<string, { operationId?: string; responses?: DeclaredResponses }>>;
  };
  const operation = spec.paths["/mcp/oauth/authorize"]?.get;
  expect(operation?.operationId).toBe("mcpOAuthAuthorize");
  declared = operation?.responses ?? {};
});

async function loadApp(tempDir: string): Promise<{ listen: (port: number) => Server }> {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  // Otherwise authorize redirects to the key-auth gate before it evaluates any
  // of the refusal branches below.
  process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH = "false";
  delete process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS;

  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const actions = await import(`${actionsUrl}?cacheBust=${Date.now()}-${importCounter++}`);

  const { config } = await import(new URL("../../src/config.js", import.meta.url).href);
  config.oauthTrustedCallbackUrls.length = 0;

  return actions.app;
}

/** Issue an authorize request as if it arrived over a tunnel. */
async function authorize(
  app: { listen: (port: number) => Server },
  query: Record<string, string>
): Promise<{ status: number; contentType: string; body: string }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address !== "object") {
      throw new Error("Expected HTTP server to bind to an ephemeral port");
    }
    const response = await fetch(
      `http://127.0.0.1:${address.port}/mcp/oauth/authorize?${new URLSearchParams(query)}`,
      {
        redirect: "manual",
        headers: {
          "x-forwarded-for": TUNNEL_CLIENT_IP,
          "x-forwarded-host": "instance.example.com",
        },
      }
    );
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: await response.text(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
}

describe("mcpOAuthAuthorize response contract", () => {
  afterEach(() => {
    delete process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH;
    delete process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS;
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("declares every status the handler can return", () => {
    // The spec must not silently regress to the 302-only declaration that let
    // the refusal surface go undeclared in the first place.
    expect(Object.keys(declared).sort()).toEqual(["302", "400", "500"]);
  });

  it("declares the refusal as plain text, not the JSON ErrorEnvelope", () => {
    // Deliberate: a browser mid-redirect renders this body to a human. If a
    // future change moves this path onto ErrorEnvelope, this assertion should
    // fail and force that decision to be made explicitly rather than by drift.
    expect(Object.keys(declared["400"]?.content ?? {})).toEqual(["text/plain"]);
    expect(Object.keys(declared["500"]?.content ?? {})).toEqual(["text/plain"]);
  });

  // Each case below is one refusal branch in `src/actions.ts`. All of them
  // predate #2383; the tunnel case is the one whose body #2383 changed.
  const refusals: Array<{ name: string; query: Record<string, string> }> = [
    {
      name: "missing redirect_uri",
      query: { state: "s", code_challenge: VALID_PKCE, code_challenge_method: "S256" },
    },
    {
      name: "missing state",
      query: {
        redirect_uri: "http://localhost:5195/oauth",
        code_challenge: VALID_PKCE,
        code_challenge_method: "S256",
      },
    },
    {
      name: "missing PKCE on a non-OpenAI redirect",
      query: { redirect_uri: "http://localhost:5195/oauth", state: "s" },
    },
    {
      name: "dev_stub while disabled",
      query: {
        redirect_uri: "http://localhost:5195/oauth",
        state: "s",
        code_challenge: VALID_PKCE,
        code_challenge_method: "S256",
        dev_stub: "1",
      },
    },
    {
      name: "redirect_uri not on the tunnel allowlist",
      query: {
        redirect_uri: "https://not-configured.example.com/callback",
        state: "s",
        code_challenge: VALID_PKCE,
        code_challenge_method: "S256",
      },
    },
  ];

  for (const refusal of refusals) {
    it(`answers a declared 400 for: ${refusal.name}`, async () => {
      currentTempDir = path.join(process.cwd(), "tmp", `neotoma-authorize-contract-${Date.now()}`);
      const app = await loadApp(currentTempDir);

      const response = await authorize(app, refusal.query);

      expect(response.status).toBe(400);
      // The status the handler emits is one the spec declares.
      expect(declared[String(response.status)]).toBeTruthy();
      // ...and with the media type it declares for it.
      expect(response.contentType).toContain("text/plain");
      // A refusal with an empty body would satisfy the status assertions while
      // telling the human in the browser nothing.
      expect(response.body.length).toBeGreaterThan(0);
    });
  }

  it("does not render an echoed redirect_uri as HTML", async () => {
    // This endpoint is pre-auth and browser-reached, and the 400 now echoes the
    // sanitized redirect_uri so an operator can self-diagnose a near miss. That
    // echo is only safe while the response is text/plain: as text/html, a
    // crafted redirect_uri would execute on this instance's own origin. This
    // pins the media type at the sink, so a future `res.send(...)` regression
    // fails here rather than in production.
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-authorize-contract-${Date.now()}`);
    const app = await loadApp(currentTempDir);

    const injected = "https://evil.example.com/cb</p><script>alert(1)</script>";
    const response = await authorize(app, {
      redirect_uri: injected,
      state: "s",
      code_challenge: VALID_PKCE,
      code_challenge_method: "S256",
    });

    expect(response.status).toBe(400);
    expect(response.contentType).toContain("text/plain");
    expect(response.contentType).not.toContain("text/html");
    // The sanitizer drops query/fragment; the path is echoed, so the guarantee
    // that matters is the media type, asserted above.
    expect(response.body).toContain("The server compared:");
  });

  it("never echoes the query string, where the code and state live", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-authorize-contract-${Date.now()}`);
    const app = await loadApp(currentTempDir);

    const response = await authorize(app, {
      redirect_uri: "https://evil.example.com/cb?code=SECRET_CODE&token=SECRET_TOKEN",
      state: "s",
      code_challenge: VALID_PKCE,
      code_challenge_method: "S256",
    });

    expect(response.status).toBe(400);
    expect(response.body).not.toContain("SECRET_CODE");
    expect(response.body).not.toContain("SECRET_TOKEN");
    expect(response.body).toContain("https://evil.example.com/cb");
  });

  it("answers a declared 302 when the redirect_uri is allowed", async () => {
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-authorize-contract-${Date.now()}`);
    const app = await loadApp(currentTempDir);

    const response = await authorize(app, {
      redirect_uri: "http://localhost:5195/oauth",
      state: "s",
      code_challenge: VALID_PKCE,
      code_challenge_method: "S256",
    });

    expect(response.status).toBe(302);
    expect(declared["302"]).toBeTruthy();
  });
});
