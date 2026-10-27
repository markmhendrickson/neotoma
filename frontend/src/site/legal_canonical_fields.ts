import privacySource from "../../../docs/legal/site_privacy_notice.md?raw";
import termsSource from "../../../docs/legal/site_terms_of_use.md?raw";
import { SANDBOX_ABUSE_REPORT_EMAIL } from "@shared/sandbox_terms_content";

function extract(source: string) {
  const version = /\*\*Version:\*\*\s*([^\n]+)/.exec(source)?.[1]?.trim();
  const effective = /\*\*Published:\*\*\s*([^\n]+)/.exec(source)?.[1]?.trim();
  const publisher = /operated by \*\*\[([^\]]+)\]\((https:\/\/[^)]+)\)\*\*/.exec(source);
  const email = /\bEmail:\s*([^\s]+)/.exec(source)?.[1];
  if (!version || !effective || !publisher || !email)
    throw new Error(`Canonical legal source is missing a required public identity field: version=${Boolean(version)} effective=${Boolean(effective)} publisher=${Boolean(publisher)} email=${Boolean(email)}`);
  return { version, effective, publisherName: publisher[1], publisherUrl: publisher[2], email };
}

export const PRIVACY_LEGAL_FIELDS = extract(privacySource);
export const TERMS_LEGAL_FIELDS = extract(termsSource);
export const SANDBOX_ABUSE_EMAIL = SANDBOX_ABUSE_REPORT_EMAIL;
