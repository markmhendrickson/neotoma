import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { LEGAL_PAGE_LINK_CLASS } from "@/site/legal_page_link";
import { SANDBOX_TERMS_DOC_PATH } from "@/site/sandbox_doc_paths";
import { useLocale } from "@/i18n/LocaleContext";
const PUBLISHER_HREF = "https://markmhendrickson.com";
const CONTACT_EMAIL = "contact@neotoma.io";

const PRIVACY_VERSION = "1.0";
const PRIVACY_EFFECTIVE_DATE = "2026-04-24";

/**
 * Pre-incorporation site privacy notice for neotoma.io. Kept in sync with
 * `docs/legal/site_privacy_notice.md`; update both when the text changes.
 * The fuller `docs/legal/privacy_policy.md` template is retained for
 * post-incorporation publication and is not yet live.
 */
export function PrivacyPage() {
  const { subpage } = useLocale();
  return (
    <DetailPage title={subpage.privacy.title}>
      <p className="text-[13px] text-muted-foreground mb-6">
        Version {PRIVACY_VERSION} &middot; effective {PRIVACY_EFFECTIVE_DATE}
      </p>

      <p className="text-[15px] leading-7 mb-4">
        This notice describes what data <code>neotoma.io</code> collects
        when you visit the marketing site, interact with the public sandbox,
        or submit agent feedback through the pipeline hosted at{" "}
        <code>agent.neotoma.io</code>.
      </p>

      <p className="text-[15px] leading-7 mb-6">
        Neotoma is currently operated by{" "}
        <a
          href={PUBLISHER_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={LEGAL_PAGE_LINK_CLASS}
        >
          Mark Hendrickson
        </a>{" "}
        as
        an individual publisher - there is no registered legal entity
        operating this site at this time. When Neotoma transitions to a
        registered entity, this notice will be replaced and anyone who has
        submitted identifiable data will be notified via the contact address
        on record.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        1. What this notice covers
      </h2>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-4 space-y-1">
        <li>
          <code>neotoma.io</code> - the public marketing and
          documentation site.
        </li>
        <li>
          <code>agent.neotoma.io</code> - the agent feedback pipeline
          (see <code>/feedback</code>).
        </li>
        <li>
          <code>sandbox.neotoma.io</code> - the public evaluation
          sandbox. The sandbox has additional terms at{" "}
          <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
            public sandbox terms of use
          </Link>{" "}
          that govern data submitted to the sandbox itself; those terms take
          precedence for sandbox content.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        This notice does <strong>not</strong> cover locally installed Neotoma
        instances running on your own machine, or third-party sites linked
        from the documentation.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        2. What we collect
      </h2>

      <h3 className="text-[16px] font-medium mt-4 mb-2">
        2.1 Analytics (aggregate, pseudonymous)
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        The marketing site uses a self-hosted Umami instance for aggregate,
        pseudonymous usage analytics:
      </p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-2">
        <li>
          <strong>Umami.</strong> Self-hosted, cookie-less, privacy-friendly
          web analytics. Records URL path, page title, referrer, browser
          type, and country (derived from IP then discarded). No cookies are
          set. No cross-site tracking.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        We do not run Google Analytics on the marketing site.
      </p>

      <h3 className="text-[16px] font-medium mt-4 mb-2">
        2.2 Agent feedback pipeline
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        When an agent running on your machine submits feedback to{" "}
        <code>agent.neotoma.io/feedback/submit</code> (via the{" "}
        <code>submit_feedback</code> MCP tool or the{" "}
        <code>neotoma feedback</code> CLI), the following is stored:
      </p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-1">
        <li>The feedback payload your agent sent (title, body, kind, metadata).</li>
        <li>
          A redaction pass that replaces emails, phone numbers, API tokens,
          UUIDs, and home-directory path fragments with{" "}
          <code>&lt;LABEL:hash&gt;</code> placeholders <strong>before</strong>{" "}
          storage.
        </li>
        <li>
          An <code>access_token</code> scoped to that single feedback row,
          which is returned to your agent and is the only way to poll status
          later.
        </li>
        <li>
          Environment metadata your agent supplied (OS, Neotoma version,
          client name/version, tool name, error class).
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        Request IP addresses may be logged at the edge (Netlify) for abuse
        investigation. Edge logs are retained per Netlify&apos;s default
        policy and are not joined with feedback content.
      </p>

      <h3 className="text-[16px] font-medium mt-4 mb-2">
        2.3 Sandbox interactions
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        See the{" "}
        <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
          sandbox terms of use
        </Link>{" "}
        for the full sandbox-specific terms. In summary:
      </p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-4 space-y-1">
        <li>All content submitted to the sandbox is public by design.</li>
        <li>The sandbox is wiped every Sunday at 00:00 UTC and re-seeded from synthetic fixtures.</li>
        <li>Request IPs are hashed before being stored in any abuse report.</li>
        <li>No cookies or accounts are required to use the sandbox.</li>
      </ul>

      <h3 className="text-[16px] font-medium mt-4 mb-2">
        2.4 What we do not collect
      </h3>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-6 space-y-1">
        <li>We do not set login cookies on the marketing site - there are no accounts.</li>
        <li>We do not sell, rent, or share data with advertising networks.</li>
        <li>
          We do not scan your email, files, or other services. Local Neotoma
          installations run entirely on your machine by default.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        3. Legal basis (GDPR / UK-GDPR)
      </h2>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-6 space-y-2">
        <li>
          <strong>Umami analytics</strong> - legitimate interest
          (privacy-friendly, cookie-less, aggregate site-usage measurement).
        </li>
        <li>
          <strong>Feedback pipeline</strong> - consent. Submitting
          feedback via your agent is an explicit opt-in action.
        </li>
        <li>
          <strong>Sandbox</strong> - consent plus the public-by-design
          posture disclosed in the sandbox terms.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        4. Your rights
      </h2>
      <p className="text-[15px] leading-7 mb-3">You have the right to:</p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-1">
        <li>Ask what we have stored about you.</li>
        <li>
          Request correction or deletion of any feedback record identifiable
          to you (use the <code>access_token</code> your agent received, or
          contact us).
        </li>
        <li>Ask us to restrict or stop processing.</li>
        <li>Request export of any identifiable data.</li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        All requests go to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_PAGE_LINK_CLASS}>
          {CONTACT_EMAIL}
        </a>
        . We aim to respond within 30 days. Because we do not operate user
        accounts, identification usually relies on the{" "}
        <code>access_token</code> you were issued or the email address that
        submitted a request.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        5. Data sharing
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        We use these third-party processors:
      </p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-2">
        <li>
          <strong>Netlify</strong> - hosts the agent feedback pipeline
          and the marketing site. Receives request metadata necessary to
          serve HTTP responses.
        </li>
        <li>
          <strong>Fly.io</strong> - hosts the public sandbox. Receives
          request metadata necessary to serve HTTP responses.
        </li>
        <li>
          <strong>Umami</strong> - self-hosted; no third-party
          processor involved when Umami is the active analytics backend.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        We do not share data with advertising networks or data brokers.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        6. Data retention
      </h2>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-6 space-y-1">
        <li>
          <strong>Umami analytics</strong> - aggregate event data
          retained indefinitely, no personal identifiers stored.
        </li>
        <li>
          <strong>Agent feedback records</strong> - retained until the
          issue is resolved and for a reasonable follow-up window thereafter.
          Submitters may request deletion at any time via their{" "}
          <code>access_token</code> or the contact email.
        </li>
        <li>
          <strong>Sandbox content</strong> - wiped weekly per the
          sandbox terms.
        </li>
        <li>
          <strong>Edge request logs</strong> - retained per
          Netlify/Fly.io default log retention (typically 7-30 days).
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        7. Children&apos;s privacy
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        Neotoma is not directed at children under 18. We do not knowingly
        collect information from children.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        8. Changes to this notice
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        Material changes will be flagged at the top of this page with a new
        effective date. Non-material changes (typos, formatting) will be
        committed without announcement.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        9. Contact
      </h2>
      <p className="text-[15px] leading-7 mb-2">
        <a
          href={PUBLISHER_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={LEGAL_PAGE_LINK_CLASS}
        >
          Mark Hendrickson
        </a>
        , publisher of Neotoma
      </p>
      <p className="text-[15px] leading-7 mb-2">
        Email:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_PAGE_LINK_CLASS}>
          {CONTACT_EMAIL}
        </a>
      </p>
      <p className="text-[15px] leading-7 mb-6">
        A postal address for formal correspondence is available on request
        at the contact email above.
      </p>

      <p className="text-[13px] text-muted-foreground mt-8">
        See also the <Link to="/terms" className={LEGAL_PAGE_LINK_CLASS}>Terms of Use</Link>
        {" "}and the{" "}
        <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
          sandbox-specific terms
        </Link>
        .
      </p>
    </DetailPage>
  );
}
