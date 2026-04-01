import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptResponseMiddleware } from "../../src/middleware/encrypt_response.js";
import { encryptResponse } from "../../src/services/encryption_service.js";

vi.mock("../../src/services/encryption_service.js", () => ({
  encryptResponse: vi.fn(),
}));

describe("encryptResponseMiddleware", () => {
  beforeEach(() => {
    vi.mocked(encryptResponse).mockReset();
  });

  it("wraps res.json with encrypted output when encryption is requested", async () => {
    vi.mocked(encryptResponse).mockResolvedValue("ciphertext");
    const originalJson = vi.fn();
    const next = vi.fn();
    const req = {
      headers: { "x-encrypt-response": "true" },
      publicKey: new Uint8Array([1, 2, 3]),
    } as any;
    const res = { json: originalJson } as any;

    encryptResponseMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();

    res.json({ ok: true });
    await Promise.resolve();

    expect(encryptResponse).toHaveBeenCalledWith({ ok: true }, req.publicKey);
    expect(originalJson).toHaveBeenCalledWith({ encryptedPayload: "ciphertext" });
  });

  it("returns a plain error object when encryption fails", async () => {
    vi.mocked(encryptResponse).mockRejectedValue(new Error("boom"));
    const originalJson = vi.fn();
    const req = {
      headers: { "x-neotoma-encrypted": "true" },
      publicKey: new Uint8Array([9, 9, 9]),
    } as any;
    const res = { json: originalJson } as any;

    encryptResponseMiddleware(req, res, vi.fn());
    res.json({ ok: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(originalJson).toHaveBeenCalledWith({ error: "Failed to encrypt response" });
  });

  it("leaves res.json untouched when encryption is not requested", () => {
    const originalJson = vi.fn();
    const req = {
      headers: {},
      publicKey: new Uint8Array([1, 2, 3]),
    } as any;
    const res = { json: originalJson } as any;

    encryptResponseMiddleware(req, res, vi.fn());
    res.json({ plain: true });

    expect(encryptResponse).not.toHaveBeenCalled();
    expect(originalJson).toHaveBeenCalledWith({ plain: true });
  });
});
