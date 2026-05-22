/**
 * Build the Inspector SPA URL for the feedback admin unlock confirmation page.
 * The page calls GET /admin/feedback/auth/session?challenge=… with credentials
 * so the API can set the httpOnly admin cookie (same behavior as the legacy
 * ?feedback_unlock_challenge= flow on /feedback).
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultInspectorBaseFromApi(apiBaseUrl: string): string {
  const fromEnv = process.env.NEOTOMA_INSPECTOR_BASE_URL?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  let origin: string;
  try {
    origin = new URL(apiBaseUrl).origin;
  } catch {
    return trimTrailingSlash(apiBaseUrl);
  }

  const basePath =
    (process.env.NEOTOMA_INSPECTOR_BASE_PATH?.trim() || "/inspector").replace(/\/+$/, "") ||
    "/inspector";
  const normalizedPath = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return `${origin}${normalizedPath}`;
}

export function buildInspectorFeedbackAdminUnlockPageUrl(options: {
  apiBaseUrl: string;
  challenge: string;
  /** Override full inspector root (origin + basename), e.g. http://localhost:5175/inspector */
  inspectorBaseUrl?: string;
}): string {
  const challenge = options.challenge.trim();
  if (!challenge) {
    throw new Error("Challenge is required to build the Inspector unlock URL.");
  }
  const base = trimTrailingSlash(
    (options.inspectorBaseUrl?.trim() || defaultInspectorBaseFromApi(options.apiBaseUrl)).trim()
  );
  const path = `${base}/feedback/admin-unlock`;
  const url = new URL(path);
  url.searchParams.set("challenge", challenge);
  return url.toString();
}
