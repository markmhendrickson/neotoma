import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AauthCliKeysPage() {
  return (
    <DetailPage title="AAuth CLI keys and hardware backends">
      <p className="text-[15px] leading-7 mb-4">
        How the Neotoma CLI generates AAuth keypairs, mints{" "}
        <code>aa-agent+jwt</code> agent tokens, and attaches a{" "}
        <code>cnf.attestation</code> envelope when the operator opts in to
        hardware-backed signing across macOS, Linux, Windows, and any host
        with a YubiKey 5 series device. This page is the client-side
        counterpart to <Link to="/aauth/attestation">attestation</Link>,
        which specifies how the server verifies the resulting envelope.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Implementation in <code>src/cli/aauth_signer.ts</code> plus optional
        native packages in <code>packages/aauth-mac-se/</code> (darwin),{" "}
        <code>packages/aauth-tpm2/</code> (linux),{" "}
        <code>packages/aauth-win-tbs/</code> (win32), and{" "}
        <code>packages/aauth-yubikey/</code> (cross-platform).
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Platform support matrix
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        After v0.10.x the <code>--hardware</code> flag is supported on every
        platform Neotoma ships an installer for. The CLI selects a backend
        per the ladder below; operators can pin a specific backend via{" "}
        <code>NEOTOMA_AAUTH_HARDWARE_BACKEND</code>.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">darwin</strong>, default{" "}
          <code>aauth-mac-se</code> (Secure Enclave); fallback{" "}
          <code>aauth-yubikey</code> when an external YubiKey is preferred.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">linux</strong>, default{" "}
          <code>aauth-tpm2</code> (TPM 2.0); fallback{" "}
          <code>aauth-yubikey</code> when no <code>/dev/tpmrm0</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">win32</strong>, default{" "}
          <code>aauth-win-tbs</code> (TBS + NCrypt); fallback{" "}
          <code>aauth-yubikey</code> when no Microsoft Platform Crypto
          Provider.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">any host with a YubiKey</strong>{" "}
         , <code>aauth-yubikey</code>; pure-fallback path.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        The wire format produced by each backend, and therefore the
        server-side verifier it lands in, is fixed:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>apple-secure-enclave</code> →{" "}
          <code>apple-secure-enclave</code> →{" "}
          <code>verifyAppleSecureEnclaveAttestation</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>tpm2</code> (linux) → <code>tpm2</code> →{" "}
          <code>verifyTpm2Attestation</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>tbs</code> (win32) → <code>tpm2</code> →{" "}
          <code>verifyTpm2Attestation</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>yubikey</code> (any) → <code>webauthn-packed</code> →{" "}
          <code>verifyWebauthnPackedAttestation</code>
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Notably: Windows/TBS reuses the TPM 2.0 verifier unchanged even
        though the CLI talks to <code>NCrypt</code> rather than raw TPM
        commands; YubiKey reuses the WebAuthn-<code>packed</code> verifier
        because YubiKey PIV chains terminate at Yubico's PIV CA, not a TPM
        manufacturer chain.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Signer backends
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <code>src/cli/aauth_signer.ts</code> supports five key-storage
        backends, recorded in <code>signer.json</code> as <code>backend</code>:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>software</code>
          </strong>{" "}
          (default), private key at{" "}
          <code>~/.neotoma/aauth/private.jwk</code>; any platform;
          tier <code>software</code>, or <code>operator_attested</code> if
          allowlisted.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>apple-secure-enclave</code>
          </strong>{" "}
         , macOS Secure Enclave keychain entry, referenced by{" "}
          <code>se_key_tag</code>; tier <code>hardware</code> when the JWT
          carries a verified <code>cnf.attestation</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>tpm2</code>
          </strong>{" "}
         , Linux TPM 2.0 persistent handle (<code>tpm2_handle</code>,
          default <code>0x81010000</code>) under the configured{" "}
          <code>tpm2_hierarchy</code>; tier <code>hardware</code> when the
          JWT carries a verified TPM 2.0 envelope.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>tbs</code>
          </strong>{" "}
         , Windows TBS / NCrypt key under the Microsoft Platform Crypto
          Provider, referenced by <code>tbs_key_name</code> (default{" "}
          <code>neotoma-aauth-aik</code>); tier <code>hardware</code> when
          the JWT carries a verified TPM 2.0 envelope (TBS reuses the same
          server verifier).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>yubikey</code>
          </strong>{" "}
         , YubiKey 5 series PIV slot 9c, referenced by{" "}
          <code>yubikey_serial</code> and <code>yubikey_pkcs11_path</code>;
          tier <code>hardware</code> when the JWT carries a verified
          WebAuthn-<code>packed</code> envelope rooted in the bundled Yubico
          PIV CA.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        For SE-backed keys the on-disk <code>private.jwk</code> stores ONLY
        public material plus a <code>backend: "apple-secure-enclave"</code>{" "}
        discriminator, the private scalar never leaves the Enclave. Signing
        always goes through <code>@neotoma/aauth-mac-se</code>'s native{" "}
        <code>sign()</code> primitive.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        On-disk schema (<code>signer.json</code>)
      </h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "sub": "cursor-agent@<hostname>",
  "iss": "https://neotoma.cursor.local",
  "kid": "<jwk-thumbprint>",
  "token_ttl_sec": 300,
  "backend": "apple-secure-enclave",
  "se_key_tag": "io.neotoma.aauth.cli.default"
}`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        <code>backend</code> and <code>se_key_tag</code> are optional and
        absent for legacy software keypairs (treated as{" "}
        <code>backend: "software"</code> for back-compat). Software keypairs
        continue to store a full private JWK in <code>private.jwk</code>{" "}
        with mode <code>0600</code>. SE-backed <code>private.jwk</code>{" "}
        files contain only public coordinates plus the <code>backend</code>{" "}
        field; reading them with <code>jose</code> produces a public-key
        import as expected.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Keygen flows
      </h2>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>neotoma auth keygen</code> (software, default)
      </h3>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Generate a P-256 keypair via Web Crypto.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Write <code>private.jwk</code> (full JWK with <code>d</code>) at{" "}
          <code>0600</code>, <code>public.jwk</code> at <code>0644</code>,
          and <code>signer.json</code> with <code>backend: "software"</code>.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>neotoma auth keygen --hardware</code> (darwin / Secure Enclave)
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Available on darwin only and requires <code>@neotoma/aauth-mac-se</code>{" "}
        installed (ships as an optional dependency on macOS hosts).
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Validate <code>alg === "ES256"</code> (Secure Enclave only supports
          P-256).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Probe <code>se.isSupported()</code>; refuse if the host has no
          usable Secure Enclave or the binding cannot load.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Call <code>{`se.generateKey({ tag: <se_key_tag> })`}</code>; the
          binding creates a fresh P-256 keypair pinned to the Enclave with
          biometric access policy and returns the public coordinates as a
          JWK.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Persist <code>private.jwk</code> (public material +{" "}
          <code>backend: "apple-secure-enclave"</code>),{" "}
          <code>public.jwk</code>, and <code>signer.json</code> with{" "}
          <code>backend</code> and <code>se_key_tag</code>.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>neotoma auth keygen --hardware</code> (Linux / TPM 2.0)
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Available on linux only and requires <code>@neotoma/aauth-tpm2</code>
        . Ships as an optional dependency on linux x64 / arm64.
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Validate <code>process.platform === "linux"</code> and that the
          requested alg is <code>ES256</code> or <code>RS256</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Probe <code>tpm2.isSupported()</code>; refuse if no usable{" "}
          <code>/dev/tpmrm0</code>, the resource manager is unreachable, or
          the binding cannot load.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Call <code>{`tpm2.generateKey({ hierarchy, alg })`}</code>; the
          binding creates a fresh AIK, persists it at the configured TPM
          handle (default <code>0x81010000</code>, override via{" "}
          <code>NEOTOMA_AAUTH_TPM2_HANDLE</code>), and returns the public
          coordinates as a JWK.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Persist <code>private.jwk</code> (public material +{" "}
          <code>backend: "tpm2"</code>), <code>public.jwk</code>, and{" "}
          <code>signer.json</code> with <code>backend</code>,{" "}
          <code>tpm2_handle</code>, and <code>tpm2_hierarchy</code>.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>neotoma auth keygen --hardware</code> (Windows / TBS + NCrypt)
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Available on win32 only and requires{" "}
        <code>@neotoma/aauth-win-tbs</code>. Ships as an optional dependency
        on Windows x64 / arm64. Although the wire format is{" "}
        WebAuthn-<code>tpm</code> (and the server-side TPM 2.0 verifier is
        reused unchanged), the CLI uses Trusted Platform Module Base Services
        (TBS) and Cryptography Next Generation (CNG / NCrypt) APIs rather
        than direct command-level TPM 2.0 access, because Windows does not
        expose a stable userspace TPM device.
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Validate <code>process.platform === "win32"</code> and that the
          alg is <code>ES256</code> or <code>RS256</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Probe <code>tbs.isSupported()</code>; refuse if no usable
          Microsoft Platform Crypto Provider, TBS service disabled, or the
          binding cannot load.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Call{" "}
          <code>
            {`tbs.generateKey({ provider, scope, alg, keyName })`}
          </code>
          ; the binding calls <code>NCryptOpenStorageProvider</code> followed
          by <code>NCryptCreatePersistedKey</code> against the Microsoft
          Platform Crypto Provider with{" "}
          <code>NCRYPT_MACHINE_KEY_FLAG</code> toggled by <code>scope</code>.
          Finalises with <code>NCryptFinalizeKey</code> and returns the
          public coordinates as a JWK.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Persist <code>private.jwk</code> (public material +{" "}
          <code>backend: "tbs"</code>), <code>public.jwk</code>, and{" "}
          <code>signer.json</code> with <code>backend</code>,{" "}
          <code>tbs_provider</code>, <code>tbs_scope</code>, and{" "}
          <code>tbs_key_name</code>.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        <code>neotoma auth keygen --hardware --backend=yubikey</code>{" "}
        (cross-platform / YubiKey)
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Available on darwin / linux / win32 and requires{" "}
        <code>@neotoma/aauth-yubikey</code> plus <code>libykcs11</code> (the
        Yubico PKCS#11 provider) plus a YubiKey 5 series device. The wire
        format is WebAuthn-<code>packed</code>, NOT WebAuthn-<code>tpm</code>
        : YubiKey PIV slot attestations chain to Yubico's PIV CA bundled in{" "}
        <code>config/aauth/yubico_piv_roots.pem</code>, so the server reuses
        the WebAuthn-<code>packed</code> verifier rather than the TPM 2.0
        verifier.
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Validate the alg is <code>ES256</code> (YubiKey PIV slot 9c only
          supports P-256 with stable cross-platform attestation).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Probe <code>{`yk.isSupported({ pkcs11Path? })`}</code>; refuse if{" "}
          <code>libykcs11</code> not loadable, no YubiKey detected, firmware
          too old (&lt; 5.0.0), or the binding cannot load.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Prompt for the PIV PIN (interactive TTY) or honour{" "}
          <code>NEOTOMA_AAUTH_YUBIKEY_PIN</code>. Forwarded once via{" "}
          <code>C_Login</code> and NEVER persisted to <code>signer.json</code>
          .
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Call{" "}
          <code>
            {`yk.generateKey({ slot: "9c", alg: "ES256", pin, serial })`}
          </code>
          ; binding calls <code>C_GenerateKeyPair</code> against the
          YubiKey's PKCS#11 slot, fetches the per-slot PIV attestation cert
          and the F9 attestation intermediate via{" "}
          <code>C_GetAttributeValue</code>. The private scalar NEVER leaves
          the YubiKey.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Persist <code>private.jwk</code> (public material +{" "}
          <code>backend: "yubikey"</code>), <code>public.jwk</code>, and{" "}
          <code>signer.json</code> with <code>backend</code>,{" "}
          <code>yubikey_slot</code>, <code>yubikey_serial</code>, and{" "}
          <code>yubikey_pkcs11_path</code>. PIN is NEVER persisted to disk.
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-6">
        If a probe fails the command exits with a clear diagnostic and an
        actionable hint. Operators can re-run without <code>--hardware</code>{" "}
        to fall back to the software backend, or with{" "}
        <code>NEOTOMA_AAUTH_HARDWARE_BACKEND=auto</code> (the default) to
        let the CLI pick the best available backend per the ladder above.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        JWT minting (<code>mintCliAgentTokenJwt</code>)
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <code>mintCliAgentTokenJwt(config, options)</code> produces an{" "}
        <code>aa-agent+jwt</code> agent token with these standard claims:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>iss</code>, <code>sub</code>, <code>iat</code>,{" "}
          <code>exp</code>, <code>kid</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>cnf.jwk</code>, the public JWK (RFC 7800 confirmation key).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>cnf.attestation</code> (optional), see{" "}
          <Link to="/aauth/attestation">attestation</Link>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        For <code>backend: "software"</code> the function delegates to{" "}
        <code>jose.SignJWT</code>. For{" "}
        <code>backend: "apple-secure-enclave"</code> it manually composes
        the JOSE header and payload, computes the SHA-256 digest of the
        signing input, calls <code>se.sign()</code> (the binding returns a
        DER-encoded ECDSA signature produced inside the Enclave), converts
        the DER signature to JOSE r||s, and concatenates the three parts.
        Bit-for-bit compatible with software-signed tokens; private scalar
        never crosses into the JS runtime.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        HTTP message signing (<code>cliSignedFetch</code>)
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Single entry point for authenticated CLI → Neotoma API calls.
        Dispatches on <code>config.backend</code>:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>software</code>, hands <code>signingKey</code> to{" "}
          <code>@hellocoop/httpsig</code>'s <code>signedFetch</code>, which
          signs over the default RFC 9421 component set with the{" "}
          <code>aasig</code> label.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>apple-secure-enclave</code>, routes through{" "}
          <code>seSignedFetch</code>. The helper assembles the same
          component set (<code>@method</code>, <code>@target-uri</code>,
          optional <code>content-type</code> / <code>content-digest</code>,{" "}
          <code>signature-key</code>), builds the RFC 9421 signature base,
          and calls SE-backed <code>seSignJoseEs256</code> to produce the{" "}
          <code>signature</code> header. The agent token is carried in the{" "}
          <code>signature-key</code> header verbatim, exactly like the
          software path.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Both paths produce an identical wire format from the server's
        perspective; only the signing primitive differs.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Generating attestation envelopes
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each backend has a dedicated envelope builder:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>buildAppleAttestationEnvelope</code>, Refuses unless{" "}
          <code>backend === "apple-secure-enclave"</code>; computes the
          challenge as <code>SHA-256(iss || sub || iat)</code> via{" "}
          <code>buildAttestationChallenge</code>; calls{" "}
          <code>{`se.attest({ tag, challenge })`}</code>; packages the
          Apple-issued chain plus key-binding signature. Returns{" "}
          <code>null</code> on non-darwin / missing binding / unsupported
          Enclave; the caller MUST then proceed with a software-tier signed
          write rather than fabricating an envelope.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>buildTpm2AttestationEnvelope</code>, Linux/TPM 2.0
          counterpart in <code>src/cli/aauth_tpm2_attestation.ts</code>.{" "}
          <code>isTpm2BackendAvailable</code> probes without throwing;{" "}
          <code>computeAttestationChallenge</code> derives bit-for-bit the
          same value as the server; the helper calls{" "}
          <code>{`tpm2.attest({ handle, challenge, jkt })`}</code> and
          packages the AIK chain, <code>TPMS_ATTEST</code> quote, and{" "}
          <code>TPMT_PUBLIC</code>. Throws{" "}
          <code>Tpm2BackendUnavailableError</code> with a structured{" "}
          <code>reason</code> when the backend is unavailable.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>buildTbsAttestationEnvelope</code>, Windows / TBS
          counterpart in <code>src/cli/aauth_tbs_attestation.ts</code>. Even
          though the underlying call is <code>NCryptCreateClaim</code>{" "}
          against the Microsoft Platform Crypto Provider rather than raw
          TPM 2.0 commands, the wire format is identical to the Linux TPM 2.0
          envelope (the server reuses the same verifier). Throws{" "}
          <code>TbsBackendUnavailableError</code> with a structured reason
          when unavailable.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>buildYubikeyAttestationEnvelope</code>, Cross-platform
          YubiKey counterpart in{" "}
          <code>src/cli/aauth_yubikey_attestation.ts</code>. Wire format is
          WebAuthn-<code>packed</code>, NOT WebAuthn-<code>tpm</code>.
          Helper packages the per-slot YubiKey attestation cert plus the F9
          intermediate. The <code>aaguid</code> field is hoisted to the
          envelope top level for convenience; the server-side verifier
          extracts AAGUID from the leaf cert's{" "}
          <code>id-fido-gen-ce-aaguid</code> extension when present and
          falls back to this hoisted field when the cert lacks it. Throws{" "}
          <code>YubikeyBackendUnavailableError</code> with a structured
          reason when unavailable.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        PIN handling for YubiKey: every call that does not pass{" "}
        <code>pin</code> explicitly relies on the binding's PIN resolution
        (in priority order: explicit <code>pin</code> argument →{" "}
        <code>NEOTOMA_AAUTH_YUBIKEY_PIN</code> env var → interactive TTY
        prompt). The helper NEVER caches the PIN across invocations and
        NEVER logs PIN values. Three failed attempts lock the YubiKey;
        recovery requires{" "}
        <code>ykman piv access change-pin --puk</code>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        <code>auth session</code> output
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        <code>describeConfiguredSigner()</code> extends the legacy summary
        with three new fields so operators can confirm which backend is in
        use:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>backend</code>, <code>"software"</code>,{" "}
          <code>"apple-secure-enclave"</code>, <code>"tpm2"</code>,{" "}
          <code>"tbs"</code>, or <code>"yubikey"</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>se_key_tag</code> / <code>tpm2_handle</code> /{" "}
          <code>tbs_key_name</code> / <code>yubikey_serial</code> (when
          present).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>hardware_supported</code> /{" "}
          <code>hardware_supported_reason</code> (only when the signer is
          hardware-backed; reflects the most recent{" "}
          <code>isSupported()</code> probe).
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        <code>neotoma auth session</code> renders these fields in its{" "}
        <code>signer:</code> block.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Operator environment
      </h2>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_PRIVATE_JWK_PATH</code>, override JWK location
          for all backends (default{" "}
          <code>~/.neotoma/aauth/private.jwk</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_SE_KEY_TAG</code>, override the keychain tag
          on darwin (default <code>io.neotoma.aauth.cli.default</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_TPM2_HANDLE</code>, override the TPM 2.0
          persistent handle on linux (default <code>0x81010000</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_TPM2_HIERARCHY</code>, override the TPM 2.0
          hierarchy on linux (<code>owner</code> or <code>endorsement</code>;
          default <code>owner</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_WIN_TBS_PROVIDER</code> /{" "}
          <code>NEOTOMA_AAUTH_WIN_TBS_KEY_NAME</code> /{" "}
          <code>NEOTOMA_AAUTH_WIN_TBS_SCOPE</code>, override the NCrypt
          provider, key name, and scope (<code>user</code> or{" "}
          <code>machine</code>) on Windows.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH</code> /{" "}
          <code>NEOTOMA_AAUTH_YUBIKEY_SERIAL</code> /{" "}
          <code>NEOTOMA_AAUTH_YUBIKEY_PIN</code>, point at{" "}
          <code>libykcs11</code>, pin to a specific YubiKey by decimal
          serial, or inject the PIV PIN non-interactively.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>NEOTOMA_AAUTH_HARDWARE_BACKEND</code>, pin the hardware
          backend selection (<code>auto</code>, <code>apple-secure-enclave</code>
          , <code>tpm2</code>, <code>tbs</code>, <code>yubikey</code>;
          default <code>auto</code>).
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Server-side trust knobs (<code>NEOTOMA_AAUTH_ATTESTATION_CA_PATH</code>
        , <code>NEOTOMA_OPERATOR_ATTESTED_ISSUERS</code>, etc.) are
        documented on the <Link to="/aauth/attestation">attestation</Link>{" "}
        page; the CLI does not consume them directly.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Back to <Link to="/aauth">AAuth overview</Link>. See also{" "}
        <Link to="/aauth/spec">AAuth spec</Link>,{" "}
        <Link to="/aauth/attestation">attestation</Link>,{" "}
        <Link to="/aauth/integration">integration</Link>.
      </p>
    </DetailPage>
  );
}
