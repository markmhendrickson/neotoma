/**
 * True when the `Accept` header indicates the caller wants HTML. Defaults to
 * false (JSON) so tools like `curl` without an explicit `Accept` get the
 * structured payload.
 */
export function wantsHtml(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  const value = acceptHeader.toLowerCase();
  // `text/html` anywhere takes priority; `*/*` without html stays JSON.
  if (value.includes("text/html")) return true;
  if (value.includes("application/xhtml+xml")) return true;
  return false;
}
