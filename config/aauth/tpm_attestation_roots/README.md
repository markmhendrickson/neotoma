# TPM 2.0 Attestation Roots

This directory bundles the TPM 2.0 manufacturer Attestation Identity Key
(AIK) root CAs that the AAuth attestation verifier
(`src/services/aauth_attestation_tpm2.ts`) trusts when validating
WebAuthn `tpm` attestation envelopes.

The verifier appends every `.pem` / `.crt` certificate found here to the
merged trust set returned by
`loadAttestationTrustConfig()` in
`src/services/aauth_attestation_trust_config.ts`. Operators can override
this directory by pointing `NEOTOMA_AAUTH_TPM_ROOTS_PATH` at an
alternative directory (or single PEM file).

## Bundling Policy

Each vendor's CA is bundled in a sub-directory named after the vendor.
Every certificate file MUST be accompanied by a one-line provenance
comment of the form:

```
# Source: <vendor URL>
# SHA-256: <fingerprint>
```

placed at the top of the PEM. Provenance metadata is mirrored in the
table below and audited at release time. Roots are bundled directly
because the WebAuthn `tpm` format does not negotiate trust at runtime;
the verifier needs every supported manufacturer ahead of time.

## Vendor Bundles

The directory currently expects the following vendor bundles. The
bundles themselves are added as part of the release that turns on the
`tpm2` verifier; until then, the verifier cascades to the operator
allowlist or `software` tier.

| Vendor      | Sub-directory      | Source                                                         | SHA-256 |
| ----------- | ------------------ | -------------------------------------------------------------- | ------- |
| Infineon    | `infineon/`        | https://pki.infineon.com/                                       | _bundle to be added in v0.9.0_ |
| STMicro     | `stmicro/`         | https://www.st.com/content/st_com/en/about/quality-and-reliability/security-certifications/tpm.html | _bundle to be added in v0.9.0_ |
| Intel       | `intel/`           | https://pki.intel.com/                                          | _bundle to be added in v0.9.0_ |
| AMD         | `amd/`             | https://developer.amd.com/sev/                                  | _bundle to be added in v0.9.0_ |
| Microsoft   | `microsoft/`       | https://www.microsoft.com/pkiops/Docs/Repository.htm            | _bundle to be added in v0.9.0_ |

## Adding a Vendor Root

1. Download the manufacturer's published TPM CA certificate.
2. Verify its fingerprint matches the value the manufacturer publishes
   over an authenticated channel (HTTPS + signed PDF).
3. Drop the PEM under `tpm_attestation_roots/<vendor>/`.
4. Prepend the provenance header (`# Source:` + `# SHA-256:`).
5. Update the table above.
6. Add a fingerprint regression test in
   `tests/unit/aauth_attestation_trust_config.test.ts` so operators
   discover bundle drift before a release.

## Test Bundles

Synthetic AIK roots used by
`tests/unit/aauth_attestation_tpm2.test.ts` and
`tests/integration/aauth_tpm2_e2e.test.ts` are generated at runtime in
the test fixture directory and never committed. See the test files for
the exact OpenSSL invocations.
