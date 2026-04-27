/**
 * Hand-written decoders for the TPM 2.0 structures that the WebAuthn
 * `tpm` attestation statement carries:
 *
 *   - `TPMT_PUBLIC` — the public area of the bound key
 *     (Trusted Computing Group, "TPM 2.0 Library, Part 2 — Structures",
 *     §12.2.4).
 *   - `TPMS_ATTEST` — the quote / certify payload signed by the AIK
 *     (TCG TPM 2.0 Library, Part 2, §10.12.8).
 *
 * Implemented from scratch against the spec; no external TPM dependency.
 * The decoders only support the subset of `TPMT_PUBLIC` (RSA / ECC) and
 * `TPMS_ATTEST` (ATTEST_QUOTE / ATTEST_CERTIFY) needed by the
 * server-side WebAuthn `tpm` verifier. Anything outside that subset
 * throws `TpmStructuresError` so the verifier can convert the failure
 * into a structured outcome rather than propagating an unchecked
 * exception.
 *
 * All multi-byte fields are big-endian per the TCG canonical encoding.
 */

/** Constant identifying TPM2 quote/certify payloads ("TCG\0" big-endian). */
export const TPM_GENERATED_VALUE = 0xff544347;

export const TPM_ST_ATTEST_QUOTE = 0x8014;
export const TPM_ST_ATTEST_CERTIFY = 0x8017;

export const TPM_ALG_RSA = 0x0001;
export const TPM_ALG_ECC = 0x0023;

export const TPM_ALG_SHA1 = 0x0004;
export const TPM_ALG_SHA256 = 0x000b;
export const TPM_ALG_SHA384 = 0x000c;
export const TPM_ALG_SHA512 = 0x000d;

export const TPM_ECC_NIST_P256 = 0x0003;
export const TPM_ECC_NIST_P384 = 0x0004;
export const TPM_ECC_NIST_P521 = 0x0005;

export class TpmStructuresError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TpmStructuresError";
  }
}

export type TpmtPublicKey =
  | {
      type: "rsa";
      nameAlg: number;
      objectAttributes: number;
      n: Buffer;
      e: Buffer;
    }
  | {
      type: "ecc";
      nameAlg: number;
      objectAttributes: number;
      curve: "P-256" | "P-384" | "P-521";
      x: Buffer;
      y: Buffer;
    };

export interface TpmsAttest {
  magic: number;
  type: number;
  qualifiedSigner: Buffer;
  extraData: Buffer;
  clockInfo: Buffer;
  firmwareVersion: bigint;
  attested: TpmsAttestQuote | TpmsAttestCertify;
}

export interface TpmsAttestQuote {
  kind: "quote";
  pcrSelect: Buffer;
  pcrDigest: Buffer;
}

export interface TpmsAttestCertify {
  kind: "certify";
  /** Concatenation of nameAlg (2 bytes BE) || digest. */
  name: Buffer;
  qualifiedName: Buffer;
}

class Cursor {
  constructor(private readonly buf: Buffer, private pos = 0) {}

  remaining(): number {
    return this.buf.length - this.pos;
  }

  position(): number {
    return this.pos;
  }

  readUInt8(): number {
    if (this.pos + 1 > this.buf.length) {
      throw new TpmStructuresError("unexpected end of buffer (uint8)");
    }
    const value = this.buf[this.pos]!;
    this.pos += 1;
    return value;
  }

  readUInt16(): number {
    if (this.pos + 2 > this.buf.length) {
      throw new TpmStructuresError("unexpected end of buffer (uint16)");
    }
    const value = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return value;
  }

  readUInt32(): number {
    if (this.pos + 4 > this.buf.length) {
      throw new TpmStructuresError("unexpected end of buffer (uint32)");
    }
    const value = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return value;
  }

  readUInt64(): bigint {
    if (this.pos + 8 > this.buf.length) {
      throw new TpmStructuresError("unexpected end of buffer (uint64)");
    }
    const value = this.buf.readBigUInt64BE(this.pos);
    this.pos += 8;
    return value;
  }

  /** Read TPM2B-style length-prefixed blob (uint16 length + payload). */
  readSizedBuffer(): Buffer {
    const len = this.readUInt16();
    if (this.pos + len > this.buf.length) {
      throw new TpmStructuresError("sized buffer overflows input");
    }
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return Buffer.from(slice);
  }

  readBytes(length: number): Buffer {
    if (this.pos + length > this.buf.length) {
      throw new TpmStructuresError("unexpected end of buffer (bytes)");
    }
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return Buffer.from(slice);
  }

  readRemaining(): Buffer {
    const slice = this.buf.subarray(this.pos);
    this.pos = this.buf.length;
    return Buffer.from(slice);
  }
}

/**
 * Map a hash algorithm identifier to the digest size in bytes used by
 * `TPM2B_DIGEST` payloads in `TPMU_ATTEST` and `TPMS_ATTEST.attested.name`.
 */
export function digestLengthForAlg(alg: number): number {
  switch (alg) {
    case TPM_ALG_SHA1:
      return 20;
    case TPM_ALG_SHA256:
      return 32;
    case TPM_ALG_SHA384:
      return 48;
    case TPM_ALG_SHA512:
      return 64;
    default:
      throw new TpmStructuresError(`unsupported digest alg 0x${alg.toString(16)}`);
  }
}

/**
 * Decode a `TPMT_PUBLIC` structure from a TPM2 statement's `pubArea`.
 *
 * Layout (from TCG TPM 2.0 Library, Part 2, §12.2.4):
 *   TPMI_ALG_PUBLIC      type            (UINT16)
 *   TPMI_ALG_HASH        nameAlg         (UINT16)
 *   TPMA_OBJECT          objectAttributes (UINT32)
 *   TPM2B_DIGEST         authPolicy      (UINT16 length || digest)
 *   TPMU_PUBLIC_PARMS    parameters      (variable per `type`)
 *   TPMU_PUBLIC_ID       unique          (variable per `type`)
 *
 * For the WebAuthn `tpm` format we only handle RSA and ECC keys.
 */
export function parseTpmtPublic(buf: Buffer): TpmtPublicKey {
  const cursor = new Cursor(buf);
  const type = cursor.readUInt16();
  const nameAlg = cursor.readUInt16();
  const objectAttributes = cursor.readUInt32();
  // authPolicy is a TPM2B_DIGEST that we ignore.
  cursor.readSizedBuffer();

  if (type === TPM_ALG_RSA) {
    // TPMS_RSA_PARMS:
    //   TPMT_SYM_DEF_OBJECT    symmetric        (UINT16 alg + extras)
    //   TPMT_RSA_SCHEME        scheme           (UINT16 alg + extras)
    //   TPMI_RSA_KEY_BITS      keyBits          (UINT16)
    //   UINT32                 exponent
    const symmetric = cursor.readUInt16();
    if (symmetric !== 0x0010) {
      // 0x0010 = TPM_ALG_NULL → "no symmetric algorithm" (fido2/yubikey path).
      // Other values indicate a symmetric scheme is attached and would
      // require the additional `keyBits` + `mode` fields. We do not support
      // those here and reject explicitly so callers get a clean error.
      throw new TpmStructuresError(
        `unsupported TPMT_SYM_DEF_OBJECT alg 0x${symmetric.toString(16)}`,
      );
    }
    const rsaScheme = cursor.readUInt16();
    if (rsaScheme !== 0x0010) {
      // Anything other than TPM_ALG_NULL (no scheme) requires extra bytes
      // we cannot model without expanding the supported subset.
      // We accept TPM_ALG_NULL (0x0010) which is what fido2 / Microsoft
      // attestation typically emits.
      // eslint-disable-next-line no-console
      // (Silently consuming extra bytes here would risk drifting cursor.)
      throw new TpmStructuresError(
        `unsupported TPMT_RSA_SCHEME alg 0x${rsaScheme.toString(16)}`,
      );
    }
    cursor.readUInt16(); // keyBits — informational, derivable from `n`.
    const rawExponent = cursor.readUInt32();
    // Per spec, an exponent of 0 means the default (65537).
    const exponentValue = rawExponent === 0 ? 65537 : rawExponent;
    const e = encodeRsaExponent(exponentValue);
    const n = cursor.readSizedBuffer();
    return {
      type: "rsa",
      nameAlg,
      objectAttributes,
      n,
      e,
    };
  }

  if (type === TPM_ALG_ECC) {
    // TPMS_ECC_PARMS:
    //   TPMT_SYM_DEF_OBJECT    symmetric    (UINT16 alg + extras)
    //   TPMT_ECC_SCHEME        scheme       (UINT16 alg + extras)
    //   TPMI_ECC_CURVE         curveID      (UINT16)
    //   TPMT_KDF_SCHEME        kdf          (UINT16 alg + extras)
    const symmetric = cursor.readUInt16();
    if (symmetric !== 0x0010) {
      throw new TpmStructuresError(
        `unsupported TPMT_SYM_DEF_OBJECT alg 0x${symmetric.toString(16)}`,
      );
    }
    const eccScheme = cursor.readUInt16();
    if (eccScheme !== 0x0010 && eccScheme !== 0x0018 /* TPM_ALG_ECDSA */) {
      throw new TpmStructuresError(
        `unsupported TPMT_ECC_SCHEME alg 0x${eccScheme.toString(16)}`,
      );
    }
    if (eccScheme === 0x0018) {
      // ECDSA scheme carries a hashAlg.
      cursor.readUInt16();
    }
    const curveId = cursor.readUInt16();
    const kdfScheme = cursor.readUInt16();
    if (kdfScheme !== 0x0010) {
      throw new TpmStructuresError(
        `unsupported TPMT_KDF_SCHEME alg 0x${kdfScheme.toString(16)}`,
      );
    }
    const x = cursor.readSizedBuffer();
    const y = cursor.readSizedBuffer();
    const curve = mapEccCurve(curveId);
    return {
      type: "ecc",
      nameAlg,
      objectAttributes,
      curve,
      x,
      y,
    };
  }

  throw new TpmStructuresError(`unsupported TPMI_ALG_PUBLIC 0x${type.toString(16)}`);
}

function mapEccCurve(curveId: number): "P-256" | "P-384" | "P-521" {
  switch (curveId) {
    case TPM_ECC_NIST_P256:
      return "P-256";
    case TPM_ECC_NIST_P384:
      return "P-384";
    case TPM_ECC_NIST_P521:
      return "P-521";
    default:
      throw new TpmStructuresError(
        `unsupported TPMI_ECC_CURVE 0x${curveId.toString(16)}`,
      );
  }
}

function encodeRsaExponent(value: number): Buffer {
  if (value <= 0) throw new TpmStructuresError("invalid RSA exponent");
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Buffer.from(bytes);
}

/**
 * Decode a `TPMS_ATTEST` structure from a TPM2 statement's `certInfo`.
 *
 * Layout (TCG TPM 2.0 Library, Part 2, §10.12.8):
 *   TPM_GENERATED        magic                (UINT32)
 *   TPMI_ST_ATTEST       type                 (UINT16)
 *   TPM2B_NAME           qualifiedSigner      (UINT16 length || data)
 *   TPM2B_DATA           extraData            (UINT16 length || data)
 *   TPMS_CLOCK_INFO      clockInfo            (17 bytes: u64 clock + u32 resetCount + u32 restartCount + u8 safe)
 *   UINT64               firmwareVersion
 *   TPMU_ATTEST          attested             (variable per `type`)
 */
export function parseTpmsAttest(buf: Buffer): TpmsAttest {
  const cursor = new Cursor(buf);
  const magic = cursor.readUInt32();
  if (magic !== TPM_GENERATED_VALUE) {
    throw new TpmStructuresError(
      `TPMS_ATTEST magic mismatch (got 0x${magic.toString(16)})`,
    );
  }
  const type = cursor.readUInt16();
  const qualifiedSigner = cursor.readSizedBuffer();
  const extraData = cursor.readSizedBuffer();
  const clockInfo = cursor.readBytes(17);
  const firmwareVersion = cursor.readUInt64();

  let attested: TpmsAttestQuote | TpmsAttestCertify;
  if (type === TPM_ST_ATTEST_QUOTE) {
    // TPMS_QUOTE_INFO:
    //   TPML_PCR_SELECTION pcrSelect (UINT32 count + per-bank header + bitmap)
    //   TPM2B_DIGEST       pcrDigest
    const pcrSelectStart = cursor.position();
    const count = cursor.readUInt32();
    for (let i = 0; i < count; i += 1) {
      cursor.readUInt16(); // hash alg
      const sizeOfSelect = cursor.readUInt8();
      cursor.readBytes(sizeOfSelect);
    }
    const pcrSelectEnd = cursor.position();
    const pcrSelectBytes = buf.subarray(pcrSelectStart, pcrSelectEnd);
    const pcrDigest = cursor.readSizedBuffer();
    attested = {
      kind: "quote",
      pcrSelect: Buffer.from(pcrSelectBytes),
      pcrDigest,
    };
  } else if (type === TPM_ST_ATTEST_CERTIFY) {
    // TPMS_CERTIFY_INFO:
    //   TPM2B_NAME name
    //   TPM2B_NAME qualifiedName
    const name = cursor.readSizedBuffer();
    const qualifiedName = cursor.readSizedBuffer();
    attested = { kind: "certify", name, qualifiedName };
  } else {
    throw new TpmStructuresError(
      `unsupported TPMI_ST_ATTEST 0x${type.toString(16)}`,
    );
  }

  return {
    magic,
    type,
    qualifiedSigner,
    extraData,
    clockInfo,
    firmwareVersion,
    attested,
  };
}
