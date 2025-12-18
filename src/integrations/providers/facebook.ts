import { RestProviderClient } from "./base.js";
import type {
  FetchUpdatesInput,
  FetchUpdatesResult,
  ProviderRecord,
} from "./types.js";

interface FacebookAttachment {
  media_type?: string;
  media?: {
    image?: { src?: string };
    source?: string;
  };
  target?: { url?: string };
  url?: string;
}

interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  attachments?: { data?: FacebookAttachment[] };
}

interface FacebookResponse {
  data?: FacebookPost[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

export class FacebookProviderClient extends RestProviderClient {
  readonly id = "facebook";
  readonly capabilities = ["messages", "media"] as const;
  readonly defaultRecordType = "message";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    const token = this.requireAccessToken(input.secrets);
    const pageId = (input.connector.metadata?.pageId as string) ?? "me";
    const limit = Math.min(input.limit ?? 50, 50);

    const params = new URLSearchParams({
      fields:
        "id,message,story,created_time,permalink_url,attachments{media_type,media,target,url}",
      limit: `${limit}`,
    });
    if (
      input.cursor &&
      typeof input.cursor === "object" &&
      "after" in input.cursor
    ) {
      params.set("after", String((input.cursor as any).after));
    }

    const url = `https://graph.facebook.com/v18.0/${pageId}/feed?${params.toString()}`;
    const response = await this.fetchJson<FacebookResponse>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const records: ProviderRecord[] = (response.data ?? []).map((post) => {
      const attachments = post.attachments?.data ?? [];
      const fileUrls = attachments
        .map(
          (attachment) =>
            attachment.media?.image?.src ??
            attachment.media?.source ??
            attachment.url,
        )
        .filter((value): value is string => Boolean(value));

      return {
        type: "message",
        externalSource: "facebook",
        externalId: post.id,
        properties: {
          provider: "facebook",
          post_id: post.id,
          message: post.message ?? post.story ?? "",
          story: post.story ?? null,
          created_at: post.created_time ?? null,
          permalink: post.permalink_url ?? null,
          attachments,
        },
        fileUrls,
      };
    });

    return {
      records: this.mapRecordsWithSource(records),
      nextCursor: response.paging?.cursors?.after
        ? { after: response.paging.cursors.after }
        : null,
      hasMore: Boolean(response.paging?.next),
      raw: response,
    };
  }
}
