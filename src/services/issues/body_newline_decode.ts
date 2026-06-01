/**
 * Body newline decode for the Issues subsystem.
 *
 * Some MCP / API clients double-encode the `body` argument: the agent intends a
 * multi-line markdown body, but the value arrives at the server as a string that
 * has been JSON-string-escaped one extra time. In that mode a real newline is
 * delivered as the two characters backslash + `n` (`\n`), a tab as `\t`, a
 * carriage return as `\r`, a literal backslash as `\\`, and a double quote as
 * `\"`. When that string is then handed to the GitHub REST API (which
 * `JSON.stringify`s it again) the literal `\n` is preserved verbatim and the
 * issue renders as a single run-on block with no markdown structure.
 *
 * `github_client.createIssue` already serializes correctly with `JSON.stringify`,
 * so the defect is upstream: the body retains the literal escape sequence and is
 * never decoded back to real control characters. See issue #1484 (and #356).
 *
 * This module decodes exactly one JSON-string-escape layer, applied at the
 * `submitIssue` / `addIssueMessage` service boundary so the same value reaches
 * BOTH the GitHub mirror and the canonical Neotoma `conversation_message` record.
 * The decode is conservative:
 *
 *   - It is a left-to-right escape scanner, not a naive `replace(/\\n/, "\n")`.
 *     A literal backslash (`\\`) is consumed as one backslash before it can be
 *     misread as the start of `\n`, so documentation that intentionally shows
 *     the two characters backslash + `n` is preserved.
 *   - It only runs when the body looks double-encoded: it contains a decodable
 *     escape sequence AND no real newline. A body that already carries a real
 *     `0x0A` was encoded correctly by the client and is returned untouched.
 *   - It only recognizes the escape sequences a JSON encoder would have emitted
 *     (`\n \r \t \" \\ \/`). Any other backslash run (e.g. a Windows path
 *     fragment `C:\Users`, a regex `\d`, a LaTeX `\alpha`) contains no decodable
 *     sequence on its own, so such bodies fall through unchanged.
 */

const DECODABLE_ESCAPE = /\\[nrt"\\/]/;
const REAL_NEWLINE = /[\r\n]/;

/**
 * Decode one JSON-string-escape layer from an over-escaped issue/comment body.
 *
 * Returns the input unchanged when the body is not double-encoded (already has a
 * real newline, or has no decodable escape sequence at all).
 */
export function decodeOverEscapedBody(body: string): string {
  if (typeof body !== "string" || body.length === 0) return body;

  // Already contains a real line break → the client encoded newlines correctly.
  // Decoding here would risk corrupting intentional literal backslash content.
  if (REAL_NEWLINE.test(body)) return body;

  // No JSON-style escape sequence present → nothing to decode.
  if (!DECODABLE_ESCAPE.test(body)) return body;

  let decoded = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\" || i === body.length - 1) {
      decoded += ch;
      continue;
    }
    const next = body[i + 1];
    switch (next) {
      case "n":
        decoded += "\n";
        i += 1;
        break;
      case "r":
        decoded += "\r";
        i += 1;
        break;
      case "t":
        decoded += "\t";
        i += 1;
        break;
      case '"':
        decoded += '"';
        i += 1;
        break;
      case "/":
        decoded += "/";
        i += 1;
        break;
      case "\\":
        // Consume the escaped backslash as a single literal backslash so the
        // following character cannot be reinterpreted as an escape start.
        decoded += "\\";
        i += 1;
        break;
      default:
        // Unknown escape (e.g. a Windows path `\U`) — preserve the backslash
        // verbatim and let the next iteration handle the following character.
        decoded += ch;
        break;
    }
  }

  return decoded;
}
