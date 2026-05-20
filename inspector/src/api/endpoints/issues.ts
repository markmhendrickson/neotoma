import { post } from "../client";

export type IssueBulkItemResult = {
  entity_id: string;
  ok: boolean;
  github_closed?: boolean;
  error?: string;
};

export type IssuesBulkResponse = {
  results: IssueBulkItemResult[];
};

export function bulkCloseIssues(entityIds: string[]) {
  return post<IssuesBulkResponse>("/issues/bulk_close", { entity_ids: entityIds });
}

export function bulkRemoveIssues(entityIds: string[]) {
  return post<IssuesBulkResponse>("/issues/bulk_remove", { entity_ids: entityIds });
}

export type IssuesAddMessageResponse = {
  github_comment_id: string | null;
  message_entity_id: string;
  pushed_to_github: boolean;
  submitted_to_neotoma: boolean;
};

export async function issuesAddMessage(payload: {
  entity_id?: string;
  issue_number?: number;
  body: string;
}): Promise<IssuesAddMessageResponse> {
  try {
    return await post<IssuesAddMessageResponse>("/issues/add_message", payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("missing route") && msg.includes("/issues/add_message")) {
      return await post<IssuesAddMessageResponse>("/api/issues/add_message", payload);
    }
    throw err;
  }
}
