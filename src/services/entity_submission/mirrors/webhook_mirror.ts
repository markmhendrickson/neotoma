import { logger } from "../../../utils/logger.js";

/**
 * POST JSON snapshot to a configured webhook URL (custom_webhook mirror).
 */
export async function postEntityToWebhookMirror(params: {
  url: string;
  secret?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Neotoma-SubmissionMirror/1.0",
  };
  if (params.secret) {
    headers["X-Neotoma-Webhook-Secret"] = params.secret;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers,
      body: JSON.stringify(params.payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.warn("[webhook_mirror] non-OK response", { status: res.status, url: params.url });
    }
  } catch (err) {
    logger.warn("[webhook_mirror] request failed", {
      url: params.url,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(t);
  }
}
