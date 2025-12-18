import { RestProviderClient } from "./base.js";
import type {
  FetchUpdatesInput,
  FetchUpdatesResult,
  ProviderRecord,
} from "./types.js";

interface InstagramMedia {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  caption?: string;
}

interface InstagramResponse {
  data?: InstagramMedia[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

export class InstagramProviderClient extends RestProviderClient {
  readonly id = "instagram";
  readonly capabilities = ["media", "messages"] as const;
  readonly defaultRecordType = "media_asset";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    const token = this.requireAccessToken(input.secrets);
    const userId = (input.connector.metadata?.userId as string) ?? "me";
    const limit = Math.min(input.limit ?? 50, 50);

    const params = new URLSearchParams({
      fields:
        "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption",
      limit: `${limit}`,
      access_token: token,
    });

    if (
      input.cursor &&
      typeof input.cursor === "object" &&
      "after" in input.cursor
    ) {
      params.set("after", String((input.cursor as any).after));
    }

    const url = `https://graph.instagram.com/${userId}/media?${params.toString()}`;
    const response = await this.fetchJson<InstagramResponse>(url);

    const records: ProviderRecord[] = (response.data ?? []).map((media) => ({
      type: "media_asset",
      externalSource: "instagram",
      externalId: media.id,
      properties: {
        provider: "instagram",
        media_type: media.media_type,
        media_url: media.media_url ?? null,
        thumbnail_url: media.thumbnail_url ?? null,
        permalink: media.permalink ?? null,
        timestamp: media.timestamp ?? null,
        caption: media.caption ?? null,
      },
      fileUrls: [media.media_url, media.thumbnail_url].filter(
        (value): value is string => Boolean(value),
      ),
    }));

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
