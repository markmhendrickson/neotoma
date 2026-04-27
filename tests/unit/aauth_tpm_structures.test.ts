import { describe, expect, it } from "vitest";

import {
  TPM_ALG_ECC,
  TPM_ALG_RSA,
  TPM_ALG_SHA256,
  TPM_ECC_NIST_P256,
  TPM_GENERATED_VALUE,
  TPM_ST_ATTEST_CERTIFY,
  TPM_ST_ATTEST_QUOTE,
  TpmStructuresError,
  digestLengthForAlg,
  parseTpmsAttest,
  parseTpmtPublic,
} from "../../src/services/aauth_tpm_structures.js";

const TPM_ALG_NULL = 0x0010;

function uint16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

function uint32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function uint64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(value, 0);
  return buf;
}

function sized(value: Buffer): Buffer {
  return Buffer.concat([uint16(value.length), value]);
}

function buildTpmtPublicRsa(opts: {
  nameAlg?: number;
  objectAttributes?: number;
  modulus: Buffer;
  exponent?: number;
}): Buffer {
  const nameAlg = opts.nameAlg ?? TPM_ALG_SHA256;
  const objectAttributes = opts.objectAttributes ?? 0x00040472;
  const exponent = opts.exponent ?? 0;
  return Buffer.concat([
    uint16(TPM_ALG_RSA),
    uint16(nameAlg),
    uint32(objectAttributes),
    sized(Buffer.alloc(0)), // authPolicy empty
    uint16(TPM_ALG_NULL), // symmetric
    uint16(TPM_ALG_NULL), // rsaScheme
    uint16(2048), // keyBits
    uint32(exponent),
    sized(opts.modulus),
  ]);
}

function buildTpmtPublicEcc(opts: {
  nameAlg?: number;
  objectAttributes?: number;
  curveId?: number;
  x: Buffer;
  y: Buffer;
}): Buffer {
  const nameAlg = opts.nameAlg ?? TPM_ALG_SHA256;
  const objectAttributes = opts.objectAttributes ?? 0x00040472;
  const curveId = opts.curveId ?? TPM_ECC_NIST_P256;
  return Buffer.concat([
    uint16(TPM_ALG_ECC),
    uint16(nameAlg),
    uint32(objectAttributes),
    sized(Buffer.alloc(0)),
    uint16(TPM_ALG_NULL),
    uint16(TPM_ALG_NULL),
    uint16(curveId),
    uint16(TPM_ALG_NULL),
    sized(opts.x),
    sized(opts.y),
  ]);
}

function buildTpmsAttestQuote(opts: {
  extraData: Buffer;
  pcrDigest?: Buffer;
}): Buffer {
  const pcrSelect = Buffer.concat([
    uint32(1), // count
    uint16(TPM_ALG_SHA256), // bank hash
    Buffer.from([0x03]), // sizeOfSelect
    Buffer.from([0xff, 0xff, 0xff]),
  ]);
  return Buffer.concat([
    uint32(TPM_GENERATED_VALUE),
    uint16(TPM_ST_ATTEST_QUOTE),
    sized(Buffer.alloc(0)), // qualifiedSigner
    sized(opts.extraData),
    Buffer.alloc(17), // clockInfo
    uint64(0n), // firmwareVersion
    pcrSelect,
    sized(opts.pcrDigest ?? Buffer.alloc(32)),
  ]);
}

function buildTpmsAttestCertify(opts: {
  extraData: Buffer;
  name: Buffer;
  qualifiedName?: Buffer;
}): Buffer {
  return Buffer.concat([
    uint32(TPM_GENERATED_VALUE),
    uint16(TPM_ST_ATTEST_CERTIFY),
    sized(Buffer.alloc(0)),
    sized(opts.extraData),
    Buffer.alloc(17),
    uint64(0n),
    sized(opts.name),
    sized(opts.qualifiedName ?? Buffer.alloc(0)),
  ]);
}

describe("aauth_tpm_structures", () => {
  describe("digestLengthForAlg", () => {
    it("maps SHA family algs to lengths", () => {
      expect(digestLengthForAlg(0x0004)).toBe(20);
      expect(digestLengthForAlg(0x000b)).toBe(32);
      expect(digestLengthForAlg(0x000c)).toBe(48);
      expect(digestLengthForAlg(0x000d)).toBe(64);
    });

    it("rejects unknown algs", () => {
      expect(() => digestLengthForAlg(0x9999)).toThrow(TpmStructuresError);
    });
  });

  describe("parseTpmtPublic", () => {
    it("parses an RSA TPMT_PUBLIC and treats exponent 0 as 65537", () => {
      const modulus = Buffer.alloc(256, 0xab);
      const blob = buildTpmtPublicRsa({ modulus });
      const parsed = parseTpmtPublic(blob);
      expect(parsed.type).toBe("rsa");
      if (parsed.type !== "rsa") return;
      expect(parsed.n.equals(modulus)).toBe(true);
      expect(parsed.e.equals(Buffer.from([0x01, 0x00, 0x01]))).toBe(true);
      expect(parsed.nameAlg).toBe(TPM_ALG_SHA256);
    });

    it("parses an explicit RSA exponent", () => {
      const modulus = Buffer.alloc(256, 0xcd);
      const blob = buildTpmtPublicRsa({ modulus, exponent: 3 });
      const parsed = parseTpmtPublic(blob);
      if (parsed.type !== "rsa") throw new Error("expected RSA");
      expect(parsed.e.equals(Buffer.from([0x03]))).toBe(true);
    });

    it("parses an ECC P-256 TPMT_PUBLIC", () => {
      const x = Buffer.alloc(32, 0x11);
      const y = Buffer.alloc(32, 0x22);
      const blob = buildTpmtPublicEcc({ x, y });
      const parsed = parseTpmtPublic(blob);
      expect(parsed.type).toBe("ecc");
      if (parsed.type !== "ecc") return;
      expect(parsed.curve).toBe("P-256");
      expect(parsed.x.equals(x)).toBe(true);
      expect(parsed.y.equals(y)).toBe(true);
    });

    it("rejects unsupported TPMI_ALG_PUBLIC values", () => {
      const blob = Buffer.concat([
        uint16(0x0008), // unsupported
        uint16(TPM_ALG_SHA256),
        uint32(0),
        sized(Buffer.alloc(0)),
      ]);
      expect(() => parseTpmtPublic(blob)).toThrow(TpmStructuresError);
    });

    it("rejects truncated input", () => {
      expect(() => parseTpmtPublic(Buffer.from([0x00, 0x01]))).toThrow(
        TpmStructuresError,
      );
    });
  });

  describe("parseTpmsAttest", () => {
    it("parses a quote payload with extraData", () => {
      const extra = Buffer.from("test extra".padEnd(32, "x"));
      const blob = buildTpmsAttestQuote({ extraData: extra });
      const parsed = parseTpmsAttest(blob);
      expect(parsed.magic).toBe(TPM_GENERATED_VALUE);
      expect(parsed.type).toBe(TPM_ST_ATTEST_QUOTE);
      expect(parsed.extraData.equals(extra)).toBe(true);
      expect(parsed.attested.kind).toBe("quote");
    });

    it("parses a certify payload", () => {
      const extra = Buffer.from("certify".padEnd(32, "y"));
      const name = Buffer.concat([uint16(TPM_ALG_SHA256), Buffer.alloc(32, 0x77)]);
      const blob = buildTpmsAttestCertify({ extraData: extra, name });
      const parsed = parseTpmsAttest(blob);
      expect(parsed.type).toBe(TPM_ST_ATTEST_CERTIFY);
      expect(parsed.attested.kind).toBe("certify");
      if (parsed.attested.kind !== "certify") return;
      expect(parsed.attested.name.equals(name)).toBe(true);
    });

    it("rejects bad magic values", () => {
      const blob = Buffer.concat([
        uint32(0xdeadbeef),
        uint16(TPM_ST_ATTEST_QUOTE),
        sized(Buffer.alloc(0)),
        sized(Buffer.alloc(0)),
        Buffer.alloc(17),
        uint64(0n),
      ]);
      expect(() => parseTpmsAttest(blob)).toThrow(TpmStructuresError);
    });

    it("rejects unsupported attestation types", () => {
      const blob = Buffer.concat([
        uint32(TPM_GENERATED_VALUE),
        uint16(0x801f), // unsupported
        sized(Buffer.alloc(0)),
        sized(Buffer.alloc(0)),
        Buffer.alloc(17),
        uint64(0n),
      ]);
      expect(() => parseTpmsAttest(blob)).toThrow(TpmStructuresError);
    });
  });
});
