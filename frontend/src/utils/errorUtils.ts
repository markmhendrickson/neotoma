/**
 * Error utility functions for extracting and displaying error messages
 * 
 * Provides consistent error message extraction across the application,
 * handling various error types including AuthError objects.
 */

/**
 * Extract a user-friendly error message from any error type
 * 
 * Handles:
 * - Standard Error objects
 * - AuthError objects (with detailed error extraction)
 * - String errors
 * - Unknown error types
 * 
 * @param err - The error to extract message from
 * @param defaultMessage - Default message if extraction fails
 * @returns User-friendly error message (exact error from backend when available)
 */
export function extractErrorMessage(
  err: unknown,
  defaultMessage: string = "An error occurred"
): string {
  if (err instanceof Error) {
    // Standard Error object - use message directly
    return err.message;
  }
  
  if (typeof err === "string") {
    // String error
    return err;
  }
  
  if (typeof err === "object" && err !== null) {
    // Handle AuthError and other error objects
    const errorObj = err as {
      message?: string;
      status?: number | string;
      statusText?: string;
      error?: string;
      error_description?: string;
      code?: string;
      // AuthError may have nested error details
      details?: string;
      hint?: string;
      // Some errors have the actual error message in nested properties
      [key: string]: any;
    };
    
    // Priority order for extracting the most specific error message:
    // 1. error field (often contains exact backend error, e.g., "451 Authentication failed: Maximum credits exceeded")
    // 2. error_description (OAuth-style error descriptions)
    // 3. message field (standard error message)
    // 4. details (additional context from auth)
    // 5. hint (helpful hints from auth)
    // 6. statusText (HTTP status text)
    // 7. Constructed message with status code
    
    const extractedMessage =
      errorObj.error || // Often contains the exact backend error (e.g., "451 Authentication failed: Maximum credits exceeded")
      errorObj.error_description ||
      errorObj.message ||
      errorObj.details ||
      errorObj.hint ||
      errorObj.statusText;
    
    if (extractedMessage) {
      return extractedMessage;
    }
    
    // If we have a status code but no message, construct one
    if (errorObj.status) {
      return `${defaultMessage} (${errorObj.status})`;
    }
    
    // If we have a code, include it
    if (errorObj.code) {
      return `${defaultMessage} (${errorObj.code})`;
    }
  }
  
  // Fallback to default message
  return defaultMessage;
}

/**
 * Log error details to console for debugging
 * 
 * Logs the full error object with all properties to help diagnose issues.
 * This includes AuthError objects with nested error details.
 * 
 * @param err - The error to log
 * @param context - Optional context string (e.g., "Signup", "Sign in")
 */
export function logError(err: unknown, context?: string): void {
  const contextPrefix = context ? `[${context} Error]` : "[Error]";
  
  // Always log the error object itself
  console.error(contextPrefix, err);
  
  // If it's an object, log all properties in a structured format
  if (typeof err === "object" && err !== null) {
    const errorObj = err as Record<string, any>;
    
    // Log full error details as JSON for easy inspection
    console.error(`${contextPrefix} Full Error Object:`, JSON.stringify(errorObj, null, 2));
    
    // Also log key properties individually for quick reference
    if (errorObj.message) {
      console.error(`${contextPrefix} Message:`, errorObj.message);
    }
    if (errorObj.error) {
      console.error(`${contextPrefix} Error Field:`, errorObj.error);
    }
    if (errorObj.error_description) {
      console.error(`${contextPrefix} Error Description:`, errorObj.error_description);
    }
    if (errorObj.code) {
      console.error(`${contextPrefix} Code:`, errorObj.code);
    }
    if (errorObj.status) {
      console.error(`${contextPrefix} Status:`, errorObj.status);
    }
    if (errorObj.details) {
      console.error(`${contextPrefix} Details:`, errorObj.details);
    }
    if (errorObj.hint) {
      console.error(`${contextPrefix} Hint:`, errorObj.hint);
    }
  } else if (err instanceof Error) {
    // For Error objects, log stack trace if available
    if (err.stack) {
      console.error(`${contextPrefix} Stack:`, err.stack);
    }
  }
}
