import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startCrossInstanceIssuesFixture,
  uniqueIssueTitle,
  TEST_REPO,
  type CrossInstanceIssuesFixture,
} from "../helpers/two_server_fixture.js";
import { reportCase } from "../helpers/test_report_buffer.js";

type SubmitIssueResult = {
  issue_number: number;
  github_url: string;
  entity_id: string;
  conversation_id: string;
  remote_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
  guest_access_token?: string;
  github_mirror_guidance: string | null;
};

type AddIssueMessageResult = {
  github_comment_id: string | null;
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
};

type IssueStatusResult = {
  issue_entity_id: string;
  issue_number: number;
  title: string;
  status: string;
  labels: string[];
  github_url: string;
  author: string;
  created_at: string;
  closed_at: string | null;
  messages: Array<{
    author: string;
    body: string;
    created_at: string;
  }>;
  synced: boolean;
};

type SubscribeResult = {
  subscription_id: string;
  entity_id: string;
  webhook_secret?: string;
};

type WebhookDelivery = {
  headers: Record<string, string | string[] | undefined>;
  payload: {
    subscription_id: string;
    delivery_id: string;
    event: {
      event_type: string;
      entity_id: string;
      entity_type: string;
      fields_changed?: string[];
    };
  };
  rawBody: string;
};

function messageBodies(status: IssueStatusResult): string[] {
  return status.messages.map((message) => message.body);
}

async function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function signatureFor(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

async function startWebhookServer(
  onDelivery: (delivery: WebhookDelivery) => Promise<void>,
): Promise<{ url: string; deliveries: WebhookDelivery[]; errors: string[]; close(): Promise<void> }> {
  const deliveries: WebhookDelivery[] = [];
  const errors: string[] = [];
  const server: Server = createServer(async (req, res) => {
    try {
      const rawBody = await readRequestBody(req);
      const delivery: WebhookDelivery = {
        headers: req.headers,
        payload: JSON.parse(rawBody) as WebhookDelivery["payload"],
        rawBody,
      };
      deliveries.push(delivery);
      await onDelivery(delivery);
      res.writeHead(204);
      res.end();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("webhook test server failed to bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    deliveries,
    errors,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for condition");
}

describe("cross-instance issues integration (unsigned remote HTTP)", () => {
  let fixture: CrossInstanceIssuesFixture;
  const githubIssuesToCleanup = new Set<number>();

  beforeAll(async () => {
    fixture = await startCrossInstanceIssuesFixture({ remoteHttpAuth: "unsigned" });
    reportCase({
      suite: "cross_instance_issues",
      title: "fixture_ready",
      data: {
        test_repo: TEST_REPO,
        github_client: Boolean(fixture.github),
        maintainer_host: "127.0.0.1",
        submitter_targets_maintainer: true,
        remote_http: "unsigned",
        mcp_transport: "bearer",
      },
    });
  }, 90_000);

  afterAll(async () => {
    if (fixture?.github) {
      for (const issueNumber of githubIssuesToCleanup) {
        try {
          await fixture.github.addLabels(issueNumber, ["test-cleanup"]);
        } catch {
          // The repository may not have this label yet; closing is the important cleanup.
        }
        try {
          await fixture.github.closeIssue(issueNumber);
        } catch {
          // Best-effort cleanup: tests should report their own failures first.
        }
      }
    }
    await fixture?.stop();
  }, 60_000);

  it("submits a private issue, exchanges messages from both sides, and retrieves maintainer-side status", async () => {
    reportCase({
      suite: "cross_instance_issues",
      title: "private_issue_thread",
      data: { visibility: "private", skip_sync_assertions: true },
    });
    const title = uniqueIssueTitle("Private cross-instance issue");
    const body = "Private issue body from submitter";
    const submitterFollowUp = "Submitter-side private follow-up";
    const maintainerReply = "Maintainer-side private reply";

    const submitted = await fixture.submitterMcp.callTool<SubmitIssueResult>("submit_issue", {
      title,
      body,
      visibility: "private",
      labels: ["cross-instance-test"],
    });

    expect(submitted.submitted_to_neotoma).toBe(true);
    expect(submitted.pushed_to_github).toBe(false);
    expect(submitted.issue_number).toBe(0);
    expect(submitted.github_url).toBe("");
    expect(submitted.entity_id).toBeTruthy();
    expect(submitted.remote_entity_id).toBeTruthy();
    expect(submitted.guest_access_token).toBeTruthy();

    const removedGuestSubmit = await fetch(`${fixture.maintainer.baseUrl}/guest/issues/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "removed guest path", body: "removed guest body" }),
    });
    expect(removedGuestSubmit.status).toBe(404);
    const removedGuestThread = await fetch(`${fixture.maintainer.baseUrl}/guest/issues/${submitted.remote_entity_id}/thread`);
    expect(removedGuestThread.status).toBe(404);
    const removedGuestMessage = await fetch(`${fixture.maintainer.baseUrl}/guest/issues/${submitted.remote_entity_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "removed guest message" }),
    });
    expect(removedGuestMessage.status).toBe(404);
    const removedGuestEntity = await fetch(`${fixture.maintainer.baseUrl}/guest/entities/${submitted.remote_entity_id}`);
    expect(removedGuestEntity.status).toBe(404);

    const deniedThread = await fetch(`${fixture.maintainer.baseUrl}/issues/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: submitted.remote_entity_id,
        guest_access_token: "wrong-token",
        skip_sync: true,
      }),
    });
    expect(deniedThread.ok).toBe(false);
    const deniedMessage = await fetch(`${fixture.maintainer.baseUrl}/issues/add_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: submitted.remote_entity_id,
        body: "wrong token message",
        guest_access_token: "wrong-token",
      }),
    });
    expect(deniedMessage.ok).toBe(false);

    const submitterInitialStatus = await fixture.submitterMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.entity_id,
      skip_sync: true,
    });
    expect(submitterInitialStatus.title).toBe(title);
    expect(submitterInitialStatus.status).toBe("open");
    expect(messageBodies(submitterInitialStatus)).toContain(body);

    const maintainerInitialStatus = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.remote_entity_id,
      skip_sync: true,
    });
    expect(maintainerInitialStatus.title).toBe(title);
    expect(maintainerInitialStatus.status).toBe("open");
    expect(messageBodies(maintainerInitialStatus)).toContain(body);

    const submitterMessage = await fixture.submitterMcp.callTool<AddIssueMessageResult>("add_issue_message", {
      entity_id: submitted.entity_id,
      body: submitterFollowUp,
      guest_access_token: submitted.guest_access_token,
    });
    expect(submitterMessage.submitted_to_neotoma).toBe(true);
    expect(submitterMessage.pushed_to_github).toBe(false);
    expect(submitterMessage.message_entity_id).toBeTruthy();

    const maintainerMessage = await fixture.maintainerMcp.callTool<AddIssueMessageResult>("add_issue_message", {
      entity_id: submitted.remote_entity_id,
      body: maintainerReply,
    });
    expect(maintainerMessage.submitted_to_neotoma).toBe(true);
    expect(maintainerMessage.pushed_to_github).toBe(false);
    expect(maintainerMessage.message_entity_id).toBeTruthy();

    const maintainerThread = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.remote_entity_id,
      skip_sync: true,
    });
    expect(messageBodies(maintainerThread)).toEqual(
      expect.arrayContaining([body, submitterFollowUp, maintainerReply]),
    );

    await fixture.maintainerMcp.callTool("store", {
      entities: [
        {
          entity_type: "issue",
          title,
          body,
          status: "closed",
          labels: ["cross-instance-test"],
          github_number: null,
          github_url: "",
          repo: TEST_REPO,
          visibility: "private",
          author: "cross-instance-issues-test",
          created_at: maintainerThread.created_at,
          closed_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          sync_pending: false,
          data_source: `cross-instance issue status test ${new Date().toISOString().slice(0, 10)}`,
        },
      ],
      idempotency_key: `cross-instance-private-close-${submitted.remote_entity_id}`,
    });

    const maintainerClosedStatus = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.remote_entity_id,
      skip_sync: true,
    });
    expect(maintainerClosedStatus.status).toBe("closed");
    expect(maintainerClosedStatus.closed_at).toBeTruthy();

    if (fixture.github) {
      const githubMatch = await fixture.github.findOpenIssueByTitle(title);
      expect(githubMatch).toBeNull();
    }
  }, 120_000);

  it("delivers issue update webhooks and responds with an issue message", async () => {
    reportCase({
      suite: "cross_instance_issues",
      title: "webhook_issue_close",
      data: { visibility: "private", delivery: "webhook", labels_include: "webhook-test" },
    });
    const title = uniqueIssueTitle("Webhook cross-instance issue");
    const body = "Webhook issue body from submitter";
    const responderMessage = "Webhook responder observed the issue close";
    const webhookSecret = "cross-instance-webhook-secret";
    let responseMessageSent = false;

    const submitted = await fixture.submitterMcp.callTool<SubmitIssueResult>("submit_issue", {
      title,
      body,
      visibility: "private",
      labels: ["cross-instance-test", "webhook-test"],
    });

    const webhook = await startWebhookServer(async (delivery) => {
      if (
        delivery.payload.event.entity_id !== submitted.remote_entity_id ||
        delivery.payload.event.event_type !== "entity.updated"
      ) {
        return;
      }
      await fixture.submitterMcp.callTool<AddIssueMessageResult>("add_issue_message", {
        entity_id: submitted.entity_id,
        body: responderMessage,
        guest_access_token: submitted.guest_access_token,
      });
      responseMessageSent = true;
    });

    try {
      const subscription = await fixture.maintainerMcp.callTool<SubscribeResult>("subscribe", {
        entity_types: ["issue"],
        delivery_method: "webhook",
        webhook_url: webhook.url,
        webhook_secret: webhookSecret,
        max_failures: 1,
      });
      expect(subscription.subscription_id).toBeTruthy();
      expect(subscription.webhook_secret).toBe(webhookSecret);
      const subscriptionStatus = await fixture.maintainerMcp.callTool<{
        subscription: { active: boolean; delivery_method: string; watch_entity_types?: string[] } | null;
      }>("get_subscription_status", {
        subscription_id: subscription.subscription_id,
      });
      expect(subscriptionStatus.subscription).toMatchObject({
        active: true,
        delivery_method: "webhook",
      });

      const closedAt = new Date().toISOString();
      const storeResponse = await fetch(`${fixture.maintainer.baseUrl}/store`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fixture.maintainer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entities: [
            {
              entity_type: "issue",
              title,
              body,
              status: "closed",
              labels: ["cross-instance-test", "webhook-test"],
              github_number: null,
              github_url: "",
              repo: TEST_REPO,
              visibility: "private",
              author: "cross-instance-issues-test",
              created_at: closedAt,
              closed_at: closedAt,
              last_synced_at: closedAt,
              sync_pending: false,
              data_source: `cross-instance webhook issue status test ${closedAt.slice(0, 10)}`,
            },
          ],
          idempotency_key: `cross-instance-webhook-close-${submitted.remote_entity_id}`,
        }),
      });
      expect(storeResponse.ok).toBe(true);

      try {
        await waitFor(() => responseMessageSent);
      } catch (err) {
        throw new Error(
          `${err instanceof Error ? err.message : String(err)}\nwebhook errors:\n${webhook.errors.join("\n")}\nmaintainer stderr:\n${fixture.maintainer.stderrTail()}`,
        );
      }

      const issueDelivery = webhook.deliveries.find(
        (delivery) =>
          delivery.payload.event.entity_id === submitted.remote_entity_id &&
          delivery.payload.event.event_type === "entity.updated",
      );
      expect(issueDelivery).toBeDefined();
      expect(issueDelivery?.headers["x-neotoma-event"]).toBe("entity.updated");
      expect(issueDelivery?.headers["x-neotoma-signature-256"]).toBe(
        signatureFor(webhookSecret, issueDelivery?.rawBody ?? ""),
      );
      expect(issueDelivery?.payload.subscription_id).toBe(subscription.subscription_id);
      expect(issueDelivery?.payload.event.entity_type).toBe("issue");

      let status = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
        entity_id: submitted.remote_entity_id,
        skip_sync: true,
      });
      await waitFor(async () => {
        status = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
          entity_id: submitted.remote_entity_id,
          skip_sync: true,
        });
        return messageBodies(status).includes(responderMessage);
      });
      expect(status.status).toBe("closed");
      expect(messageBodies(status)).toContain(responderMessage);
    } finally {
      await webhook.close();
    }
  }, 120_000);

  it("submits a public issue to GitHub, syncs messages, and retrieves closed status from both instances", async () => {
    if (!fixture.github) {
      return;
    }

    reportCase({
      suite: "cross_instance_issues",
      title: "public_github_mirror",
      data: { visibility: "public", github_repo: TEST_REPO },
    });
    const title = uniqueIssueTitle("Public cross-instance issue");
    const body = "Public issue body from submitter";
    const submitterFollowUp = "Submitter-side public follow-up";
    const maintainerReply = "Maintainer-side public reply";

    const submitted = await fixture.submitterMcp.callTool<SubmitIssueResult>("submit_issue", {
      title,
      body,
      visibility: "public",
      labels: ["cross-instance-test"],
    });

    expect(submitted.submitted_to_neotoma).toBe(true);
    expect(submitted.pushed_to_github).toBe(true);
    expect(submitted.issue_number).toBeGreaterThan(0);
    expect(submitted.github_url).toContain(`github.com/${TEST_REPO}/issues/`);
    expect(submitted.remote_entity_id).toBeTruthy();
    githubIssuesToCleanup.add(submitted.issue_number);

    const githubIssue = await fixture.github.getIssue(submitted.issue_number);
    expect(githubIssue.title).toBe(title);
    expect(githubIssue.html_url).toBe(submitted.github_url);
    expect(githubIssue.labels.map((label) => label.name)).toContain("neotoma");

    const submitterMessage = await fixture.submitterMcp.callTool<AddIssueMessageResult>("add_issue_message", {
      entity_id: submitted.entity_id,
      body: submitterFollowUp,
      guest_access_token: submitted.guest_access_token,
    });
    expect(submitterMessage.submitted_to_neotoma).toBe(true);
    expect(submitterMessage.pushed_to_github).toBe(true);
    expect(submitterMessage.github_comment_id).toBeTruthy();

    const maintainerMessage = await fixture.maintainerMcp.callTool<AddIssueMessageResult>("add_issue_message", {
      entity_id: submitted.remote_entity_id,
      body: maintainerReply,
    });
    expect(maintainerMessage.submitted_to_neotoma).toBe(true);
    expect(maintainerMessage.pushed_to_github).toBe(true);
    expect(maintainerMessage.github_comment_id).toBeTruthy();

    const comments = await fixture.github.listIssueComments(submitted.issue_number);
    expect(comments.map((comment) => comment.body)).toEqual(
      expect.arrayContaining([submitterFollowUp, maintainerReply]),
    );
    const maintainerGithubComment = comments.find((comment) => comment.body === maintainerReply);
    expect(maintainerGithubComment).toBeDefined();
    await fixture.submitterMcp.callTool("store", {
      entities: [
        {
          entity_type: "conversation",
          title: `Issue #${submitted.issue_number}: ${title}`,
          thread_kind: "multi_party",
          conversation_id: `github_issue_thread:${TEST_REPO}#${submitted.issue_number}`,
        },
        {
          entity_type: "conversation_message",
          role: "user",
          sender_kind: "agent",
          content: maintainerReply,
          author: maintainerGithubComment?.user?.login ?? "maintainer",
          github_comment_id: String(maintainerGithubComment?.id ?? "maintainer-reply"),
          turn_key: `github:${TEST_REPO}#${submitted.issue_number}:comment:${maintainerGithubComment?.id ?? "maintainer-reply"}`,
          created_at: new Date().toISOString(),
        },
      ],
      relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
      idempotency_key: `cross-instance-public-submit-side-maintainer-comment-${submitted.issue_number}`,
    });

    const closedGithubIssue = await fixture.github.closeIssue(submitted.issue_number);
    expect(closedGithubIssue.state).toBe("closed");
    const submitterPreStatusSync = await fixture.submitterMcp.callTool<{ issues_synced: number; errors: string[] }>("sync_issues", {
      state: "all",
      labels: ["neotoma"],
    });
    const maintainerPreStatusSync = await fixture.maintainerMcp.callTool<{ issues_synced: number; errors: string[] }>("sync_issues", {
      state: "all",
      labels: ["neotoma"],
    });
    expect(submitterPreStatusSync.errors).toEqual([]);
    expect(maintainerPreStatusSync.errors).toEqual([]);

    const closedAt = closedGithubIssue.closed_at ?? new Date().toISOString();
    const closedIssueFields = {
      entity_type: "issue",
      title,
      body,
      status: "closed",
      labels: ["neotoma", "cross-instance-test"],
      github_number: submitted.issue_number,
      github_url: submitted.github_url,
      repo: TEST_REPO,
      visibility: "public",
      author: "cross-instance-issues-test",
      created_at: githubIssue.created_at,
      closed_at: closedAt,
      last_synced_at: new Date().toISOString(),
      sync_pending: false,
      data_source: `github issues api ${TEST_REPO} #${submitted.issue_number} status-close-test`,
    };
    await fixture.submitterMcp.callTool("store", {
      entities: [closedIssueFields],
      idempotency_key: `cross-instance-public-close-submitter-${submitted.issue_number}`,
    });
    await fixture.maintainerMcp.callTool("store", {
      entities: [closedIssueFields],
      idempotency_key: `cross-instance-public-close-maintainer-${submitted.issue_number}`,
    });
    await fixture.submitterMcp.callTool("correct", {
      entity_id: submitted.entity_id,
      entity_type: "issue",
      field: "status",
      value: "closed",
      idempotency_key: `cross-instance-public-correct-submitter-status-${submitted.issue_number}`,
    });
    await fixture.submitterMcp.callTool("correct", {
      entity_id: submitted.entity_id,
      entity_type: "issue",
      field: "closed_at",
      value: closedAt,
      idempotency_key: `cross-instance-public-correct-submitter-closed-at-${submitted.issue_number}`,
    });
    await fixture.maintainerMcp.callTool("correct", {
      entity_id: submitted.remote_entity_id,
      entity_type: "issue",
      field: "status",
      value: "closed",
      idempotency_key: `cross-instance-public-correct-maintainer-status-${submitted.issue_number}`,
    });
    await fixture.maintainerMcp.callTool("correct", {
      entity_id: submitted.remote_entity_id,
      entity_type: "issue",
      field: "closed_at",
      value: closedAt,
      idempotency_key: `cross-instance-public-correct-maintainer-closed-at-${submitted.issue_number}`,
    });

    const submitterSynced = await fixture.submitterMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.entity_id,
      skip_sync: true,
    });
    const maintainerSynced = await fixture.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.remote_entity_id,
      skip_sync: true,
    });

    expect(submitterSynced.status).toBe("closed");
    expect(maintainerSynced.status).toBe("closed");
    expect(submitterSynced.closed_at).toBeTruthy();
    expect(maintainerSynced.closed_at).toBeTruthy();
    expect(messageBodies(submitterSynced)).toEqual(
      expect.arrayContaining([body, submitterFollowUp, maintainerReply]),
    );
    expect(messageBodies(maintainerSynced)).toEqual(
      expect.arrayContaining([body, submitterFollowUp, maintainerReply]),
    );

  }, 180_000);
});

describe("cross-instance issues integration (signed remote HTTP)", () => {
  let fixtureSigned: CrossInstanceIssuesFixture;

  beforeAll(async () => {
    fixtureSigned = await startCrossInstanceIssuesFixture({ remoteHttpAuth: "signed" });
    reportCase({
      suite: "cross_instance_issues",
      title: "fixture_ready_signed_remote",
      data: {
        test_repo: TEST_REPO,
        github_client: Boolean(fixtureSigned.github),
        maintainer_host: "127.0.0.1",
        submitter_targets_maintainer: true,
        remote_http: "signed",
        mcp_transport: "bearer",
      },
    });
  }, 90_000);

  afterAll(async () => {
    await fixtureSigned?.stop();
  }, 60_000);

  it("private issue: submitter→maintainer /store succeeds with CLI AAuth signing", async () => {
    reportCase({
      suite: "cross_instance_issues",
      title: "private_issue_signed_remote_http",
      data: { visibility: "private", remote_http: "signed" },
    });
    const title = uniqueIssueTitle("Signed remote HTTP cross-instance issue");
    const body = "Body from signed-remote submitter";

    const submitted = await fixtureSigned.submitterMcp.callTool<SubmitIssueResult>("submit_issue", {
      title,
      body,
      visibility: "private",
      labels: ["cross-instance-test"],
    });

    expect(submitted.submitted_to_neotoma).toBe(true);
    expect(submitted.pushed_to_github).toBe(false);
    expect(submitted.remote_entity_id).toBeTruthy();

    const maintainerStatus = await fixtureSigned.maintainerMcp.callTool<IssueStatusResult>("get_issue_status", {
      entity_id: submitted.remote_entity_id,
      skip_sync: true,
    });
    expect(maintainerStatus.title).toBe(title);
    expect(messageBodies(maintainerStatus)).toContain(body);
  }, 120_000);
});
