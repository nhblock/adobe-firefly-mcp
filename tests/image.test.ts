import { describe, expect, it } from "vitest";

import {
  detectImageMimeType,
  extensionForMimeType,
  parseDataUrlImage,
} from "../src/utils/image.js";

describe("image utilities", () => {
  it("parses base64 image data URLs", () => {
    const parsed = parseDataUrlImage("data:image/png;base64,aGVsbG8=");

    expect(parsed.buffer.toString("utf8")).toBe("hello");
    expect(parsed.extension).toBe(".png");
    expect(parsed.mimeType).toBe("image/png");
  });

  it("maps mime types to file extensions", () => {
    expect(extensionForMimeType("image/jpeg")).toBe(".jpg");
    expect(extensionForMimeType("image/webp")).toBe(".webp");
    expect(extensionForMimeType("application/octet-stream")).toBe(".png");
  });

  it("detects common image magic numbers", () => {
    expect(
      detectImageMimeType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
  });
});
