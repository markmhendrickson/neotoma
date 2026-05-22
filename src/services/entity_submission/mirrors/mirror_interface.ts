/**
 * External mirror abstraction (GitHub, Linear, custom webhook).
 * Phase 3 implements outbound `custom_webhook` posts in `webhook_mirror.ts`;
 * issue GitHub-first flows remain in `services/issues/issue_operations.ts`.
 */

export interface ExternalRef {
  provider: string;
  id: string;
  url?: string;
}
