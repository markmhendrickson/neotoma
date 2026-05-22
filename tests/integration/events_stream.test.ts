import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { handleSubstrateEventForSubscriptions } from "../../src/services/subscriptions/subscription_bridge.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const tracker = new TestIdTracker();

interface SubscribeResponse {
  subscription_id: string;
  entity_id: string;
}

interface SubmitIssueResponse {
  entity_id?: string;
  issue_entity_id?: string;
  conversation_id?: string;
  entity_ids?: string[];
  guest_access_token?: string;
}

interface AddIssueMessageResponse {
  message_entity_id?: string;
}

async function withHttpServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function guestTokenFor(userId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [], userId });
  tracker.trackEntity(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

async function subscribe(
  baseUrl: string,
  token: string,
  subscriptionBody: Record<string, unknown> = {
    entity_types: ["note"],
    delivery_method: "sse",
  },
): Promise<SubscribeResponse> {
  const response = await fetch(`${baseUrl}/subscribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscriptionBody),
  });
  const responseBody = (await response.json()) as SubscribeResponse;
  expect(response.status).toBe(200);
  tracker.trackEntity(responseBody.entity_id);
  return responseBody;
}

function streamUrl(baseUrl: string, subscriptionId: string): string {
  return `${baseUrl}/events/stream?subscription_id=${encodeURIComponent(subscriptionId)}`;
}

async function readSseEvent(
  response: Response,
  predicate: (event: SubstrateEvent) => boolean,
  timeoutMs = 5_000,
): Promise<SubstrateEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SSE response did not expose a readable body");

  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const read = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
        setTimeout(() => reject(new Error("SSE read timeout")), Math.min(250, deadline - Date.now())),
      ),
    ]).catch(() => null);
    if (!read) continue;
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice("data: ".length)) as SubstrateEvent;
      if (predicate(event)) return event;
    }
  }

  throw new Error("Timed out waiting for matching SSE event");
}

describe("GET /events/stream", () => {
  afterEach(async () => {
    await tracker.cleanup();
  });

  it("requires a valid credential", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(streamUrl(baseUrl, "sp009-missing"), {
        headers: { Authorization: "Bearer invalid-token" },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  it("rejects an invalid subscription_id", async () => {
    await withHttpServer(async (baseUrl) => {
      const token = await guestTokenFor("sp009-events-owner");
      const response = await fetch(streamUrl(baseUrl, "sp009-missing"), {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error_code: "NOT_FOUND" });
    });
  });

  it("denies cross-user subscription_id access", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerToken = await guestTokenFor("sp009-events-owner");
      const otherToken = await guestTokenFor("sp009-events-other");
      const created = await subscribe(baseUrl, ownerToken);

      const response = await fetch(streamUrl(baseUrl, created.subscription_id), {
        headers: { Authorization: `Bearer ${otherToken}` },
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error_code: "NOT_FOUND" });
    });
  });

  it("closes an open SSE stream cleanly when the client aborts", async () => {
    await withHttpServer(async (baseUrl) => {
      const token = await guestTokenFor("sp009-events-close");
      const created = await subscribe(baseUrl, token);
      const controller = new AbortController();

      const response = await fetch(streamUrl(baseUrl, created.subscription_id), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  });

  it("emits the real issue.updated substrate event for /issues/add_message", async () => {
    const previousTargetUrl = process.env.NEOTOMA_ISSUES_TARGET_URL;
    process.env.NEOTOMA_ISSUES_TARGET_URL = "";
    try {
      await withHttpServer(async (baseUrl) => {
        const submittedResponse = await fetch(`${baseUrl}/issues/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `SSE issue append ${randomUUID()}`,
            body: "Initial issue body",
            visibility: "private",
            reporter_git_sha: "events-stream-test",
          }),
        });
        const submitted = (await submittedResponse.json()) as SubmitIssueResponse;
        expect(submittedResponse.status).toBe(200);

        const issueEntityId = submitted.issue_entity_id ?? submitted.entity_id ?? "";
        expect(issueEntityId).toBeTruthy();
        if (submitted.entity_ids) {
          for (const entityId of submitted.entity_ids) tracker.trackEntity(entityId);
        }
        if (submitted.conversation_id) tracker.trackEntity(submitted.conversation_id);
        const emitted: SubstrateEvent[] = [];
        const listener = (event: SubstrateEvent) => {
          emitted.push(event);
        };
        substrateEventBus.onSubstrateEvent(listener);

        try {
          const appendedResponse = await fetch(`${baseUrl}/issues/add_message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_id: issueEntityId,
              body: `Follow-up message ${randomUUID()}`,
              reporter_git_sha: "events-stream-test",
            }),
          });
          const appended = (await appendedResponse.json()) as AddIssueMessageResponse;
          expect(appendedResponse.status).toBe(200);
          expect(appended.message_entity_id).toBeTruthy();

          const deadline = Date.now() + 5_000;
          while (
            Date.now() < deadline &&
            !emitted.some(
              (event) =>
                event.entity_id === issueEntityId &&
                event.entity_type === "issue" &&
                event.event_type === "entity.updated",
            )
          ) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }

          const received = emitted.find(
            (event) =>
              event.entity_id === issueEntityId &&
              event.entity_type === "issue" &&
              event.event_type === "entity.updated",
          );

          expect(received).toMatchObject({
            event_type: "entity.updated",
            entity_type: "issue",
            entity_id: issueEntityId,
            action: "updated",
          });
          expect(received?.fields_changed ?? []).toEqual([]);
        } finally {
          substrateEventBus.off("substrate_event", listener);
        }
      });
    } finally {
      if (previousTargetUrl === undefined) {
        delete process.env.NEOTOMA_ISSUES_TARGET_URL;
      } else {
        process.env.NEOTOMA_ISSUES_TARGET_URL = previousTargetUrl;
      }
    }
  });

  it("streams matching issue substrate events to an authorized SSE subscriber", async () => {
    await withHttpServer(async (baseUrl) => {
      const token = await guestTokenFor("sp009-events-issue-owner");
      const created = await subscribe(baseUrl, token, {
        entity_types: ["issue"],
        event_types: ["entity.updated"],
        delivery_method: "sse",
      });
      const controller = new AbortController();
      const response = await fetch(streamUrl(baseUrl, created.subscription_id), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);

      const issueEvent: SubstrateEvent = {
        event_id: `evt_${randomUUID()}`,
        event_type: "entity.updated",
        timestamp: new Date().toISOString(),
        user_id: "sp009-events-issue-owner",
        entity_id: `ent_issue_sse_${randomUUID().replaceAll("-", "")}`,
        entity_type: "issue",
        action: "updated",
        fields_changed: ["status"],
      };

      await handleSubstrateEventForSubscriptions(issueEvent);
      const received = await readSseEvent(
        response,
        (event) => event.event_id === issueEvent.event_id,
      );

      expect(received).toMatchObject({
        event_id: issueEvent.event_id,
        event_type: "entity.updated",
        entity_type: "issue",
        entity_id: issueEvent.entity_id,
        fields_changed: ["status"],
      });
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  });
});
