/**
 * Transport resolver for `submit_feedback` / `get_feedback_status`.
 *
 * Selection order:
 *   1. Explicit `NEOTOMA_FEEDBACK_TRANSPORT` (`local` | `http`).
 *   2. `local` when `AGENT_SITE_BASE_URL` is unset.
 *   3. `http` otherwise.
 *
 * Kill-switch: `NEOTOMA_FEEDBACK_AUTO_SUBMIT=0` disables auto-submit at the
 * caller level; `submit_feedback` will throw when agents attempt it.
 */

import { HttpFeedbackTransport } from "./feedback_transport_http.js";
import { LocalFeedbackTransport } from "./feedback_transport_local.js";
import {
  autoSubmitSuppressed,
  resolveTransportKind,
  type FeedbackTransport,
} from "./feedback/types.js";

export function isFeedbackAutoSubmitSuppressed(): boolean {
  return autoSubmitSuppressed(process.env);
}

export function resolveFeedbackTransport(): FeedbackTransport {
  const kind = resolveTransportKind(process.env);
  if (kind === "http") {
    const baseUrl = process.env.AGENT_SITE_BASE_URL;
    const bearer = process.env.AGENT_SITE_BEARER;
    if (!baseUrl) throw new Error("AGENT_SITE_BASE_URL must be set for http feedback transport");
    if (!bearer) throw new Error("AGENT_SITE_BEARER must be set for http feedback transport");
    return new HttpFeedbackTransport(baseUrl, bearer);
  }
  return new LocalFeedbackTransport();
}
