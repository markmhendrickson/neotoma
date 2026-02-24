/**
 * MCP OAuth Error Classes
 *
 * Structured errors for OAuth operations using canonical error codes
 */

/**
 * OAuth error with canonical error code and HTTP status
 */
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public retryable: boolean = false,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/**
 * OAuth error code constants
 */
export const OAuthErrorCode = {
  CLIENT_REGISTRATION_FAILED: "OAUTH_CLIENT_REGISTRATION_FAILED",
  STATE_INVALID: "OAUTH_STATE_INVALID",
  STATE_EXPIRED: "OAUTH_STATE_EXPIRED",
  TOKEN_EXCHANGE_FAILED: "OAUTH_TOKEN_EXCHANGE_FAILED",
  TOKEN_REFRESH_FAILED: "OAUTH_TOKEN_REFRESH_FAILED",
  CONNECTION_NOT_FOUND: "OAUTH_CONNECTION_NOT_FOUND",
  CONNECTION_REVOKED: "OAUTH_CONNECTION_REVOKED",
  ENCRYPTION_KEY_MISSING: "OAUTH_ENCRYPTION_KEY_MISSING",
  ENCRYPTION_KEY_INVALID: "OAUTH_ENCRYPTION_KEY_INVALID",
  INVALID_REDIRECT_URI: "OAUTH_INVALID_REDIRECT_URI",
  DECRYPTION_FAILED: "OAUTH_DECRYPTION_FAILED",
  USER_INFO_FAILED: "OAUTH_USER_INFO_FAILED",
} as const;

/**
 * Factory functions for common OAuth errors
 */
export const createOAuthError = {
  clientRegistrationFailed: (message: string, details?: Record<string, any>) =>
    new OAuthError(OAuthErrorCode.CLIENT_REGISTRATION_FAILED, message, 500, false, details),

  stateInvalid: (stateOrMessage: string, details?: Record<string, any>) => {
    // If it looks like a state token (short base64url), use default message
    // Otherwise treat as custom error message
    const isStateToken = /^[a-zA-Z0-9_-]{10,256}$/.test(stateOrMessage);
    const message = isStateToken
      ? "Invalid or missing OAuth state token"
      : stateOrMessage;
    const stateDetails = isStateToken ? { state: stateOrMessage } : {};
    
    return new OAuthError(
      OAuthErrorCode.STATE_INVALID,
      message,
      400,
      false,
      { ...stateDetails, ...details }
    );
  },

  stateExpired: (state: string) =>
    new OAuthError(
      OAuthErrorCode.STATE_EXPIRED,
      "OAuth state token expired (10 minute limit)",
      400,
      false,
      { state }
    ),

  tokenExchangeFailed: (message: string, details?: Record<string, any>) =>
    new OAuthError(OAuthErrorCode.TOKEN_EXCHANGE_FAILED, message, 500, true, details),

  tokenRefreshFailed: (connectionId: string, message: string) =>
    new OAuthError(OAuthErrorCode.TOKEN_REFRESH_FAILED, message, 401, true, { connectionId }),

  connectionNotFound: (connectionId: string) =>
    new OAuthError(
      OAuthErrorCode.CONNECTION_NOT_FOUND,
      "MCP connection not found or revoked. If you switched between local and remote storage, re-run `neotoma auth login` to create a connection for the current backend.",
      404,
      false,
      { connectionId }
    ),

  connectionRevoked: (connectionId: string) =>
    new OAuthError(
      OAuthErrorCode.CONNECTION_REVOKED,
      "Connection has been revoked",
      403,
      false,
      { connectionId }
    ),

  encryptionKeyMissing: () =>
    new OAuthError(
      OAuthErrorCode.ENCRYPTION_KEY_MISSING,
      "NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY not configured (run neotoma init to set it)",
      500,
      false
    ),

  encryptionKeyInvalid: (reason: string) =>
    new OAuthError(
      OAuthErrorCode.ENCRYPTION_KEY_INVALID,
      `Encryption key invalid: ${reason}`,
      500,
      false
    ),

  invalidRedirectUri: (uri: string) =>
    new OAuthError(
      OAuthErrorCode.INVALID_REDIRECT_URI,
      "Invalid redirect URI format",
      400,
      false,
      { uri }
    ),

  decryptionFailed: (reason: string) =>
    new OAuthError(
      OAuthErrorCode.DECRYPTION_FAILED,
      `Failed to decrypt refresh token: ${reason}`,
      500,
      false
    ),

  userInfoFailed: (message: string) =>
    new OAuthError(
      OAuthErrorCode.USER_INFO_FAILED,
      `Failed to get user info: ${message}`,
      500,
      true
    ),
};
