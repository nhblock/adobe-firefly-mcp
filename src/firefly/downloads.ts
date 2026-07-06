import type { Page } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export interface DownloadResult {
  success: boolean;
  filePaths?: string[];
  error?: string;
}

export async function waitForDownload(
  page: Page,
  options: {
    directory?: string;
    timeoutMs?: number;
  } = {},
): Promise<DownloadResult> {
  const { directory = path.join(tmpdir(), "firefly-downloads"), timeoutMs = 120000 } =
    options;
  await mkdir(directory, { recursive: true });

  try {
    const download = await page.waitForEvent("download", { timeout: timeoutMs });
    const suggestedName = download.suggestedFilename();
    const filePath = path.join(directory, `${randomUUID()}-${suggestedName}`);
    await download.saveAs(filePath);
    return { success: true, filePaths: [filePath] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Download failed: ${msg}` };
  }
}

export async function waitForAllDownloads(
  page: Page,
  options: {
    directory?: string;
    timeoutMs?: number;
    expectedCount?: number;
  } = {},
): Promise<DownloadResult> {
  const {
    directory = path.join(tmpdir(), "firefly-downloads"),
    timeoutMs = 120000,
    expectedCount = 1,
  } = options;
  await mkdir(directory, { recursive: true });

  const filePaths: string[] = [];

  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: timeoutMs }),
      ...Array.from({ length: expectedCount - 1 }, () =>
        page.waitForEvent("download", { timeout: timeoutMs }),
      ),
    ]);

    const downloads = [download];
    for (let i = 1; i < expectedCount; i++) {
      downloads.push(await page.waitForEvent("download", { timeout: timeoutMs }));
    }

    for (const dl of downloads) {
      const suggestedName = dl.suggestedFilename();
      const filePath = path.join(directory, `${randomUUID()}-${suggestedName}`);
      await dl.saveAs(filePath);
      filePaths.push(filePath);
    }

    return { success: true, filePaths };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Download failed: ${msg}` };
  }
}

export async function handleVideoDownload(
  page: Page,
  options: {
    directory?: string;
    timeoutMs?: number;
    downloadMode?: "first" | "all";
  } = {},
): Promise<DownloadResult> {
  const { directory, timeoutMs = 120000, downloadMode = "first" } = options;

  if (downloadMode === "all") {
    return waitForAllDownloads(page, { directory, timeoutMs, expectedCount: 1 });
  }

  return waitForDownload(page, { directory, timeoutMs });
}
