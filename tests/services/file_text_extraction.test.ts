import { describe, expect, it } from "vitest";
import { getMimeTypeFromExtension, sniffMimeTypeFromBuffer } from "../../src/services/file_text_extraction.js";

describe("file_text_extraction MIME helpers", () => {
  it("sniffs jpeg bytes even when the extension would suggest png", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    expect(sniffMimeTypeFromBuffer(jpegHeader)).toBe("image/jpeg");
    expect(getMimeTypeFromExtension(".png")).toBe("image/png");
  });

  it("sniffs png bytes from the file signature", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(sniffMimeTypeFromBuffer(pngHeader)).toBe("image/png");
  });

  it("returns null for unknown binary headers", () => {
    const unknownHeader = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);

    expect(sniffMimeTypeFromBuffer(unknownHeader)).toBeNull();
  });
});
