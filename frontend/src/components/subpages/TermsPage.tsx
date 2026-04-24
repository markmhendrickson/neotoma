import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { LEGAL_PAGE_LINK_CLASS } from "@/site/legal_page_link";
import { SANDBOX_TERMS_DOC_PATH } from "@/site/sandbox_doc_paths";
const PUBLISHER_HREF = "https://markmhendrickson.com";
const CONTACT_EMAIL = "contact@neotoma.io";
const ABUSE_EMAIL = "abuse@neotoma.io";
const REPO_HREF = "https://github.com/markmhendrickson/neotoma";

const TERMS_VERSION = "1.0";
const TERMS_EFFECTIVE_DATE = "2026-04-24";

/**
 * Pre-incorporation site terms of use for neotoma.io. Kept in sync with
 * `docs/legal/site_terms_of_use.md`. The fuller
 * `docs/legal/terms_of_service.md` template remains the reference draft
 * for post-incorporation publication and is not yet live.
 */
export function TermsPage() {
  return (
    <DetailPage title="Terms of Use">
      <p className="text-[13px] text-muted-foreground mb-6">
        Version {TERMS_VERSION} &middot; effective {TERMS_EFFECTIVE_DATE}
      </p>

      <p className="text-[15px] leading-7 mb-4">
        These terms apply to <code>neotoma.io</code>,{" "}
        <code>agent.neotoma.io</code>, and the public sandbox at{" "}
        <code>sandbox.neotoma.io</code>. Neotoma the <strong>software</strong>{" "}
        is open source under the MIT license; these terms govern your use of
        the hosted <strong>services</strong> we operate.
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
        operating these services at this time. When Neotoma transitions to a
        registered entity, these terms will be replaced.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        1. Acceptance
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        By accessing or using any <code>neotoma.io</code> service, you agree
        to these terms. If you do not agree, do not use the services.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        2. What we offer today
      </h2>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-2">
        <li>
          <strong>Marketing site</strong> - documentation, product
          information, and the open-source code hosted at{" "}
          <a
            href={REPO_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className={LEGAL_PAGE_LINK_CLASS}
          >
            github.com/markmhendrickson/neotoma
          </a>
          .
        </li>
        <li>
          <strong>Agent feedback pipeline</strong> at{" "}
          <code>agent.neotoma.io/feedback/*</code> - lets agents
          running Neotoma submit structured feedback and poll for resolution
          status.
        </li>
        <li>
          <strong>Public sandbox</strong> at <code>sandbox.neotoma.io</code>{" "}
          - a free evaluation instance of Neotoma, governed by
          additional terms at{" "}
          <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
            public sandbox terms of use
          </Link>
          .
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        We do not currently sell subscriptions, host user accounts, or
        operate a commercial SaaS offering. References in the open-source
        repository to Stripe billing, subscription tiers, or enterprise DPAs
        describe <strong>planned</strong> product work and are not currently
        offered.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        3. The software vs the services
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        The Neotoma <strong>software</strong> (the npm package{" "}
        <code>neotoma</code>, the CLI, MCP server, and reference stack) is
        distributed under the MIT license. You may use, modify, and
        redistribute it under MIT terms. MIT terms always govern the
        software, not these site terms.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        These <strong>site</strong> terms govern only the hosted services at{" "}
        <code>neotoma.io</code>, <code>agent.neotoma.io</code>, and{" "}
        <code>sandbox.neotoma.io</code>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        4. Acceptable use
      </h2>
      <p className="text-[15px] leading-7 mb-3">You agree not to:</p>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-3 space-y-1">
        <li>
          Submit illegal content, harassment, spam, or content that violates
          third-party rights to any <code>neotoma.io</code> service.
        </li>
        <li>
          Attempt to bypass rate limits, access controls, or the
          sandbox&apos;s disabled destructive endpoints.
        </li>
        <li>
          Use automated systems (bots, scrapers) to load the marketing site
          at a rate that degrades service for others.
        </li>
        <li>Interfere with the integrity or performance of any service.</li>
        <li>
          Submit personal data, credentials, internal business information,
          or anything confidential to the public sandbox - sandbox
          content is public by design and is wiped weekly.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Violations may result in rate-limiting, IP blocks, or removal of
        submitted content. Abuse reports go to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_PAGE_LINK_CLASS}>
          {CONTACT_EMAIL}
        </a>
        ; sandbox abuse reports go to{" "}
        <a href={`mailto:${ABUSE_EMAIL}`} className={LEGAL_PAGE_LINK_CLASS}>
          {ABUSE_EMAIL}
        </a>{" "}
        or the in-app <strong>Report abuse</strong> link.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        5. Intellectual property
      </h2>
      <ul className="list-disc pl-5 text-[15px] leading-7 mb-6 space-y-2">
        <li>
          Neotoma software is MIT-licensed. See the LICENSE file in the
          repository for the full text.
        </li>
        <li>
          &ldquo;Neotoma&rdquo; and the packrat mascot are unregistered
          trademarks used by the project. Reasonable use in community
          discussion, forks, and integrations is welcome; please avoid uses
          that imply official endorsement you do not have.
        </li>
        <li>
          Content you submit to the feedback pipeline or sandbox: you retain
          ownership. By submitting, you grant us a worldwide, royalty-free
          license to store, process, and reference the submission solely to
          operate the service and address the feedback.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        6. Data and privacy
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        See the{" "}
        <Link to="/privacy" className={LEGAL_PAGE_LINK_CLASS}>
          Privacy Notice
        </Link>{" "}
        for what data is collected and how it is processed. The{" "}
        <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
          sandbox terms
        </Link>{" "}
        additionally govern sandbox-specific data handling.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        7. No warranty, limitation of liability
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        All hosted services are provided{" "}
        <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>{" "}
        without warranty of any kind. Availability, correctness, and
        durability are explicitly best-effort. The sandbox is for evaluation
        only, not production use.
      </p>
      <p className="text-[15px] leading-7 mb-3">
        To the maximum extent permitted by law,{" "}
        <a
          href={PUBLISHER_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={LEGAL_PAGE_LINK_CLASS}
        >
          Mark Hendrickson
        </a>{" "}
        and any
        contributors to Neotoma disclaim all liability for indirect,
        incidental, special, consequential, or punitive damages arising from
        use of the hosted services. Your sole remedy for dissatisfaction
        with any hosted service is to stop using it.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Nothing in these terms excludes liability that cannot be excluded
        under applicable consumer-protection law.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        8. Changes to the services
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        We may modify, suspend, or discontinue any hosted service at any
        time. We will provide reasonable notice of material changes on the
        marketing site when feasible. Open-source software you have already
        downloaded and run locally is unaffected by service changes.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        9. Governing law
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        These terms are governed by the laws applicable to{" "}
        <a
          href={PUBLISHER_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={LEGAL_PAGE_LINK_CLASS}
        >
          Mark Hendrickson
        </a>
        &apos;s jurisdiction of residence. Any disputes will be
        resolved in courts of competent jurisdiction there. Consumer rights
        under your local law apply to the extent they cannot be waived by
        contract.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        10. Changes to these terms
      </h2>
      <p className="text-[15px] leading-7 mb-6">
        Material changes will be flagged at the top of this page with a new
        effective date. Non-material changes will be committed without
        announcement.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-2">
        11. Contact
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
      <p className="text-[15px] leading-7 mb-6">
        Email:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_PAGE_LINK_CLASS}>
          {CONTACT_EMAIL}
        </a>
      </p>

      <p className="text-[13px] text-muted-foreground mt-8">
        See also the{" "}
        <Link to="/privacy" className={LEGAL_PAGE_LINK_CLASS}>
          Privacy Notice
        </Link>{" "}
        and the{" "}
        <Link to={SANDBOX_TERMS_DOC_PATH} className={LEGAL_PAGE_LINK_CLASS}>
          sandbox-specific terms
        </Link>
        .
      </p>
    </DetailPage>
  );
}
