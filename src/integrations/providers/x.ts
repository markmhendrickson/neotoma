import { RestProviderClient } from "./base.js";
import type {
  FetchUpdatesInput,
  FetchUpdatesResult,
  ProviderRecord,
} from "./types.js";

interface XTweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: Record<string, unknown>;
  attachments?: { media_keys?: string[] };
  entities?: Record<string, unknown>;
  author_id?: string;
  lang?: string;
  possibly_sensitive?: boolean;
}

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  duration_ms?: number;
  width?: number;
  height?: number;
}

interface XApiResponse {
  data?: XTweet[];
  includes?: { media?: XMedia[] };
  meta?: { next_token?: string };
}

export class XProviderClient extends RestProviderClient {
  readonly id = "x";
  readonly capabilities = ["messages", "media"] as const;
  readonly defaultRecordType = "message";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    const token = this.requireAccessToken(input.secrets);
    const userId = this.requireField(
      (input.connector.metadata?.userId as string) ??
        (input.secrets?.userId as string) ??
        (input.secrets?.user_id as string),
      "userId",
    );

    const limit = Math.min(input.limit ?? 100, 100);
    const params = new URLSearchParams({
      max_results: `${limit}`,
      "tweet.fields":
        "created_at,public_metrics,attachments,entities,author_id,lang,possibly_sensitive",
      expansions: "attachments.media_keys",
      "media.fields":
        "media_key,type,url,preview_image_url,duration_ms,width,height,alt_text",
    });

    if (input.since) {
      params.set("start_time", new Date(input.since).toISOString());
    }
    if (
      input.cursor &&
      typeof input.cursor === "object" &&
      "pagination_token" in input.cursor
    ) {
      params.set(
        "pagination_token",
        String((input.cursor as any).pagination_token),
      );
    }

    const url = `https://api.twitter.com/2/users/${userId}/tweets?${params.toString()}`;
    const response = await this.fetchJson<XApiResponse>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const mediaLookup = new Map(
      (response.includes?.media ?? []).map((media) => [media.media_key, media]),
    );

    const records: ProviderRecord[] = (response.data ?? []).map((tweet) => {
      const mediaKeys = tweet.attachments?.media_keys ?? [];
      const media = mediaKeys
        .map((key) => mediaLookup.get(key))
        .filter(Boolean) as XMedia[];
      const fileUrls = media
        .map((item) => item.url || item.preview_image_url)
        .filter((value): value is string => Boolean(value));

      return {
        type: "message",
        externalSource: "x",
        externalId: tweet.id,
        properties: {
          provider: "x",
          tweet_id: tweet.id,
          author_id: tweet.author_id ?? userId,
          text: tweet.text,
          created_at: tweet.created_at,
          language: tweet.lang,
          stats: tweet.public_metrics,
          possibly_sensitive: tweet.possibly_sensitive,
          media: media.map((item) => ({
            media_key: item.media_key,
            type: item.type,
            url: item.url ?? item.preview_image_url ?? null,
            duration_ms: item.duration_ms ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
          })),
          entities: tweet.entities,
          raw: tweet,
        },
        fileUrls,
      };
    });

    return {
      records: this.mapRecordsWithSource(records),
      nextCursor: response.meta?.next_token
        ? { pagination_token: response.meta.next_token }
        : null,
      hasMore: Boolean(response.meta?.next_token),
      raw: response,
    };
  }
}
