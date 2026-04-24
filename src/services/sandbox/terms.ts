/**
 * Sandbox terms-of-use content served from `GET /sandbox/terms`.
 *
 * Versioned so future updates can be detected by clients. Markdown source
 * lives in `src/shared/sandbox_terms_content.ts` (also used by the
 * marketing page at `/sandbox/terms-of-use`).
 */

import {
  SANDBOX_ABUSE_REPORT_EMAIL,
  SANDBOX_TERMS_EFFECTIVE_DATE,
  SANDBOX_TERMS_MARKDOWN,
  SANDBOX_TERMS_VERSION,
  SANDBOX_WEEKLY_RESET_UTC,
} from "../../shared/sandbox_terms_content.js";

export {
  SANDBOX_ABUSE_REPORT_EMAIL,
  SANDBOX_TERMS_EFFECTIVE_DATE,
  SANDBOX_TERMS_MARKDOWN,
  SANDBOX_TERMS_VERSION,
  SANDBOX_WEEKLY_RESET_UTC,
};

export interface SandboxTermsResponse {
  version: string;
  effective_date: string;
  content_markdown: string;
  weekly_reset_utc: string;
  abuse_report_email: string;
}

export function getSandboxTermsResponse(): SandboxTermsResponse {
  return {
    version: SANDBOX_TERMS_VERSION,
    effective_date: SANDBOX_TERMS_EFFECTIVE_DATE,
    content_markdown: SANDBOX_TERMS_MARKDOWN,
    weekly_reset_utc: SANDBOX_WEEKLY_RESET_UTC,
    abuse_report_email: SANDBOX_ABUSE_REPORT_EMAIL,
  };
}
