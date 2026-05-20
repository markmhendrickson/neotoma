import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import type { SubstrateEvent } from "../../src/events/types.js";

type JsonRpcResponse = {
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
  error?: { message?: string; code?: number };
};

type McpClient = {
  callTool<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<T>;
};

type SubmitIssueResult = {
  issue_number: number;
  github_url: string;
  entity_id: string;
  remote_entity_id?: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
  guest_access_token?: string;
};

type AddIssueMessageResult = {
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
};

type SubscribeResult = {
  subscription_id: string;
  entity_id: string;
  webhook_secret?: string;
};

type WebhookDelivery = {
  subscription_id: string;
  delivery_id: string;
  event: SubstrateEvent;
};

type LiveTarget = {
  name: string;
  mcpUrl: string;
  token?: string;
};

const LIVE_ENABLED = process.env.NEOTOMA_LIVE_ISSUES === "1";
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function defaultDevMcpUrl(): string {
  const portFile = path.join(REPO_ROOT, ".dev-serve", "local_http_port_dev");
  try {
    const port = fs.readFileSync(portFile, "utf8").trim();
    if (port) return `http://127.0.0.1:${port}/mcp`;
  } catch {
    // Fall through to default dev port.
  }
  return "http://127.0.0.1:3080/mcp";
}

function targetFromEnv(prefix: string, fallbackName: string): LiveTarget | null {
  const mcpUrl = process.env[`${prefix}_MCP_URL`] ?? defaultDevMcpUrl();
  return {
    name: process.env[`${prefix}_NAME`] ?? fallbackName,
    mcpUrl,
    token: process.env[`${prefix}_TOKEN`],
  };
}

async function readJsonResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${text}`);
  }
  if (!text.trim()) return {};
  if (!text.startsWith("event:")) {
    return JSON.parse(text) as JsonRpcResponse;
  }
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return {};
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcResponse;
}

async function createMcpClient(target: LiveTarget): Promise<McpClient> {
  let nextId = 1;
  const commonHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (target.token) {
    commonHeaders.Authorization = `Bearer ${target.token}`;
  }

  const initResponse = await fetch(target.mcpUrl, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "live-issues-tooling-test", version: "0.0.0" },
      },
    }),
  });
  const sessionId = initResponse.headers.get("mcp-session-id");
  const initJson = await readJsonResponse(initResponse);
  if (initJson.error) {
    throw new Error(`${target.name} MCP initialize failed: ${initJson.error.message ?? JSON.stringify(initJson.error)}`);
  }
  if (!sessionId) {
    throw new Error(`${target.name} MCP initialize did not return mcp-session-id`);
  }

  await fetch(target.mcpUrl, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });

  return {
    async callTool<T extends Record<string, unknown> = Record<string, unknown>>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> {
      const response = await fetch(target.mcpUrl, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      const json = await readJsonResponse(response);
      if (json.error) {
        throw new Error(`${target.name} ${name} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
      }
      const text = json.result?.content?.find((item) => item.type === "text")?.text;
      return text ? (JSON.parse(text) as T) : ({} as T);
    },
  };
}

async function withWebhookReceiver<T>(
  callback: (params: {
    webhookUrl: string;
    waitForDelivery: (
      predicate: (delivery: WebhookDelivery) => boolean,
      timeoutMs?: number,
    ) => Promise<WebhookDelivery>;
  }) => Promise<T>,
): Promise<T> {
  const deliveries: WebhookDelivery[] = [];
  const waiters = new Set<{
    predicate: (delivery: WebhookDelivery) => boolean;
    resolve: (delivery: WebhookDelivery) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const server: Server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body) as WebhookDelivery;
        deliveries.push(parsed);
        for (const waiter of [...waiters]) {
          if (!waiter.predicate(parsed)) continue;
          clearTimeout(waiter.timer);
          waiters.delete(waiter);
          waiter.resolve(parsed);
        }
        res.statusCode = 200;
        res.end("ok");
      } catch {
        res.statusCode = 400;
        res.end("invalid json");
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("webhook receiver failed to bind to a TCP port");
  }

  const waitForDelivery = (
    predicate: (delivery: WebhookDelivery) => boolean,
    timeoutMs = 20_000,
  ): Promise<WebhookDelivery> => {
    const existing = deliveries.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise<WebhookDelivery>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error("Timed out waiting for matching subscription delivery"));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  };

  try {
    return await callback({
      webhookUrl: `http://127.0.0.1:${address.port}/subscription-webhook`,
      waitForDelivery,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function runLiveFlow(params: {
  submitter: McpClient;
  maintainer: McpClient;
  visibility: "private" | "public";
  titlePrefix: string;
}): Promise<void> {
  const stamp = `run${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const title = `${params.titlePrefix} ${stamp}`;
  const body = `Live issue tooling smoke body ${stamp}`;
  const maintainerReply = `Live maintainer reply ${stamp}`;

  const submitted = await params.submitter.callTool<SubmitIssueResult>("submit_issue", {
    title,
    body,
    visibility: params.visibility,
    labels: ["live-issues-tooling", "test-cleanup"],
    reporter_git_sha: process.env.NEOTOMA_LIVE_ISSUES_REPORTER_SHA ?? "live-smoke",
    reporter_channel: "vitest-live-smoke",
  });

  expect(submitted.submitted_to_neotoma).toBe(true);
  expect(submitted.entity_id).toBeTruthy();
  if (params.visibility === "private") {
    expect(submitted.pushed_to_github).toBe(false);
    expect(submitted.guest_access_token).toBeTruthy();
  } else {
    expect(submitted.pushed_to_github).toBe(true);
    expect(submitted.issue_number).toBeGreaterThan(0);
  }

  await withWebhookReceiver(async ({ webhookUrl, waitForDelivery }) => {
    const subscribedEntityId = submitted.entity_id;
    const subscription = await params.submitter.callTool<SubscribeResult>("subscribe", {
      entity_types: ["issue"],
      entity_ids: [subscribedEntityId],
      event_types: ["entity.updated"],
      delivery_method: "webhook",
      webhook_url: webhookUrl,
    });

    expect(subscription.subscription_id).toBeTruthy();

    try {
      const maintainerEntityId = submitted.remote_entity_id ?? submitted.entity_id;
      const message = await params.maintainer.callTool<AddIssueMessageResult>("add_issue_message", {
        entity_id: maintainerEntityId,
        body: maintainerReply,
        reporter_git_sha: process.env.NEOTOMA_LIVE_ISSUES_REPORTER_SHA ?? "live-smoke",
        reporter_channel: "vitest-live-smoke",
      });
      expect(message.submitted_to_neotoma).toBe(true);

      const delivered = await waitForDelivery(
        (delivery) =>
          delivery.subscription_id === subscription.subscription_id &&
          delivery.event.entity_type === "issue" &&
          delivery.event.entity_id === subscribedEntityId &&
          delivery.event.event_type === "entity.updated",
      );

      expect(delivered.event).toMatchObject({
        entity_type: "issue",
        entity_id: subscribedEntityId,
        event_type: "entity.updated",
        action: "updated",
      });
    } finally {
      await params.submitter.callTool("unsubscribe", {
        subscription_id: subscription.subscription_id,
      });
    }
  });
}

const liveDescribe = LIVE_ENABLED ? describe : describe.skip;

liveDescribe("live issues tooling smoke", () => {
  it("runs private/public issue flows across configured live MCP targets", async () => {
    const unsigned = targetFromEnv("NEOTOMA_LIVE_ISSUES_UNSIGNED", "unsigned");
    const signed = targetFromEnv("NEOTOMA_LIVE_ISSUES_SIGNED", "signed");
    const maintainer = targetFromEnv("NEOTOMA_LIVE_ISSUES_MAINTAINER", "maintainer");
    if (!unsigned || !signed || !maintainer) {
      throw new Error(
        "Set NEOTOMA_LIVE_ISSUES_UNSIGNED_MCP_URL, NEOTOMA_LIVE_ISSUES_SIGNED_MCP_URL, and NEOTOMA_LIVE_ISSUES_MAINTAINER_MCP_URL before enabling NEOTOMA_LIVE_ISSUES=1",
      );
    }

    const [unsignedClient, signedClient, maintainerClient] = await Promise.all([
      createMcpClient(unsigned),
      createMcpClient(signed),
      createMcpClient(maintainer),
    ]);

    await runLiveFlow({
      submitter: unsignedClient,
      maintainer: maintainerClient,
      visibility: "private",
      titlePrefix: "Live private issue via unsigned MCP",
    });
    await runLiveFlow({
      submitter: signedClient,
      maintainer: maintainerClient,
      visibility: "private",
      titlePrefix: "Live private issue via signed MCP",
    });
    await runLiveFlow({
      submitter: unsignedClient,
      maintainer: maintainerClient,
      visibility: "public",
      titlePrefix: "Live public issue via unsigned MCP",
    });
    await runLiveFlow({
      submitter: signedClient,
      maintainer: maintainerClient,
      visibility: "public",
      titlePrefix: "Live public issue via signed MCP",
    });
  }, 240_000);
});
