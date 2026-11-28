/**
 * Build a Content-Disposition header value from a stored file name.
 *
 * Stored names can hold any Unicode text. Node rejects header values with
 * characters above U+00FF and most control characters (ERR_INVALID_CHAR), so a
 * raw name in the header fails the response. Per RFC 6266 / RFC 5987 this sends
 * an ASCII `filename` fallback plus a `filename*=UTF-8''` percent-encoded name.
 * Control characters and Unicode format characters (category Cf, such as
 * bidirectional controls and zero-width characters) are dropped from both forms,
 * and the name is capped at 255 code points, keeping the extension. Lone UTF-16 surrogates are
 * replaced with U+FFFD first, because encodeURIComponent throws URIError on them.
 */

// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
// Unicode format characters (Cf) include U+202A-U+202E, U+2066-U+2069 and
// zero-width characters such as U+200B-U+200F and U+FEFF.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]|\p{Cf}/gu;

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function toWellFormed(value: string): string {
  return value.replace(LONE_SURROGATE, "\ufffd");
}

// Longest name, in code points, that goes into the header.
export const MAX_NAME_CODE_POINTS = 255;
// Longest suffix after the last "." that is kept as the extension when capping.
const MAX_EXTENSION_CODE_POINTS = 32;

/**
 * Cap a well-formed name at MAX_NAME_CODE_POINTS code points. Counting code
 * points (not UTF-16 units) keeps surrogate pairs whole. The extension after the
 * last "." is kept when there is one.
 */
function capLength(value: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= MAX_NAME_CODE_POINTS) return value;
  const dot = value.lastIndexOf(".");
  if (dot > 0) {
    const extension = Array.from(value.slice(dot));
    if (extension.length <= MAX_EXTENSION_CODE_POINTS) {
      return (
        codePoints.slice(0, MAX_NAME_CODE_POINTS - extension.length).join("") + extension.join("")
      );
    }
  }
  return codePoints.slice(0, MAX_NAME_CODE_POINTS).join("");
}

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
      // Anything outside printable ASCII, plus quote, backslash and "%", becomes "_".
      // "%" is replaced so no client reads the plain fallback as percent-encoded.
      .replace(/[^\x20-\x7e]|["\\%]/g, "_")
  );
}

export function buildContentDisposition(
  disposition: "inline" | "attachment",
  storedName: string | null | undefined,
  defaultName: string
): string {
  const cleaned = toWellFormed(storedName ?? "").replace(CONTROL_CHARS, "").trim();
  const name = capLength(cleaned || toWellFormed(defaultName).replace(CONTROL_CHARS, ""));
  const fallback = asciiFallback(name) || "download";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}
