import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AauthAttestationPage() {
  return (
    <DetailPage title="AAuth attestation">
      <p className="text-[15px] leading-7 mb-4">
        Attestation is how Neotoma cryptographically verifies that an
        AAuth-signing key is bound to a hardware root of trust before
        promoting a request to the <code>hardware</code> tier. This page
        specifies the JSON-native <code>cnf.attestation</code> envelope, the
        per-format verifiers, the verification cascade, and the operator
        configuration knobs that select which roots are trusted.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        For the wider AAuth wire format and trust-tier definitions see the{" "}
        <Link to="/aauth/spec">AAuth spec</Link>. For CLI-side attestation
        generation see <Link to="/aauth/cli-keys">CLI keys</Link>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Verification cascade
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Server-side tier resolution after the AAuth signature is verified:
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          If the JWT carries <code>cnf.attestation</code> AND the verifier
          returns <code>{`{ verified: true }`}</code>, resolve to{" "}
          <code>hardware</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Else, if the verified <code>iss</code> (or <code>iss:sub</code>{" "}
          composite) is in the operator allowlist (
          <code>NEOTOMA_OPERATOR_ATTESTED_ISSUERS</code> /{" "}
          <code>NEOTOMA_OPERATOR_ATTESTED_SUBS</code>), resolve to{" "}
          <code>operator_attested</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Else, resolve to <code>software</code>.
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-6">
        Verifier failures (chain invalid, key not bound, format unsupported)
        MUST fall through rather than rejecting the request, the underlying
        signature is still valid, the client just does not earn the higher
        tier. The <code>decision.attestation</code> diagnostic block records
        the verifier reason so operators can debug failed promotions.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        <code>cnf.attestation</code> envelope
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        JSON-native (no CBOR). Lives inside the <code>cnf</code> claim of the{" "}
        <code>aa-agent+jwt</code> agent token alongside <code>cnf.jwk</code>.
        Discriminator-routed so the same envelope shape carries every
        supported format.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "cnf": {
    "jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
    "attestation": {
      "format": "apple-secure-enclave",
      "statement": {
        "attestation_chain": ["<base64url DER>", "<base64url DER>"],
        "signature": "<base64url over SHA-256(challenge || jkt)>"
      },
      "challenge": "<base64url SHA-256(jwt.iss || jwt.sub || jwt.iat)>"
    }
  }
}`}</pre>
      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Field rules
      </h3>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>format</code> (string, required), discriminator. One of{" "}
          <code>apple-secure-enclave</code>, <code>webauthn-packed</code>,{" "}
          <code>tpm2</code>. Unknown values fail with{" "}
          <code>unsupported_format</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>statement</code> (object, required), opaque to the envelope;
          the per-format verifier defines the inner shape.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>challenge</code> (base64url, required), server recomputes
          from JWT claims (
          <code>SHA-256(iss || sub || iat)</code>) and compares against the
          per-format statement. Mismatch fails with{" "}
          <code>challenge_mismatch</code>.
        </li>
      </ul>
      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Key-binding rule
      </h3>
      <p className="text-[15px] leading-7 mb-4">
        The credential public key extracted from <code>statement</code> MUST
        match <code>cnf.jwk</code> by RFC 7638 thumbprint. Without this
        binding, an attacker who replayed a leaked attestation could ride a
        different signing key past the verifier. Mismatch fails with{" "}
        <code>key_binding_failed</code>.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Verifier responsibility ordering inside one format dispatch:
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse statement, extract credential public key.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Compare its RFC 7638 thumbprint to the JWT's <code>cnf.jwk</code>{" "}
          thumbprint. Mismatch → <code>key_binding_failed</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Recompute challenge from JWT claims and compare to the value in the
          statement. Mismatch → <code>challenge_mismatch</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verify the format-specific cryptographic chain / quote.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Supported formats
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        After v0.12.0 every attestation format is fully verified end-to-end
        and participates in revocation under the policy described below.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>apple-secure-enclave</code>
          </strong>{" "}
         , verifier ships in v0.8.0; CLI sources via{" "}
          <code>aauth-mac-se</code> on darwin; trust root bundled at{" "}
          <code>config/aauth/apple_attestation_root.pem</code>; revocation
          via Apple's anonymous-attestation revocation endpoint.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>webauthn-packed</code>
          </strong>{" "}
         , verifier ships in v0.9.0; CLI sources via{" "}
          <code>aauth-yubikey</code> (cross-platform, v0.10.x); trust = AAGUID
          allowlist plus operator CA bundle; revocation via OCSP from the
          leaf's AIA, CRL fallback via the leaf's CDP.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>tpm2</code>
          </strong>{" "}
         , verifier ships in v0.9.0; CLI sources via{" "}
          <code>aauth-tpm2</code> (linux) and <code>aauth-win-tbs</code>{" "}
          (win32) from v0.10.0; trust roots bundled in{" "}
          <code>config/aauth/tpm_attestation_roots/</code>; revocation via
          OCSP from the AIK leaf's AIA, CRL fallback via the AIK leaf's CDP.
        </li>
      </ul>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>apple-secure-enclave</code>
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Implemented by <code>src/services/aauth_attestation_apple_se.ts</code>
        . Statement carries:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-3">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>attestation_chain</code>, base64url-encoded DER X.509
          certificates, leaf first, terminating at an Apple-rooted
          intermediate.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature</code>, base64url-encoded ECDSA-P256 signature
          over <code>SHA-256(challenge || jkt)</code> where <code>jkt</code>{" "}
          is the RFC 7638 thumbprint of the credential public key.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-3">
        After the shared key-binding and challenge checks, the verifier:
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Decodes the chain. Rejects if the leaf does not declare an EC P-256
          public key.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Walks the chain with{" "}
          <code>node:crypto.X509Certificate#verify(issuerKey)</code>. Rejects
          (<code>chain_invalid</code>) on any signature failure or if the
          chain terminates outside the merged trust set.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verifies the leaf's ECDSA signature over{" "}
          <code>SHA-256(challenge || jkt)</code>. Rejects (
          <code>signature_invalid</code>) on mismatch.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>webauthn-packed</code>
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Implemented in{" "}
        <code>src/services/aauth_attestation_webauthn_packed.ts</code>.
        Statement layout mirrors W3C WebAuthn §8.2:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-3">{`{
  "alg": -7,
  "sig": "<base64url DER signature>",
  "x5c": ["<base64url leaf>", "<base64url intermediates...>"]
}`}</pre>
      <p className="text-[15px] leading-7 mb-3">Verifier flow:</p>
      <ol className="list-decimal pl-6 space-y-2 mb-3">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse and validate the statement. <code>malformed</code> on missing
          fields; <code>unsupported_format</code> for ECDAA-only attestations
          (no <code>x5c</code>) or COSE algs outside the v0.9.0 admission
          set.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Resolve COSE <code>alg</code> to a Node crypto primitive. Supported
          values: <code>-7</code> (ES256), <code>-35</code> (ES384),{" "}
          <code>-36</code> (ES512), <code>-8</code> (EdDSA),{" "}
          <code>-257</code> (RS256), <code>-258</code> (RS384),{" "}
          <code>-259</code> (RS512), <code>-37</code> (PS256).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Walk the leaf → intermediates chain against the merged trust roots
          from <code>aauth_attestation_trust_config.ts</code>. Untrusted
          chains return <code>chain_invalid</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Extract the FIDO <code>id-fido-gen-ce-aaguid</code> extension (
          <code>1.3.6.1.4.1.45724.1.1.4</code>) using a hand-written DER
          parser. When the operator allowlist (
          <code>NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH</code>) is non-empty,
          the parsed AAGUID MUST match an entry; mismatches return{" "}
          <code>aaguid_not_trusted</code>. When empty, AAGUID is logged but
          not gated, so operators can ramp gradually.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Bind the leaf's public key to the JWT-bound <code>cnf.jwk</code>{" "}
          via RFC 7638 thumbprint. Mismatches return{" "}
          <code>key_binding_failed</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verify the statement signature over the bound challenge using the
          resolved primitive. Mismatches return <code>signature_invalid</code>
          .
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-6">
        Successful runs return <code>verified: true</code> with{" "}
        <code>aaguid</code> and <code>key_model</code> populated, plus the
        human-readable trust-chain summary.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>tpm2</code>
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Verifies WebAuthn <code>tpm</code> attestation statements (TPM 2.0
        quotes + AIK chains). Implementation in{" "}
        <code>src/services/aauth_attestation_tpm2.ts</code>; uses the
        in-repo big-endian length-prefixed parser at{" "}
        <code>src/services/aauth_tpm_structures.ts</code> (no external TPM
        library, so the parsing surface remains auditable in TypeScript).
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-3">{`{
  "ver": "2.0",
  "alg": -7,
  "x5c": ["…AIK leaf…", "…intermediates…", "…root…"],
  "sig": "…raw AIK signature over certInfo bytes…",
  "certInfo": "…raw TPMS_ATTEST bytes…",
  "pubArea": "…raw TPMT_PUBLIC bytes describing the bound key…"
}`}</pre>
      <p className="text-[15px] leading-7 mb-3">Pipeline:</p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse the statement. Missing or non-string fields →{" "}
          <code>malformed</code>. Unsupported <code>ver</code> →{" "}
          <code>unsupported_format</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Resolve the COSE <code>alg</code> to a Node crypto digest +
          primitive. Unsupported algs return <code>signature_invalid</code>{" "}
          rather than throwing so the cascade keeps moving.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Decode the <code>x5c</code> chain into <code>X509Certificate</code>{" "}
          objects. Decode failures or missing certs → <code>chain_invalid</code>
          .
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse <code>pubArea</code> as <code>TPMT_PUBLIC</code> and lift it
          into a Node <code>KeyObject</code> (RSA <code>(n, e)</code> and
          ECC P-256/P-384/P-521 supported). Truncated or unsupported key
          types → <code>malformed</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          RFC 7638 thumbprint of the lifted public key MUST equal{" "}
          <code>ctx.boundJkt</code>. Mismatches return{" "}
          <code>key_binding_failed</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Walk the AIK chain against the merged trust set. Roots come from{" "}
          <code>config/aauth/tpm_attestation_roots/</code> plus operator
          PEMs from <code>NEOTOMA_AAUTH_ATTESTATION_CA_PATH</code>. Untrusted
          chains return <code>chain_invalid</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verify <code>sig</code> over the raw <code>certInfo</code> bytes
          using the AIK leaf's public key. Mismatches return{" "}
          <code>signature_invalid</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse <code>certInfo</code> as <code>TPMS_ATTEST</code>. Magic MUST
          be <code>TPM_GENERATED_VALUE</code> (<code>0xff544347</code>) and
          type MUST be <code>TPM_ST_ATTEST_QUOTE</code> (<code>0x8018</code>)
          or <code>TPM_ST_ATTEST_CERTIFY</code> (<code>0x8017</code>); other
          shapes → <code>malformed</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>extraData</code> MUST equal{" "}
          <code>SHA-256(challenge || jkt)</code>. Mismatches return{" "}
          <code>challenge_mismatch</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          For <code>TPM_ST_ATTEST_CERTIFY</code> only, the certified{" "}
          <code>attested.name</code> MUST equal{" "}
          <code>nameAlg || digest(pubArea)</code>. Mismatches return{" "}
          <code>pubarea_mismatch</code>, this catches CLI sources that
          quote a different key than the one they signed.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Revocation
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Implemented in{" "}
        <code>src/services/aauth_attestation_revocation.ts</code>. After every
        successful chain validation the per-format verifier consults the
        shared revocation service and folds the result back into the{" "}
        <code>AttestationOutcome</code> via{" "}
        <code>applyRevocationPolicy()</code>.
      </p>
      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Channels
      </h3>
      <ul className="list-none pl-0 space-y-3 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">apple-secure-enclave</strong>,
          Apple anonymous-attestation revocation endpoint (
          <code>https://data.appattest.apple.com/v1/revoked-list</code>,
          override via <code>NEOTOMA_AAUTH_APPLE_REVOCATION_URL</code>). POST{" "}
          <code>{`{ "serial_numbers": [...] }`}</code>; returns{" "}
          <code>{`{ "revoked": [...] }`}</code>. Cache keyed by{" "}
          <code>SHA-256(leaf DER)</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">webauthn-packed</strong>, OCSP
          via the leaf's AIA, CRL fallback via the leaf's CDP. Standard X.509
          path used by YubiKey and external authenticators.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">tpm2</strong>, OCSP via the
          AIK leaf's AIA, CRL fallback via the AIK leaf's CDP. Vendor AIK
          chains (Infineon, STMicro, Intel, AMD, Microsoft) consistently
          advertise OCSP responders.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Lookups short-circuit when{" "}
        <code>NEOTOMA_AAUTH_REVOCATION_MODE</code> is <code>disabled</code>{" "}
       , the verifier never opens a network socket and the diagnostic stays
        absent. In <code>log_only</code> and <code>enforce</code> modes the
        service runs and the diagnostic rides on the outcome regardless of
        verification result.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Policy
      </h3>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>disabled</code>
          </strong>{" "}
         , diagnostic omitted; outcome forwarded as-is.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>log_only</code>
          </strong>{" "}
         , diagnostic attached (<code>checked: true</code>,{" "}
          <code>mode: "log_only"</code>, <code>demoted: false</code>) but
          never demotes the tier. Operator-audit window before the v0.12.0
          flip.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>enforce</code>
          </strong>{" "}
         , a <code>revoked</code> status (and <code>unknown</code> when{" "}
          <code>NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN=0</code>) demotes a
          previously-verified outcome to{" "}
          <code>{`{ verified: false, reason: "revoked"... }`}</code>. The
          cascade then falls through to the operator allowlist or{" "}
          <code>software</code> tier exactly as it does for any other{" "}
          <code>verified: false</code> reason.
        </li>
      </ul>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Caching
      </h3>
      <p className="text-[15px] leading-7 mb-6">
        In-memory LRU keyed by{" "}
        <code>SHA-256(leaf DER fingerprint || channel)</code>. TTL via{" "}
        <code>NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS</code> (default{" "}
        <code>3600</code>). Cache hits surface as <code>source: "cache"</code>
        . Process-local; restarts re-validate every chain through the upstream
        channel before re-populating.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Diagnostics
      </h3>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`interface AttestationRevocationDiagnostic {
  checked: boolean;             // false when mode === "disabled"
  status?: "good" | "revoked" | "unknown";
  source?: "disabled" | "cache" | "apple" | "ocsp" | "crl" | "no_endpoint" | "error";
  detail?: string;              // free-form responder/network detail
  mode?: "disabled" | "log_only" | "enforce";
  demoted?: boolean;            // true iff enforce mode demoted hardware → software
}`}</pre>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Migration plan
      </h3>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">v0.10.x</strong>, default{" "}
          <code>disabled</code>. No network calls, no diagnostic. Pre-FU-7
          behaviour.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">v0.11.0</strong>, default{" "}
          <code>log_only</code>. Network calls run, diagnostic surfaces,
          tiers unchanged. Operators audit before the flip.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">v0.12.0</strong>, default{" "}
          <code>enforce</code>. Revoked / fail-closed-unknown demote{" "}
          <code>hardware</code> to <code>software</code>. Operators who need
          to fall back can pin{" "}
          <code>NEOTOMA_AAUTH_REVOCATION_MODE=log_only</code>.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Trust configuration
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Loaded by{" "}
        <code>src/services/aauth_attestation_trust_config.ts</code>. Always
        includes the bundled Apple Attestation Root; operator inputs are
        additive. The trust loader is fail-open: missing or unreadable
        operator inputs log a single warning and continue with the bundled
        root.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_AAUTH_ATTESTATION_CA_PATH</code>
          </strong>{" "}
         , absolute path to a PEM file or directory of PEM files. Adds
          operator-managed CAs to the merged trust set used for chain
          validation.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>config/aauth/tpm_attestation_roots/</code>
          </strong>{" "}
         , bundled TPM 2.0 AIK root CAs (<code>.pem</code> /{" "}
          <code>.crt</code>, recursive). Always merged into the trust set
          for the <code>tpm2</code> verifier. Vendor sub-directories
          document provenance per <code>README.md</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH</code>
          </strong>{" "}
         , absolute path to a JSON file containing an array of WebAuthn
          AAGUIDs (RFC 4122 lower-case hyphenated). Restricts which
          authenticator AAGUIDs the <code>webauthn-packed</code> verifier
          admits. Empty/missing file = no AAGUID gating.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_OPERATOR_ATTESTED_ISSUERS</code>
          </strong>{" "}
         , CSV of <code>iss</code> values. Promotes verified AAuth
          signatures whose <code>iss</code> matches to{" "}
          <code>operator_attested</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_OPERATOR_ATTESTED_SUBS</code>
          </strong>{" "}
         , CSV of <code>iss:sub</code> composite values. Same as above but
          pinned to a specific <code>(iss, sub)</code> pair.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        <code>config/aauth/apple_attestation_root.pem</code> ships in-repo.
        The first lines of the file MUST be a comment referencing the Apple
        documentation page the cert was sourced from and the SHA-256
        fingerprint, so operators can audit the bundled material at a glance.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Diagnostics surface
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The verifier returns a structured outcome:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`type AttestationOutcome =
  | { verified: true; format: AttestationFormat; revocation?: AttestationRevocationDiagnostic }
  | { verified: false; format: AttestationFormat | "unknown"; reason: AttestationFailureReason; revocation?: AttestationRevocationDiagnostic };

type AttestationFailureReason =
  | "not_present"
  | "unsupported_format"
  | "key_binding_failed"
  | "challenge_mismatch"
  | "chain_invalid"
  | "signature_invalid"
  | "aaguid_not_trusted"
  | "pubarea_mismatch"
  | "not_implemented"
  | "malformed"
  | "revoked";`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        The middleware mirrors this onto{" "}
        <code>AttributionDecisionDiagnostics.attestation</code> so operators
        can see exactly why a promotion failed without log-spelunking.{" "}
        <code>not_present</code> means the JWT did not carry{" "}
        <code>cnf.attestation</code> at all (the cascade then evaluates the
        operator allowlist). <code>revoked</code> is populated by the
        revocation service in <code>enforce</code> mode.{" "}
        <code>AttributionDecisionDiagnostics.attestation.revocation</code>{" "}
        carries the underlying status, channel, mode, and{" "}
        <code>demoted</code> flag.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Back to <Link to="/aauth">AAuth overview</Link>. See also{" "}
        <Link to="/aauth/spec">AAuth spec</Link>,{" "}
        <Link to="/aauth/cli-keys">CLI keys</Link>,{" "}
        <Link to="/aauth/integration">integration</Link>.
      </p>
    </DetailPage>
  );
}
