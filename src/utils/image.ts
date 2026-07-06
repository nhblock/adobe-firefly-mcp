import fs from "node:fs/promises";
import path from "node:path";

export interface DataUrlImage {
  buffer: Buffer;
  extension: string;
  mimeType: string;
}

const supportedExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export async function assertReadableImage(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved);

  if (!stats.isFile()) {
    throw new Error(`Image path is not a file: ${resolved}`);
  }

  const extension = path.extname(resolved).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new Error(
      `Unsupported image extension "${extension}". Use PNG, JPEG, GIF, or WebP.`,
    );
  }

  return resolved;
}

export function parseDataUrlImage(dataUrl: string): DataUrlImage {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/u.exec(dataUrl);
  if (match === null) {
    throw new Error("Expected a base64 image data URL.");
  }

  const mimeType = match[1];
  const base64 = match[2];
  if (mimeType === undefined || base64 === undefined) {
    throw new Error("Expected a base64 image data URL.");
  }

  const extension = extensionForMimeType(mimeType);
  return {
    buffer: Buffer.from(base64, "base64"),
    extension,
    mimeType,
  };
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

export function detectImageMimeType(buffer: Buffer): string | undefined {
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }

  return undefined;
}
