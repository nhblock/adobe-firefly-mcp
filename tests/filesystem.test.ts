import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sanitizeFilenamePart, uniqueFilePath } from "../src/utils/filesystem.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-mcp-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("filesystem utilities", () => {
  it("sanitizes filenames while preserving useful words", () => {
    expect(sanitizeFilenamePart(" neon/city: poster!? ")).toBe("neon-city-poster");
  });

  it("returns a unique path without overwriting existing files", async () => {
    const first = await uniqueFilePath(tempDir, "image", ".png");
    await fs.writeFile(first, "first");

    const second = await uniqueFilePath(tempDir, "image", ".png");
    expect(path.basename(second)).toBe("image-1.png");
  });
});
