import { RestProviderClient } from './base.js';
import type { FetchUpdatesInput, FetchUpdatesResult, ProviderRecord } from './types.js';

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  completed?: boolean;
  completed_at?: string;
  due_on?: string;
  due_at?: string;
  start_on?: string;
  permalink_url?: string;
  modified_at?: string;
  created_at?: string;
  assignee?: { gid: string; name: string } | null;
  projects?: Array<{ gid: string; name: string }>;
  tags?: Array<{ gid: string; name: string }>;
  custom_fields?: Array<Record<string, unknown>>;
}

interface AsanaResponse {
  data?: AsanaTask[];
  next_page?: { offset?: string };
}

export class AsanaProviderClient extends RestProviderClient {
  readonly id = 'asana';
  readonly capabilities = ['tasks'] as const;
  readonly defaultRecordType = 'task';

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    const token = this.requireAccessToken(input.secrets);
    const workspace = this.requireField(
      (input.connector.metadata?.workspaceGid as string) ??
        (input.secrets?.workspaceGid as string) ??
        (input.secrets?.workspace as string) ??
        (input.connector.metadata?.workspace as string),
      'workspaceGid'
    );

    const limit = Math.min(input.limit ?? 50, 100);
    const params = new URLSearchParams({
      workspace,
      assignee: 'me',
      limit: `${limit}`,
      opt_fields:
        'gid,name,notes,completed,completed_at,due_on,due_at,start_on,permalink_url,modified_at,created_at,assignee,projects,tags,custom_fields',
    });

    if (input.since) {
      params.set('modified_since', new Date(input.since).toISOString());
    }
    if (typeof input.cursor === 'string') {
      params.set('offset', input.cursor);
    }

    const url = `https://app.asana.com/api/1.0/tasks?${params.toString()}`;
    const response = await this.fetchJson<AsanaResponse>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const records: ProviderRecord[] = (response.data ?? []).map((task) => ({
      type: 'task',
      externalSource: 'asana',
      externalId: task.gid,
      properties: {
        provider: 'asana',
        task_gid: task.gid,
        name: task.name,
        notes: task.notes ?? '',
        completed: task.completed ?? false,
        completed_at: task.completed_at ?? null,
        due_on: task.due_on ?? null,
        due_at: task.due_at ?? null,
        start_on: task.start_on ?? null,
        permalink_url: task.permalink_url ?? null,
        modified_at: task.modified_at ?? null,
        created_at: task.created_at ?? null,
        assignee: task.assignee ?? null,
        projects: task.projects ?? [],
        tags: task.tags ?? [],
        custom_fields: task.custom_fields ?? [],
      },
    }));

    return {
      records: this.mapRecordsWithSource(records),
      nextCursor: response.next_page?.offset ?? null,
      hasMore: Boolean(response.next_page?.offset),
      raw: response,
    };
  }
}




