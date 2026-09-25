import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { Download, Locator, Page } from "playwright";

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

const NEW_IMAGE_ATTRIBUTE = "data-firefly-mcp-new-image";

/**
 * Saves each newly generated image once. Every new result image is handled on
 * its own: hover it so Firefly reveals that tile's download button, click only
 * a download control that lies inside the tile, and otherwise fall back to the
 * image's own source. Several generic download selectors match the same
 * hover-revealed button (and "Download all" sits outside every tile), so
 * iterating selectors page-wide saved one image repeatedly; identical files
 * are also dropped by content hash as a last line of defense.
 */
export async function downloadGeneratedImages(
  page: Page,
  config: AppConfig,
  logger: Logger,
  options: DownloadGeneratedImagesOptions,
): Promise<DownloadedImage[]> {
  await ensureDirectory(options.outputDir);

  const newImageCount = await markNewImages(page, options.beforeFingerprints);
  const files: DownloadedImage[] = [];
  const seenHashes = new Set<string>();

  for (
    let index = 0;
    index < newImageCount && files.length < options.maxFiles;
    index += 1
  ) {
    const image = page.locator(`[${NEW_IMAGE_ATTRIBUTE}="${index}"]`);
    const fileIndex = files.length + 1;
    const file =
      (await downloadViaTileButton(page, config, logger, image, options, fileIndex)) ??
      (await saveImageSource(image, logger, options, fileIndex));

    if (file === undefined) {
      continue;
    }

    const hash = createHash("sha256")
      .update(await fs.readFile(file.path))
      .digest("hex");
    if (seenHashes.has(hash)) {
      await fs.rm(file.path, { force: true });
      logger.warn("Dropped duplicate generated image", { path: file.path });
      continue;
    }

    seenHashes.add(hash);
    files.push(file);
  }

  return files;
}

async function markNewImages(
  page: Page,
  beforeFingerprints: Set<string>,
): Promise<number> {
  return page.evaluate(
    ({ attribute, before }) => {
      const beforeSet = new Set(before);
      const seen = new Set<string>();
      let count = 0;

      for (const image of Array.from(document.images)) {
        image.removeAttribute(attribute);
        const rect = image.getBoundingClientRect();
        const src = image.currentSrc || image.src;
        const fingerprint = [src, image.naturalWidth, image.naturalHeight].join("|");

        if (
          src.length === 0 ||
          beforeSet.has(fingerprint) ||
          seen.has(fingerprint) ||
          rect.width < 128 ||
          rect.height < 128 ||
          image.naturalWidth < 128 ||
          image.naturalHeight < 128
        ) {
          continue;
        }

        seen.add(fingerprint);
        image.setAttribute(attribute, String(count));
        count += 1;
      }

      return count;
    },
    { attribute: NEW_IMAGE_ATTRIBUTE, before: Array.from(beforeFingerprints) },
  );
}

async function downloadViaTileButton(
  page: Page,
  config: AppConfig,
  logger: Logger,
  image: Locator,
  options: DownloadGeneratedImagesOptions,
  fileIndex: number,
): Promise<DownloadedImage | undefined> {
  await image.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  const hovered = await image.hover({ timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  const tile = await image.boundingBox().catch(() => null);
  if (!hovered || tile === null) {
    return undefined;
  }

  for (const candidate of selectorGroups(config).downloadButtons) {
    const locator = locatorFor(page, candidate);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const button = locator.nth(index);
      const box = await button.boundingBox().catch(() => null);
      if (box === null || !isInside(box, tile)) {
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
        fileIndex,
      );
      logger.info("Saved generated image from download event", {
        path: file.path,
        selector: candidate.name,
      });
      return file;
    }
  }

  return undefined;
}

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

function isInside(inner: Box, outer: Box, tolerance = 2): boolean {
  return (
    inner.width > 0 &&
    inner.height > 0 &&
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
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

async function saveImageSource(
  image: Locator,
  logger: Logger,
  options: DownloadGeneratedImagesOptions,
  fileIndex: number,
): Promise<DownloadedImage | undefined> {
  const extracted = await image
    .evaluate(async (element: HTMLImageElement) => {
      const src = element.currentSrc || element.src;
      let dataUrl: string | undefined = src.startsWith("data:image/") ? src : undefined;

      if (dataUrl === undefined) {
        try {
          const blob = await (await fetch(src)).blob();
          dataUrl = await new Promise<string>((resolve, reject) => {
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
      }

      return {
        dataUrl,
        height: element.naturalHeight,
        width: element.naturalWidth,
      };
    })
    .catch(() => undefined);

  if (extracted === undefined) {
    return undefined;
  }

  const parsed = parseDataUrlImage(extracted.dataUrl);
  const target = await uniqueFilePath(
    options.outputDir,
    `${sanitizeFilenamePart(options.basename)}-${fileIndex}`,
    extensionForMimeType(parsed.mimeType) || parsed.extension,
  );

  await fs.writeFile(target, parsed.buffer);
  logger.info("Saved generated image from visible image source", { path: target });

  return {
    height: extracted.height,
    mimeType: parsed.mimeType,
    path: target,
    source: "image-src",
    width: extracted.width,
  };
}
