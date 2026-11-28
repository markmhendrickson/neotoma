/**
 * Build a Content-Disposition header value from a stored file name.
 *
 * Stored names can hold any Unicode text. Node rejects header values with
 * characters above U+00FF and most control characters (ERR_INVALID_CHAR), so a
 * raw name in the header fails the response. Per RFC 6266 / RFC 5987 this sends
 * an ASCII `filename` fallback plus a `filename*=UTF-8''` percent-encoded name.
 * Control characters are dropped from both forms.
 */

// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function asciiFallback(value: string): string {
  return (
    value
      .normalize("NFKD")
      // Drop combining marks left by decomposition (e.g. "e\u0301" -> "e").
      .replace(/[\u0300-\u036f]/g, "")
      // Anything outside printable ASCII, plus quote and backslash, becomes "_".
      .replace(/[^\x20-\x7e]|["\\]/g, "_")
  );
}

export function buildContentDisposition(
  disposition: "inline" | "attachment",
  storedName: string | null | undefined,
  defaultName: string
): string {
  const cleaned = (storedName ?? "").replace(CONTROL_CHARS, "").trim();
  const name = cleaned || defaultName.replace(CONTROL_CHARS, "");
  const fallback = asciiFallback(name) || "download";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}
