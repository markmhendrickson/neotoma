// File-input diagnostics for `store()` / `parse_file()` (#2325)
//
// `file_path` is resolved on the *server's* filesystem, never the caller's.
// That was tolerable while every caller was co-located with the server. Since
// the move to a hosted instance the co-located case is the exception, so the
// old failure — `File not found: <path>` — describes the wrong thing: it says
// "your file is missing" when the truth is "this parameter is server-local and
// you are not the server."
//
// This module owns the two decisions that failure needs:
//   1. Is this instance one where `file_path` can plausibly mean the caller's
//      disk? (`isFilesystemLocalToCaller`)
//   2. What should the caller be told instead? (`buildFilePathServerLocalError`)
//
// Both transports — the MCP tool in `src/server.ts` and HTTP `POST /store` in
// `src/actions.ts` — go through here so they fail identically. Divergence
// between the two is what let the HTTP path surface a bare Node `ENOENT`.
//
// Home: `docs/subsystems/errors.md` § `ERR_FILE_PATH_IS_SERVER_LOCAL`.

/**
 * Structured error codes emitted by the file-input path.
 *
 * `ERR_FILE_PATH_IS_SERVER_LOCAL` — the caller passed `file_path` to an
 * instance that cannot see the caller's filesystem.
 *
 * `ERR_FILE_CONTENT_NOT_BASE64` — the caller passed `file_content` that is not
 * valid base64. `Buffer.from(x, "base64")` never throws; it discards invalid
 * characters, so without this check a caller who forgot to encode gets silent
 * corruption and a valid-looking `content_hash`.
 */
export const ERR_FILE_PATH_IS_SERVER_LOCAL = "ERR_FILE_PATH_IS_SERVER_LOCAL";
export const ERR_FILE_CONTENT_NOT_BASE64 = "ERR_FILE_CONTENT_NOT_BASE64";

/**
 * An error carrying a stable machine-readable code alongside its message.
 *
 * Both transports read the structured envelope from `toErrorEnvelope()` so
 * MCP `data.code` and HTTP `error_code` cannot drift. Callers match on the
 * code, never on the prose.
 */
export class FileInputError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "FileInputError";
    this.code = code;
    this.details = details;
  }

  /**
   * Shared envelope for REST + MCP. REST nests fields under `details` via
   * `sendError`; MCP passes this object as `McpError` `data`.
   */
  toErrorEnvelope(): {
    code: string;
    message: string;
    hint?: string;
    [key: string]: unknown;
  } {
    return {
      code: this.code,
      message: this.message,
      ...this.details,
    };
  }
}

/**
 * Whether this instance's filesystem is the same one the caller sees.
 *
 * Deliberately a configuration question, not an inference from the request.
 * Inferring from `req.ip` is wrong behind a proxy — every request arrives from
 * the loopback or the proxy's address, so a hosted instance would conclude it
 * was local and keep emitting the misleading error.
 *
 * Resolution order:
 *   1. `NEOTOMA_FILESYSTEM_LOCAL` — explicit operator override, either
 *      direction. An operator running the server co-located with an agent on a
 *      machine we would otherwise judge remote sets `true`; an operator who
 *      wants the honest error locally sets `false`.
 *   2. Otherwise: local when the process is *not* serving as a deployed
 *      instance. `NEOTOMA_BASE_URL` pointing at a non-loopback host, or
 *      `NODE_ENV=production`, both mean callers reach this server over a
 *      network and their `file_path` is meaningless here.
 *
 * When `NEOTOMA_FILESYSTEM_LOCAL` and `NEOTOMA_BASE_URL` are both unset, this
 * returns `true` (assume local) unless `NODE_ENV=production`. That fail-open
 * default is intentional for co-located dev: a false "remote" verdict would
 * reject a `file_path` that would have worked. The operational risk is that a
 * hosted deployment which forgets `NODE_ENV=production` (and does not set a
 * non-loopback `NEOTOMA_BASE_URL` or an explicit `NEOTOMA_FILESYSTEM_LOCAL=0`)
 * silently reverts to pre-#2325 "File not found" behaviour — operators must
 * set one of those three signals on remote instances.
 *
 * A *malformed* `NEOTOMA_BASE_URL` is different from "unset": the operator
 * intended to configure locality and failed, so we treat that as remote
 * (deny) after logging a warning rather than falling through to allow.
 */
export function isFilesystemLocalToCaller(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.NEOTOMA_FILESYSTEM_LOCAL;
  if (explicit !== undefined && explicit !== "") {
    return !/^(0|false|no|off)$/i.test(explicit.trim());
  }

  const baseUrl = env.NEOTOMA_BASE_URL?.trim();
  if (baseUrl) {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      const isLoopback =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "[::1]" ||
        host.endsWith(".localhost");
      if (!isLoopback) return false;
    } catch {
      // Malformed config is evidence the operator tried to signal locality and
      // got it wrong — lean deny rather than silently treating as unset.
      console.warn(
        `[file_input_diagnostics] NEOTOMA_BASE_URL is set but unparseable (${JSON.stringify(baseUrl)}); treating filesystem as remote`
      );
      return false;
    }
  }

  if (env.NODE_ENV === "production") return false;

  return true;
}

/**
 * The error a remote caller gets for `file_path`.
 *
 * Names the cause (the parameter is server-local) rather than the symptom (a
 * missing file), and names both routes out: upload the bytes for anything
 * large, inline them for anything small.
 */
export function buildFilePathServerLocalError(filePath: string): FileInputError {
  return new FileInputError(
    ERR_FILE_PATH_IS_SERVER_LOCAL,
    `${ERR_FILE_PATH_IS_SERVER_LOCAL}: 'file_path' is resolved on the server's filesystem, ` +
      `not the caller's. This instance is remote, so it cannot read your local path ` +
      `(${filePath}). Upload the bytes instead: POST /sources/upload (multipart/form-data), ` +
      `then pass the returned source_id to store() — or, for small files, inline them with ` +
      `file_content (base64) + mime_type.`,
    { file_path: filePath }
  );
}

/**
 * The error for a `file_path` that really is absent from a local filesystem.
 *
 * Kept distinct from the remote case so the two causes stay legible: this one
 * genuinely means "your file is missing."
 */
export function buildFileNotFoundError(filePath: string): FileInputError {
  return new FileInputError("ERR_FILE_NOT_FOUND", `File not found: ${filePath}`, {
    file_path: filePath,
  });
}

/**
 * Whether a string is valid base64.
 *
 * Node's decoder is permissive to the point of being dangerous here: it strips
 * characters outside the alphabet and decodes whatever remains, so 44
 * characters of plain UTF-8 text decode to 26 bytes of garbage with no error.
 * The result is stored, content-addressed, and hashed — a false success that
 * looks indistinguishable from a real one.
 *
 * The check is a round-trip rather than a regex: normalize the input the way
 * Node would (dropping ASCII whitespace, which base64 transports routinely
 * insert as line breaks), decode, re-encode, and require the result to match.
 * Anything Node silently discarded shows up as a mismatch. Both the standard
 * and URL-safe alphabets are accepted, and padding is tolerated either way,
 * because callers legitimately produce both.
 */
export function isValidBase64(value: string): boolean {
  const stripped = value.replace(/[\s]/g, "");
  if (stripped.length === 0) return true; // an empty file is a legitimate input

  // Reject anything outside the two alphabets before decoding, so a string of
  // pure punctuation cannot round-trip through an empty decode.
  if (!/^[A-Za-z0-9+/\-_]*={0,2}$/.test(stripped)) return false;

  // A base64 body (padding excluded) is never 1 mod 4 characters long.
  const unpadded = stripped.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) return false;

  const canonical = unpadded.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(canonical, "base64");
  const reencoded = decoded.toString("base64").replace(/=+$/, "");
  return reencoded === canonical;
}

/**
 * The error for `file_content` that is not base64.
 */
export function buildFileContentNotBase64Error(): FileInputError {
  const hint =
    "Base64-encode the file's bytes before passing them " +
    "(e.g. Buffer.from(bytes).toString('base64') or btoa for text), then retry with " +
    "file_content + mime_type. Do not pass raw prose or UTF-8 text as file_content.";
  return new FileInputError(
    ERR_FILE_CONTENT_NOT_BASE64,
    `${ERR_FILE_CONTENT_NOT_BASE64}: 'file_content' must be base64-encoded, and this value is ` +
      `not valid base64. Decoding it would silently discard the invalid characters and store ` +
      `corrupted bytes under a valid-looking content_hash, so it is rejected instead. ${hint}`,
    { hint }
  );
}

/**
 * Decode `file_content`, rejecting rather than corrupting.
 */
export function decodeFileContent(fileContent: string): Buffer {
  if (!isValidBase64(fileContent)) {
    throw buildFileContentNotBase64Error();
  }
  const canonical = fileContent.replace(/[\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(canonical, "base64");
}
