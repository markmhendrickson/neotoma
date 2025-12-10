## Marketing Automation Implementation Guide

_(Concrete Steps to Address Missing Components)_

---

### Purpose

This document provides step-by-step implementation guidance to address the four missing components for marketing automation:

1. Social media posting APIs (current X provider only reads)
2. Content generation from release data
3. Automated posting workflow
4. Performance measurement integration

---

### 1. Social Media Posting APIs

#### 1.1 Extend X Provider with Write Capabilities

**Current State**: `src/integrations/providers/x.ts` only implements `fetchUpdates()` (read-only)

**Implementation Steps**:

1. **Add posting method to XProviderClient**:

**Compatibility**: ✅ Fully compatible. `XProviderClient` extends `RestProviderClient` which provides:

- `requireAccessToken()` - for token extraction from secrets
- `fetchJson()` - for HTTP requests with retry logic
- Protected methods that can be used by subclasses

The new methods are **additive** (don't modify existing interface) and follow the same patterns as `fetchUpdates()`.

```typescript
// Add to src/integrations/providers/x.ts

import { setTimeout as delay } from 'node:timers/promises';
import type { ConnectorSecrets } from '../../services/connectors.js';

interface PostTweetInput {
  text: string;
  replyToTweetId?: string;
  mediaIds?: string[];
}

interface PostTweetResult {
  tweetId: string;
  text: string;
  createdAt: string;
}

interface PostTweetResponse {
  data: {
    id: string;
    text: string;
    created_at: string;
  };
}

// Add these methods to XProviderClient class:

async postTweet(input: PostTweetInput, secrets: ConnectorSecrets | null): Promise<PostTweetResult> {
  const token = this.requireAccessToken(secrets);

  // Twitter API v2 POST /2/tweets endpoint
  // Documentation: https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
  // Required: OAuth 2.0 with tweet.write scope
  // Endpoint: POST https://api.twitter.com/2/tweets

  const body: any = { text: input.text };

  // Reply to existing tweet
  if (input.replyToTweetId) {
    body.reply = { in_reply_to_tweet_id: input.replyToTweetId };
  }

  // Attach media (requires media_ids from media upload API)
  if (input.mediaIds && input.mediaIds.length > 0) {
    body.media = { media_ids: input.mediaIds };
  }

  // Note: fetchJson handles POST requests - it passes ...init to fetch()
  const response = await this.fetchJson<PostTweetResponse>(
    'https://api.twitter.com/2/tweets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  return {
    tweetId: response.data.id,
    text: response.data.text,
    createdAt: response.data.created_at,
  };
}

async postThread(tweets: string[], secrets: ConnectorSecrets | null): Promise<PostTweetResult[]> {
  const results: PostTweetResult[] = [];
  let replyToTweetId: string | undefined;

  for (const tweetText of tweets) {
    const result = await this.postTweet(
      { text: tweetText, replyToTweetId },
      secrets
    );
    results.push(result);
    replyToTweetId = result.tweetId;
    // Small delay between tweets in thread (1 second)
    await delay(1000);
  }

  return results;
}
```

**Key Compatibility Points**:

- ✅ Uses `this.requireAccessToken()` from base class
- ✅ Uses `this.fetchJson()` from base class (handles POST with body)
- ✅ Follows same error handling patterns
- ✅ Doesn't modify `ProviderClient` interface (additive methods)
- ✅ Uses same `ConnectorSecrets` type as `fetchUpdates()`

**X API v2 Support**:

- ✅ **POST `/2/tweets` endpoint exists** - Official Twitter API v2 endpoint
- ✅ **OAuth 2.0 Bearer token** - Same auth method as `fetchUpdates()`
- ✅ **Request/Response format** - Matches API documentation
- ✅ **Thread support** - Via `reply.in_reply_to_tweet_id` parameter
- ⚠️ **Media upload** - Requires separate OAuth 1.0a endpoint (can defer to Phase 2)
- ⚠️ **Rate limits** - Vary by API tier (Free: 1,500 tweets/month)

**API Documentation**: https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets

2. **Update OAuth scopes**:

**Current**: `tweet.read`, `users.read` (read-only)  
**Required for posting**: `tweet.read`, `tweet.write`, `users.read`

**API Requirements**:

- Twitter API v2 supports POST `/2/tweets` endpoint ✅
- Requires OAuth 2.0 authentication with `tweet.write` scope ✅
- Endpoint: `POST https://api.twitter.com/2/tweets` ✅
- Request body: `{ text: string, reply?: { in_reply_to_tweet_id: string }, media?: { media_ids: string[] } }` ✅
- Response: `{ data: { id: string, text: string, created_at: string } }` ✅

**Update**: `src/integrations/providers/metadata.ts` OAuth scopes:

```typescript
// Update oauthScopes from:
oauthScopes: ["tweet.read", "users.read"];

// To:
oauthScopes: ["tweet.read", "tweet.write", "users.read"];
```

**API Limitations**:

- Rate limit: Varies by tier (Free tier: 1,500 tweets/month, Basic: 3,000/month)
- Character limit: 280 characters per tweet
- Thread limit: No official limit, but rate limits apply
- Media: Requires separate media upload API call first

3. **Add media upload support** (optional, for images):

**Twitter Media Upload API**:

- Endpoint: `POST https://upload.twitter.com/1.1/media/upload.json`
- Requires: OAuth 1.0a (not OAuth 2.0) for media upload
- Format: `multipart/form-data`
- Returns: `media_id_string` for use in `postTweet()`

**Note**: Media upload uses OAuth 1.0a, which is different from OAuth 2.0 used for tweet posting. This requires additional implementation.

```typescript
async uploadMedia(filePath: string, secrets: ConnectorSecrets): Promise<string> {
  // Twitter media upload API v1.1
  // Endpoint: POST https://upload.twitter.com/1.1/media/upload.json
  // Requires: OAuth 1.0a (different from OAuth 2.0 for tweets)
  // Format: multipart/form-data
  // Returns: media_id_string

  // Implementation requires:
  // 1. OAuth 1.0a signing (different from OAuth 2.0 Bearer token)
  // 2. Multipart form data handling
  // 3. File reading and streaming

  // For MVP, can skip media upload and post text-only tweets
  throw new Error('Media upload not yet implemented - requires OAuth 1.0a');
}
```

**Alternative**: For MVP, post text-only tweets (no media). Add media support in Phase 2.

#### 1.2 Create LinkedIn Provider Client

**New File**: `src/integrations/providers/linkedin.ts`

```typescript
import { RestProviderClient } from "./base.js";
import type { ConnectorSecrets } from "../../services/connectors.js";

interface PostLinkedInInput {
  text: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
}

interface PostLinkedInResult {
  postId: string;
  text: string;
  createdAt: string;
}

export class LinkedInProviderClient extends RestProviderClient {
  readonly id = "linkedin";
  readonly capabilities = ["messages"] as const;
  readonly defaultRecordType = "message";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    // Read implementation (if needed)
    throw new Error("LinkedIn read not implemented");
  }

  async postUpdate(
    input: PostLinkedInInput,
    secrets: ConnectorSecrets
  ): Promise<PostLinkedInResult> {
    const token = this.requireAccessToken(secrets);
    const userId = this.requireField(secrets?.userId as string, "userId");

    // LinkedIn API v2 posting
    const response = await this.fetchJson<{ id: string }>(
      `https://api.linkedin.com/v2/ugcPosts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: `urn:li:person:${userId}`,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: input.text,
              },
              shareMediaCategory: "NONE",
            },
          },
          visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility":
              input.visibility || "PUBLIC",
          },
        }),
      }
    );

    return {
      postId: response.id,
      text: input.text,
      createdAt: new Date().toISOString(),
    };
  }
}
```

**OAuth Setup**:

- Create LinkedIn app at https://www.linkedin.com/developers/
- Request `w_member_social` scope (write posts)
- Store credentials in environment variables

#### 1.3 Create Product Hunt Provider Client

**New File**: `src/integrations/providers/product_hunt.ts`

```typescript
import { RestProviderClient } from "./base.js";
import type { ConnectorSecrets } from "../../services/connectors.js";

interface PostProductHuntInput {
  name: string;
  tagline: string;
  description: string;
  topics: string[];
  website: string;
  screenshotUrls: string[];
}

interface PostProductHuntResult {
  postId: string;
  url: string;
}

export class ProductHuntProviderClient extends RestProviderClient {
  readonly id = "product_hunt";
  readonly capabilities = ["messages"] as const;
  readonly defaultRecordType = "message";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    throw new Error("Product Hunt read not implemented");
  }

  async submitProduct(
    input: PostProductHuntInput,
    secrets: ConnectorSecrets
  ): Promise<PostProductHuntResult> {
    const token = this.requireAccessToken(secrets);

    // Product Hunt API (check current API docs for exact endpoint)
    const response = await this.fetchJson<{
      post: { id: string; url: string };
    }>("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
            mutation CreatePost($input: CreatePostInput!) {
              createPost(input: $input) {
                post { id url }
              }
            }
          `,
        variables: {
          input: {
            name: input.name,
            tagline: input.tagline,
            description: input.description,
            topics: input.topics,
            website: input.website,
            screenshotUrls: input.screenshotUrls,
          },
        },
      }),
    });

    return {
      postId: response.post.id,
      url: response.post.url,
    };
  }
}
```

**Note**: Product Hunt API may require manual submission or different endpoint. Check current API documentation.

#### 1.4 Create Hacker News Provider Client

**New File**: `src/integrations/providers/hacker_news.ts`

```typescript
import { RestProviderClient } from "./base.js";

interface PostHackerNewsInput {
  title: string;
  url?: string;
  text?: string;
}

interface PostHackerNewsResult {
  postId: string;
  url: string;
}

export class HackerNewsProviderClient extends RestProviderClient {
  readonly id = "hacker_news";
  readonly capabilities = ["messages"] as const;
  readonly defaultRecordType = "message";

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    throw new Error("Hacker News read not implemented");
  }

  async submitPost(
    input: PostHackerNewsInput,
    secrets: ConnectorSecrets
  ): Promise<PostHackerNewsResult> {
    // Hacker News uses Firebase API
    // Requires authentication cookie (username/password)
    // Note: HN doesn't have official API, this is unofficial

    const username = this.requireField(secrets?.username as string, "username");
    const password = this.requireField(secrets?.password as string, "password");

    // Login to get session cookie
    const loginResponse = await fetch("https://news.ycombinator.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        acct: username,
        pw: password,
        goto: "news",
      }),
    });

    const cookie = loginResponse.headers.get("set-cookie");
    if (!cookie) {
      throw new Error("Hacker News login failed");
    }

    // Submit post
    const submitResponse = await this.fetchJson<{ id: string }>(
      "https://news.ycombinator.com/submit",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          title: input.title,
          url: input.url || "",
          text: input.text || "",
        }),
      }
    );

    return {
      postId: submitResponse.id,
      url: `https://news.ycombinator.com/item?id=${submitResponse.id}`,
    };
  }
}
```

**Note**: Hacker News doesn't have an official API. Consider manual posting or using unofficial APIs with caution.

---

### 2. Content Generation from Release Data

#### 2.1 Create Marketing Automation Service

**New File**: `src/services/marketing_automation.ts`

```typescript
import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import { config } from "../config.js";

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

interface ReleaseData {
  releaseId: string;
  releaseName: string;
  status: string;
  batches: Array<{ id: string; status: string; featureUnits: string[] }>;
  featureUnits: Array<{ id: string; name: string; status: string }>;
  metrics: {
    batchCompletion: number;
    fuCompletion: number;
    testPassRate: number;
  };
}

interface ContentTemplate {
  platform: string;
  format: "thread" | "post" | "article";
  maxLength?: number;
}

export class MarketingAutomationService {
  async loadReleaseData(releaseId: string): Promise<ReleaseData> {
    const basePath = `docs/releases/in_progress/${releaseId}`;

    // Load release report
    const reportPath = path.join(basePath, "release_report.md");
    const reportContent = await fs.readFile(reportPath, "utf-8");

    // Parse release report (simplified - use proper parser)
    const batches = this.parseBatches(reportContent);
    const featureUnits = this.parseFeatureUnits(reportContent);
    const metrics = this.parseMetrics(reportContent);

    // Load manifest
    const manifestPath = path.join(basePath, "manifest.yaml");
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    const manifest = this.parseYAML(manifestContent);

    return {
      releaseId: manifest.release.id,
      releaseName: manifest.release.name,
      status: manifest.release.status,
      batches,
      featureUnits,
      metrics,
    };
  }

  async generateContent(
    releaseData: ReleaseData,
    template: ContentTemplate
  ): Promise<string> {
    if (!openai) {
      throw new Error("OpenAI API key not configured");
    }

    const prompt = this.buildPrompt(releaseData, template);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: this.getSystemPrompt(template),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content generated");
    }

    return this.formatContent(content, template);
  }

  private buildPrompt(
    releaseData: ReleaseData,
    template: ContentTemplate
  ): string {
    return `
Generate a ${template.platform} ${template.format} for the following release:

Release: ${releaseData.releaseName} (${releaseData.releaseId})
Status: ${releaseData.status}

Key Metrics:
- Batch Completion: ${releaseData.metrics.batchCompletion}%
- Feature Unit Completion: ${releaseData.metrics.fuCompletion}%
- Test Pass Rate: ${releaseData.metrics.testPassRate}%

Completed Feature Units:
${releaseData.featureUnits
  .filter((fu) => fu.status === "Complete")
  .map((fu) => `- ${fu.id}: ${fu.name}`)
  .join("\n")}

Requirements:
- Platform: ${template.platform}
- Format: ${template.format}
${template.maxLength ? `- Max length: ${template.maxLength} characters` : ""}
- Tone: Technical but accessible
- Include call-to-action with UTM parameters
- Highlight key achievements and value proposition
`;
  }

  private getSystemPrompt(template: ContentTemplate): string {
    const platformPrompts: Record<string, string> = {
      twitter:
        "You are a technical marketing writer creating Twitter threads. Use emojis sparingly. Break into logical thread segments. Include technical details but keep accessible.",
      linkedin:
        "You are a professional marketing writer creating LinkedIn posts. Use professional tone. Highlight business value and technical achievements.",
      product_hunt:
        "You are creating a Product Hunt launch description. Focus on what makes the product unique, key features, and value proposition. Include clear tagline.",
      hacker_news:
        'You are creating a "Show HN" post for Hacker News. Be technical, honest, and direct. Focus on what you built and why it matters.',
    };

    return (
      platformPrompts[template.platform] ||
      "You are a marketing content writer."
    );
  }

  private formatContent(content: string, template: ContentTemplate): string {
    if (template.format === "thread") {
      // Split into thread segments (280 chars per tweet)
      return this.splitIntoThread(content);
    }
    return content;
  }

  private splitIntoThread(content: string): string {
    // Simple thread splitting (improve with better logic)
    const sentences = content.split(/[.!?]\s+/);
    const threads: string[] = [];
    let currentThread = "";

    for (const sentence of sentences) {
      if ((currentThread + sentence).length > 250) {
        if (currentThread) threads.push(currentThread.trim());
        currentThread = sentence;
      } else {
        currentThread += (currentThread ? " " : "") + sentence;
      }
    }
    if (currentThread) threads.push(currentThread.trim());

    return threads.join("\n\n---\n\n");
  }

  private parseBatches(
    content: string
  ): Array<{ id: string; status: string; featureUnits: string[] }> {
    // Simplified parser - implement proper markdown parsing
    const batchMatches = content.matchAll(
      /\| Batch ID \| Feature Units \| Status \|/g
    );
    // Extract batch data from markdown table
    return [];
  }

  private parseFeatureUnits(
    content: string
  ): Array<{ id: string; name: string; status: string }> {
    // Simplified parser - implement proper markdown parsing
    return [];
  }

  private parseMetrics(content: string): {
    batchCompletion: number;
    fuCompletion: number;
    testPassRate: number;
  } {
    // Extract metrics from report
    return { batchCompletion: 0, fuCompletion: 0, testPassRate: 0 };
  }

  private parseYAML(content: string): any {
    // Use yaml parser library
    return {};
  }
}
```

#### 2.2 Content Templates

**New File**: `src/services/marketing_templates.ts`

```typescript
export const CONTENT_TEMPLATES = {
  twitter_launch: {
    platform: "twitter",
    format: "thread",
    maxLength: 280 * 10, // 10 tweets max
    systemPrompt:
      "Create an engaging Twitter thread announcing a product release.",
  },
  linkedin_launch: {
    platform: "linkedin",
    format: "post",
    maxLength: 3000,
    systemPrompt:
      "Create a professional LinkedIn post highlighting technical achievements.",
  },
  product_hunt_launch: {
    platform: "product_hunt",
    format: "post",
    systemPrompt: "Create a compelling Product Hunt launch description.",
  },
  hacker_news_show_hn: {
    platform: "hacker_news",
    format: "post",
    maxLength: 2000,
    systemPrompt: 'Create a "Show HN" post that is technical and honest.',
  },
} as const;
```

---

### 3. Automated Posting Workflow

#### 3.1 Create Workflow Orchestrator

**New File**: `src/services/marketing_workflow.ts`

```typescript
import { MarketingAutomationService } from "./marketing_automation.js";
import { XProviderClient } from "../integrations/providers/x.js";
import { LinkedInProviderClient } from "../integrations/providers/linkedin.js";
import { CONTENT_TEMPLATES } from "./marketing_templates.js";
import type { ConnectorSecrets } from "./connectors.js";

interface PostingSchedule {
  platform: string;
  time: string; // ISO time or relative (e.g., "00:01 PST")
  template: string;
}

export class MarketingWorkflow {
  private automationService: MarketingAutomationService;
  private providers: Map<string, any>;

  constructor() {
    this.automationService = new MarketingAutomationService();
    this.providers = new Map([
      ["twitter", new XProviderClient()],
      ["linkedin", new LinkedInProviderClient()],
    ]);
  }

  async executeLaunchWorkflow(
    releaseId: string,
    schedule: PostingSchedule[],
    secrets: Record<string, ConnectorSecrets>
  ): Promise<void> {
    // Load release data
    const releaseData = await this.automationService.loadReleaseData(releaseId);

    // Generate content for each scheduled post
    const posts = await Promise.all(
      schedule.map(async (item) => {
        const template =
          CONTENT_TEMPLATES[item.template as keyof typeof CONTENT_TEMPLATES];
        const content = await this.automationService.generateContent(
          releaseData,
          template
        );
        return { ...item, content };
      })
    );

    // Schedule and post
    for (const post of posts) {
      await this.schedulePost(post, secrets[post.platform]);
    }
  }

  private async schedulePost(
    post: PostingSchedule & { content: string },
    secrets: ConnectorSecrets
  ): Promise<void> {
    const provider = this.providers.get(post.platform);
    if (!provider) {
      throw new Error(`Provider not found: ${post.platform}`);
    }

    // Parse time and schedule
    const postTime = this.parseTime(post.time);
    const now = Date.now();
    const delay = postTime.getTime() - now;

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Post based on platform
    if (post.platform === "twitter") {
      if (post.content.includes("---")) {
        // Thread
        const tweets = post.content.split("---").map((t) => t.trim());
        await provider.postThread(tweets, secrets);
      } else {
        await provider.postTweet({ text: post.content }, secrets);
      }
    } else if (post.platform === "linkedin") {
      await provider.postUpdate({ text: post.content }, secrets);
    }
  }

  private parseTime(timeStr: string): Date {
    // Parse "00:01 PST" or ISO string
    // Implementation depends on timezone handling
    return new Date();
  }
}
```

#### 3.2 Integrate with Release Orchestrator

**Update**: `scripts/release_orchestrator.js`

Add hook after release deployment:

```javascript
// After release status changes to 'deployed'
if (releaseStatus === "deployed" && manifest.release.marketing_required) {
  console.log("[INFO] Triggering marketing automation");

  // Import marketing workflow (if implemented)
  // const { MarketingWorkflow } = await import('../src/services/marketing_workflow.js');
  // const workflow = new MarketingWorkflow();
  // await workflow.executeLaunchWorkflow(RELEASE_ID, schedule, secrets);

  console.log("[INFO] Marketing automation triggered (not yet implemented)");
}
```

---

### 4. Performance Measurement Integration

#### 4.1 Create Metrics Collection Service

**New File**: `src/services/marketing_metrics.ts`

```typescript
interface PostMetrics {
  postId: string;
  platform: string;
  postedAt: string;
  engagement: {
    likes?: number;
    retweets?: number;
    shares?: number;
    comments?: number;
    clicks?: number;
  };
  utmParams: {
    source: string;
    medium: string;
    campaign: string;
  };
}

export class MarketingMetricsService {
  async trackPost(
    postId: string,
    platform: string,
    utmParams: Record<string, string>
  ): Promise<void> {
    // Store post tracking data
    // Link to analytics system
  }

  async collectEngagementMetrics(
    postId: string,
    platform: string
  ): Promise<PostMetrics["engagement"]> {
    const provider = this.getProvider(platform);

    switch (platform) {
      case "twitter":
        return await this.collectTwitterMetrics(postId, provider);
      case "linkedin":
        return await this.collectLinkedInMetrics(postId, provider);
      default:
        return {};
    }
  }

  private async collectTwitterMetrics(
    tweetId: string,
    provider: XProviderClient
  ): Promise<any> {
    // Use Twitter API to fetch tweet metrics
    const response = await provider.fetchJson(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return {
      likes: response.data.public_metrics?.like_count,
      retweets: response.data.public_metrics?.retweet_count,
      replies: response.data.public_metrics?.reply_count,
    };
  }

  async generatePerformanceReport(releaseId: string): Promise<string> {
    // Aggregate metrics from all posts
    // Generate markdown report
    return `# Marketing Performance Report\n\n...`;
  }
}
```

#### 4.2 UTM Tracking Integration

**Update**: Signup analytics to capture UTM parameters

```typescript
// In signup handler
const utmSource = req.query.utm_source;
const utmMedium = req.query.utm_medium;
const utmCampaign = req.query.utm_campaign;

// Store with signup record
await db.signups.create({
  userId,
  utmSource,
  utmMedium,
  utmCampaign,
  createdAt: new Date(),
});
```

#### 4.3 Link Metrics to Signups

```typescript
async function linkPostToSignups(
  postId: string,
  campaign: string
): Promise<void> {
  // Query signups with matching UTM campaign
  const signups = await db.signups.findMany({
    where: { utmCampaign: campaign },
  });

  // Link to post metrics
  await db.postMetrics.update({
    where: { postId },
    data: { signupCount: signups.length },
  });
}
```

---

### 5. Implementation Priority

**Phase 1 (MVP - Manual with Automation Prep)**:

1. ✅ Extend X provider with `postTweet()` method (fully compatible with existing architecture)
2. ✅ Create content generation service skeleton
3. ✅ Create workflow orchestrator skeleton
4. ⏳ Manual posting with generated content

**Architecture Compatibility**:

- ✅ `XProviderClient` architecture supports posting methods
- ✅ Base class (`RestProviderClient`) provides all needed utilities
- ✅ No interface changes required (additive methods only)
- ✅ Follows existing patterns from `fetchUpdates()` implementation

**Phase 2 (Post-MVP - Full Automation)**:

**Timeline**: After v1.0.0 MVP launch (evaluate manual marketing performance first)

**Goal**: Fully automated marketing workflow that generates content, posts to all platforms, and measures performance without manual intervention.

#### 2.1 Complete Social Media Provider Clients

**Priority**: P0 platforms first, then P1/P2

**2.1.1 LinkedIn Provider** (`src/integrations/providers/linkedin.ts`):

- ✅ Create `LinkedInProviderClient` class (structure defined in Section 1.2)
- Implement `postUpdate()` method with LinkedIn API v2 UGC Posts endpoint
- Handle OAuth 2.0 authentication (`w_member_social` scope)
- Test with LinkedIn Developer account
- **Timeline**: Week 1-4 (P1 platform, secondary priority)

**2.1.2 Product Hunt Provider** (`src/integrations/providers/product_hunt.ts`):

- ✅ Create `ProductHuntProviderClient` class (structure defined in Section 1.3)
- Implement `submitProduct()` method with Product Hunt GraphQL API
- Handle OAuth authentication
- Support product submission with screenshots, tagline, description
- **Timeline**: Day 0 launch (P0 platform, critical for launch announcement)
- **Note**: May require manual submission if API unavailable

**2.1.3 Hacker News Provider** (`src/integrations/providers/hacker_news.ts`):

- ✅ Create `HackerNewsProviderClient` class (structure defined in Section 1.4)
- Implement `submitPost()` method with HN Firebase API
- Handle cookie-based authentication (username/password)
- Support "Show HN" format posts
- **Timeline**: Day 0 launch (P0 platform, critical for launch announcement)
- **Note**: HN has no official API - may require manual posting or unofficial API

**2.1.4 Indie Hackers Integration**:

- Research Indie Hackers API availability
- If API exists: Create `IndieHackersProviderClient`
- If no API: Manual posting workflow with content generation
- **Timeline**: Day 0 launch (P0 platform)

**2.1.5 Reddit/Discord Integration** (P1 platforms):

- Reddit: Create `RedditProviderClient` with Reddit API
- Discord: Create `DiscordProviderClient` with Discord Bot API
- **Timeline**: Week 1-4 (P1 platforms, organic growth phase)

#### 2.2 Implement Full Content Generation Service

**File**: `src/services/marketing_automation.ts`

**2.2.1 Release Report Parsing**:

- Implement proper markdown parser for `release_report.md`
- Extract batch completion data from markdown tables
- Extract feature unit status and completion percentages
- Extract integration test results
- Parse metrics (batch completion %, FU completion %, test pass rate)
- **Dependencies**: Markdown parser library (`marked` or `remark`)

**2.2.2 Manifest Parsing**:

- Parse `manifest.yaml` for release metadata
- Extract release ID, name, status, target date
- Extract feature unit list and dependencies
- **Dependencies**: YAML parser (`js-yaml`)

**2.2.3 Content Generation with LLM**:

- ✅ Basic structure defined in Section 2.1
- Enhance prompts with release-specific context:
  - Key achievements and completed feature units
  - Technical highlights (deterministic extraction, MCP integration)
  - Value propositions for target segments
- Implement platform-specific formatting:
  - Twitter: Thread splitting (280 chars per tweet)
  - LinkedIn: Professional tone, business value focus
  - Product Hunt: Tagline + description format
  - Hacker News: Technical, honest "Show HN" format
- Add UTM parameter injection to all content
- **Dependencies**: OpenAI API (already configured)

**2.2.4 Content Templates** (`src/services/marketing_templates.ts`):

- ✅ Structure defined in Section 2.2
- Create templates for:
  - Launch announcement (all platforms)
  - Feature highlight posts
  - Metrics showcase posts
  - Technical deep-dive posts
- Template variables: `{releaseId}`, `{releaseName}`, `{metrics}`, `{featureUnits}`, etc.

**2.2.5 Content Quality Validation**:

- Implement content review checks:
  - Character limits per platform
  - UTM parameter presence
  - Call-to-action inclusion
  - Technical accuracy validation
- Optional: Human review flagging for complex content

#### 2.3 Implement Scheduling System

**File**: `src/services/marketing_workflow.ts`

**2.3.1 Timezone-Aware Scheduling**:

- Parse schedule times (e.g., "00:01 PST", "08:00 PST")
- Convert to UTC for scheduling
- Handle timezone conversions correctly
- **Dependencies**: Timezone library (`date-fns-tz` or `luxon`)

**2.3.2 Post Scheduling**:

- Implement queue system for scheduled posts
- Use cron jobs or task queue (e.g., `node-cron`, `bull`)
- Store scheduled posts in database or file system
- Handle retries for failed posts
- **Dependencies**: Scheduling library (`node-cron`)

**2.3.3 Launch Day Sequence**:

- Implement launch day posting sequence per `post_launch_marketing_plan.md`:
  - 00:01 PST: Product Hunt launch
  - 06:00 PST: Hacker News Show HN post
  - 08:00 PST: Twitter announcement thread
  - 09:00 PST: Email to waitlist
  - 10:00 PST: Indie Hacker launch post
  - 12:00 PST: Blog post announcement
- Ensure sequential posting with delays between platforms
- Handle failures gracefully (continue with remaining posts)

**2.3.4 Weekly Organic Growth**:

- Schedule weekly posts for Week 1-4:
  - Twitter threads (use cases, tips, workflows)
  - LinkedIn posts (professional use cases)
  - Reddit/Discord engagement
- Content rotation based on release data and user feedback

#### 2.4 Implement Metrics Collection

**File**: `src/services/marketing_metrics.ts`

**2.4.1 Engagement Metrics Collection**:

- **Twitter**: Use Twitter API v2 to fetch tweet metrics (`public_metrics`)
  - Likes, retweets, replies, quote tweets
  - Click-through rate (if available)
- **LinkedIn**: Use LinkedIn API to fetch post metrics
  - Views, likes, comments, shares
- **Product Hunt**: Track upvotes, comments via Product Hunt API
- **Hacker News**: Track points, comments (if API available)
- **Schedule**: Collect metrics 1 hour, 24 hours, 7 days after posting

**2.4.2 UTM Tracking Integration**:

- Link UTM parameters to signup analytics
- Track signups by UTM source/medium/campaign
- Calculate conversion rates per platform
- **Integration**: Update signup handler to capture UTM params (see Section 4.2)

**2.4.3 Performance Reports**:

- Generate `marketing_performance_report.md`:
  - Post-level metrics (engagement, clicks, signups)
  - Platform-level comparison
  - Campaign-level aggregation
  - Pre vs post-launch comparison
- **Schedule**: Generate reports daily (Week 1), weekly (Week 2-4)

**2.4.4 Metrics Dashboard** (Optional):

- Real-time metrics dashboard
- Visualize engagement trends
- Platform performance comparison
- **Dependencies**: Dashboard framework (optional, can use markdown reports)

#### 2.5 Release Orchestrator Integration

**File**: `scripts/release_orchestrator.js`

**2.5.1 Release Lifecycle Hooks**:

- Add hook when release status changes to `ready_for_deployment`:
  - Trigger pre-launch marketing content generation
  - Schedule pre-launch posts (Week -4 to Week 0)
- Add hook when release status changes to `deployed`:
  - Trigger launch announcement workflow
  - Execute launch day posting sequence
- Add hook for post-launch milestones:
  - Day 1: Waitlist conversion content
  - Week 1-4: Organic growth content

**2.5.2 Configuration Integration**:

- Read `marketing_plan.md` for automation configuration
- Parse platform priorities and schedules
- Load OAuth credentials from environment/secrets
- **Integration**: Use existing manifest loading logic

**2.5.3 Error Handling**:

- Handle API failures gracefully
- Log errors for manual intervention
- Continue with remaining posts if one fails
- Alert on critical failures (launch day posts)

**2.5.4 Manual Override**:

- Support manual trigger: `node scripts/marketing_automation.js <release_id>`
- Support content approval workflow (optional)
- Emergency stop mechanism

#### 2.6 Testing and Validation

**2.6.1 Unit Tests**:

- Test content generation with mock release data
- Test platform-specific formatting
- Test UTM parameter injection
- Test scheduling logic

**2.6.2 Integration Tests**:

- Test posting to test accounts (Twitter, LinkedIn)
- Test full workflow: release → content → post → metrics
- Test error handling and retries

**2.6.3 E2E Tests**:

- Test launch day sequence end-to-end
- Test metrics collection pipeline
- Test UTM tracking → signup flow

#### 2.7 Implementation Checklist

**Pre-Implementation**:

- [ ] Evaluate Phase 1 (manual marketing) performance
- [ ] Set up OAuth apps for all platforms
- [ ] Configure API credentials in environment
- [ ] Install dependencies (`js-yaml`, `marked`, `node-cron`, `date-fns-tz`)

**Provider Clients** (Priority Order):

- [ ] Complete LinkedIn provider (P1, Week 1-4)
- [ ] Complete Product Hunt provider (P0, Day 0)
- [ ] Complete Hacker News provider (P0, Day 0)
- [ ] Complete Indie Hackers integration (P0, Day 0)
- [ ] Complete Reddit/Discord providers (P1, Week 1-4)

**Content Generation**:

- [ ] Implement release report parser
- [ ] Implement manifest parser
- [ ] Enhance LLM prompts with release context
- [ ] Create all content templates
- [ ] Implement content validation

**Scheduling**:

- [ ] Implement timezone-aware scheduling
- [ ] Implement launch day sequence
- [ ] Implement weekly organic growth schedule
- [ ] Test scheduling with dry runs

**Metrics**:

- [ ] Implement engagement metrics collection
- [ ] Integrate UTM tracking with signups
- [ ] Implement performance report generation
- [ ] Test metrics pipeline

**Integration**:

- [ ] Add release orchestrator hooks
- [ ] Integrate with `marketing_plan.md`
- [ ] Test end-to-end workflow
- [ ] Document manual override procedures

**Timeline Estimate**: 2-3 weeks after MVP launch (depending on manual marketing evaluation period)

---

### 6. Quick Start Implementation

**Minimal Viable Implementation** (can be done now):

1. **Extend X provider** (30 minutes):

   - Add `postTweet()` method
   - Test with manual API call

2. **Create content generator** (1 hour):

   - Basic LLM prompt with release data
   - Generate Twitter thread

3. **Manual workflow** (immediate):
   - Generate content
   - Copy/paste to Twitter
   - Track metrics manually

This provides immediate value while building toward full automation.

---

### 7. Dependencies

**Required**:

- OpenAI API key (already configured in codebase)
- Twitter API v2 credentials with write permissions
- OAuth apps for LinkedIn, Product Hunt (if automating)

**Optional**:

- YAML parser library (`js-yaml`)
- Markdown parser (`marked` or `remark`)
- Scheduling library (`node-cron`)

---

### 8. Testing Strategy

1. **Unit Tests**: Test content generation with mock release data
2. **Integration Tests**: Test posting to test accounts
3. **E2E Tests**: Full workflow from release → content → post → metrics

---

### 9. Related Documents

- `marketing_automation_plan.md` — High-level automation plan
- `marketing_plan.md` — Marketing overview
- `post_launch_marketing_plan.md` — Post-launch activities
