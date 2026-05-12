import { expect } from "vitest";

import type { McpHttpClient } from "./two_server_fixture.js";

export type SubmitIssueResult = {
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

export type AddIssueMessageResult = {
  github_comment_id: string | null;
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
};

export type IssueStatusResult = {
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

export function messageBodies(status: IssueStatusResult): string[] {
  return status.messages.map((message) => message.body);
}

export function expectMessageBodiesOnce(status: IssueStatusResult, expectedBodies: string[]): void {
  const bodies = messageBodies(status);
  for (const body of expectedBodies) {
    expect(bodies.filter((candidate) => candidate === body)).toHaveLength(1);
  }
}

export async function submitIssue(
  client: McpHttpClient,
  input: {
    title: string;
    body: string;
    visibility: "private" | "public";
    labels?: string[];
  },
): Promise<SubmitIssueResult> {
  return client.callTool<SubmitIssueResult>("submit_issue", input);
}

export async function addIssueMessage(
  client: McpHttpClient,
  input: {
    entity_id: string;
    body: string;
    guest_access_token?: string;
  },
): Promise<AddIssueMessageResult> {
  return client.callTool<AddIssueMessageResult>("add_issue_message", input);
}

export async function getIssueStatus(
  client: McpHttpClient,
  input: {
    entity_id: string;
    guest_access_token?: string;
    skip_sync?: boolean;
  },
): Promise<IssueStatusResult> {
  return client.callTool<IssueStatusResult>("get_issue_status", input);
}
