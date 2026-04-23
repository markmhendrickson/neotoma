/**
 * HTTP transport that calls `agent.neotoma.io` (or a `netlify dev` stub).
 *
 * Auth: AGENT_SITE_BEARER on submit; access_token query on status.
 */

import type {
  FeedbackStatusResponse,
  FeedbackTransport,
  SubmitFeedbackArgs,
  SubmitFeedbackResponse,
} from "./feedback/types.js";

export class HttpFeedbackTransport implements FeedbackTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly bearer: string,
  ) {}

  async submit(args: SubmitFeedbackArgs, _submitterId: string): Promise<SubmitFeedbackResponse> {
    const url = this.baseUrl.replace(/\/$/, "") + "/feedback/submit";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.bearer}`,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`submit_feedback HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as SubmitFeedbackResponse;
  }

  async status(accessToken: string): Promise<FeedbackStatusResponse> {
    const url =
      this.baseUrl.replace(/\/$/, "") +
      `/feedback/status?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`get_feedback_status HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as FeedbackStatusResponse;
  }
}
