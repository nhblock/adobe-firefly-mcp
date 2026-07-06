import fs from "node:fs/promises";
import path from "node:path";

import type { Download, Page } from "playwright";

import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import {
  ensureDirectory,
  sanitizeFilenamePart,
  uniqueFilePath,
} from "../utils/filesystem.js";
import { extensionForMimeType, parseDataUrlImage } from "../utils/image.js";
import { locatorFor, selectorGroups } from "./selectors.js";

export interface DownloadedImage {
  height?: number;
  mimeType?: string;
  path: string;
  source: "download" | "image-src";
  suggestedFilename?: string;
  width?: number;
}

export interface DownloadGeneratedImagesOptions {
  beforeFingerprints: Set<string>;
  basename: string;
  maxFiles: number;
  outputDir: string;
}

interface ExtractedImage {
  dataUrl: string;
  fingerprint: string;
  height: number;
  mimeType: string;
  width: number;
}

export async function downloadGeneratedImages(
  page: Page,
  config: AppConfig,
  logger: Logger,
  options: DownloadGeneratedImagesOptions,
): Promise<DownloadedImage[]> {
  await ensureDirectory(options.outputDir);

  const files: DownloadedImage[] = [];
  files.push(
    ...(await clickDownloadButtons(page, config, logger, options, options.maxFiles)),
  );

  if (files.length < options.maxFiles) {
    files.push(
      ...(await saveVisibleImages(page, logger, {
        ...options,
        maxFiles: options.maxFiles - files.length,
        startIndex: files.length + 1,
      })),
    );
  }

  return files;
}

async function clickDownloadButtons(
  page: Page,
  config: AppConfig,
  logger: Logger,
  options: DownloadGeneratedImagesOptions,
  maxFiles: number,
): Promise<DownloadedImage[]> {
  const groups = selectorGroups(config);
  const files: DownloadedImage[] = [];

  for (const candidate of groups.downloadButtons) {
    if (files.length >= maxFiles) {
      break;
    }

    const locator = locatorFor(page, candidate);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count && files.length < maxFiles; index += 1) {
      const button = locator.nth(index);
      const visible = await button.isVisible({ timeout: 250 }).catch(() => false);
      if (!visible) {
        continue;
      }

      const downloadPromise = page
        .waitForEvent("download", { timeout: 15_000 })
        .catch(() => undefined);

      const clicked = await button.click({ timeout: 5_000 }).then(
        () => true,
        () => false,
      );

      const download = clicked ? await downloadPromise : undefined;
      if (download === undefined) {
        continue;
      }

      const file = await saveDownload(
        download,
        options.outputDir,
        options.basename,
        files.length + 1,
      );
      files.push(file);
      logger.info("Saved generated image from download event", {
        path: file.path,
        selector: candidate.name,
      });
    }
  }

  return files;
}

async function saveDownload(
  download: Download,
  outputDir: string,
  basename: string,
  index: number,
): Promise<DownloadedImage> {
  const suggestedFilename = download.suggestedFilename();
  const suggestedExtension = path.extname(suggestedFilename);
  const extension = suggestedExtension.length > 0 ? suggestedExtension : ".png";
  const target = await uniqueFilePath(outputDir, `${basename}-${index}`, extension);

  await download.saveAs(target);

  return {
    path: target,
    source: "download",
    suggestedFilename,
  };
}

async function saveVisibleImages(
  page: Page,
  logger: Logger,
  options: DownloadGeneratedImagesOptions & {
    maxFiles: number;
    startIndex: number;
  },
): Promise<DownloadedImage[]> {
  const extracted = await extractVisibleImages(page, options.beforeFingerprints);
  const files: DownloadedImage[] = [];

  for (const image of extracted.slice(0, options.maxFiles)) {
    const parsed = parseDataUrlImage(image.dataUrl);
    const target = await uniqueFilePath(
      options.outputDir,
      `${sanitizeFilenamePart(options.basename)}-${options.startIndex + files.length}`,
      extensionForMimeType(image.mimeType) || parsed.extension,
    );

    await fs.writeFile(target, parsed.buffer);
    files.push({
      height: image.height,
      mimeType: parsed.mimeType,
      path: target,
      source: "image-src",
      width: image.width,
    });
    logger.info("Saved generated image from visible image source", { path: target });
  }

  return files;
}

async function extractVisibleImages(
  page: Page,
  beforeFingerprints: Set<string>,
): Promise<ExtractedImage[]> {
  return page.evaluate(async (before) => {
    const beforeSet = new Set(before);
    const images = Array.from(document.images)
      .map((image) => {
        const rect = image.getBoundingClientRect();
        const src = image.currentSrc || image.src;
        const fingerprint = [
          src,
          image.naturalWidth,
          image.naturalHeight,
          image.alt,
          Math.round(rect.width),
          Math.round(rect.height),
        ].join("|");

        return { fingerprint, image, rect, src };
      })
      .filter(({ fingerprint, image, rect, src }) => {
        return (
          src.length > 0 &&
          !beforeSet.has(fingerprint) &&
          rect.width >= 128 &&
          rect.height >= 128 &&
          image.naturalWidth >= 128 &&
          image.naturalHeight >= 128
        );
      });

    const toDataUrl = async (image: HTMLImageElement): Promise<string | undefined> => {
      const src = image.currentSrc || image.src;

      if (src.startsWith("data:image/")) {
        return src;
      }

      try {
        const response = await fetch(src);
        const blob = await response.blob();

        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }

            reject(new Error("FileReader did not produce a data URL."));
          });
          reader.addEventListener("error", () =>
            reject(reader.error ?? new Error("FileReader failed.")),
          );
          reader.readAsDataURL(blob);
        });
      } catch {
        return undefined;
      }
    };

    const extracted = await Promise.all(
      images.map(async ({ fingerprint, image }) => {
        const dataUrl = await toDataUrl(image);
        if (dataUrl === undefined) {
          return undefined;
        }

        const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);/u.exec(dataUrl);
        return {
          dataUrl,
          fingerprint,
          height: image.naturalHeight,
          mimeType: mimeMatch?.[1] ?? "image/png",
          width: image.naturalWidth,
        };
      }),
    );

    return extracted.filter((image): image is ExtractedImage => image !== undefined);
  }, Array.from(beforeFingerprints));
}
