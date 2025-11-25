type AnalyticsPayload = Record<string, unknown>;

const EVENT_NAME = 'neotoma:analytics';

function dispatchAnalyticsEvent(event: string, payload?: AnalyticsPayload) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') {
    return;
  }
  const detail = { event, payload };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function trackEvent(event: string, payload?: AnalyticsPayload): void {
  dispatchAnalyticsEvent(event, payload);
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, payload);
  }
}


