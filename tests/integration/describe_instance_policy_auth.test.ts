/**
 * Regression test for a release-preparation finding on v0.22.0: the
 * `describe_instance_policy` MCP tool handler (server.ts) never called
 * `getAuthenticatedUserId()`, unlike its REST sibling
 * (`GET /instance-policy` in actions.ts, which does call
 * `getAuthenticatedUserId(req, undefined)`) and unlike every other MCP tool
 * handler in this file (e.g. `describeEntityType`). MCP tool dispatch
 * (`CallToolRequestSchema` in server.ts) has no outer auth gate — each
 * handler is individually responsible for calling `getAuthenticatedUserId()`
 * if the tool requires authentication.
 *
 * `openapi.yaml` declares `GET /instance-policy` as `requires_auth: true`.
 * An MCP session that never resolved an authenticated user id must be
 * rejected by `describe_instance_policy` the same way the REST route is.
 *
 * `getInstancePolicy()` itself takes no caller-supplied identifier (the
 * policy is instance-wide, not per-user, by design — see
 * src/services/instance_policy.ts docblock), so this is not a
 * tenant-isolation test: it only asserts the tool enforces the same
 * authentication precondition its REST and MCP siblings enforce.
 */

import { describe, expect, it } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "../../src/server.js";

function callDescribeInstancePolicy(server: NeotomaServer) {
  return (
    server as unknown as {
      describeInstancePolicy: () => Promise<{ content: Array<{ text: string }> }>;
    }
  ).describeInstancePolicy();
}

describe("describe_instance_policy MCP tool — authentication gate", () => {
  it("rejects when no user is authenticated on the session", async () => {
    const server = new NeotomaServer();
    // authenticatedUserId deliberately left unset, simulating a session that
    // never resolved an identity (no NEOTOMA_CONNECTION_ID / OAuth binding).
    await expect(callDescribeInstancePolicy(server)).rejects.toThrow(McpError);
    await expect(callDescribeInstancePolicy(server)).rejects.toThrow(/Authentication required/i);
  });

  it("succeeds once a user is authenticated on the session", async () => {
    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId =
      "00000000-0000-0000-0000-000000000001";
    const result = await callDescribeInstancePolicy(server);
    expect(result.content[0]?.text).toBeDefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toHaveProperty("policy");
  });
});
