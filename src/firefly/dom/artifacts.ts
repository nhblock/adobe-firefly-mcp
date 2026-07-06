import fs from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

import type { AppConfig } from "../../config.js";
import { ensureDirectory, timestampedBasename } from "../../utils/filesystem.js";

export interface ArtifactPaths {
  annotatedScreenshotPath?: string;
  elementScreenshotPaths?: string[];
  elementHtmlPath?: string;
  htmlPath?: string;
  screenshotPath?: string;
  zipPath?: string;
}

export async function saveScreenshot(
  page: Page,
  config: AppConfig,
  label: string,
): Promise<string> {
  await ensureDirectory(config.downloadsDir);
  const screenshotPath = path.join(
    config.downloadsDir,
    `${timestampedBasename(label)}.png`,
  );
  await page.screenshot({ fullPage: true, path: screenshotPath });
  return screenshotPath;
}

export async function saveElementScreenshot(
  page: Page,
  config: AppConfig,
  selector: string,
  filename: string,
): Promise<string | undefined> {
  try {
    const element = page.locator(selector).first();
    const visible = await element.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) {
      return undefined;
    }

    const dir = path.join(config.downloadsDir, "elements");
    await ensureDirectory(dir);
    const screenshotPath = path.join(dir, `${filename}.png`);
    await element.screenshot({ path: screenshotPath });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

export async function saveAnnotatedScreenshot(
  page: Page,
  config: AppConfig,
  elements: Array<{
    label: string;
    x: number;
    y: number;
  }>,
): Promise<string> {
  await ensureDirectory(config.downloadsDir);
  const screenshotPath = path.join(
    config.downloadsDir,
    `${timestampedBasename("dom-inspect-annotated")}.png`,
  );

  await page.evaluate((els) => {
    for (const el of els) {
      const marker = document.createElement("div");
      marker.textContent = el.label;
      marker.style.cssText = `
        position: fixed;
        left: ${el.x}px;
        top: ${el.y}px;
        background: red;
        color: white;
        font-size: 12px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 50%;
        z-index: 999999;
        pointer-events: none;
      `;
      document.body.appendChild(marker);
    }
  }, elements);

  await page.screenshot({ fullPage: true, path: screenshotPath });

  await page.evaluate(() => {
    const markers = document.querySelectorAll("div[style*='z-index: 999999']");
    markers.forEach((m) => m.remove());
  });

  return screenshotPath;
}

export async function saveHtml(page: Page, config: AppConfig): Promise<string> {
  await ensureDirectory(config.downloadsDir);
  const htmlPath = path.join(config.downloadsDir, `${timestampedBasename("dom")}.html`);

  const html = await page.content();
  await fs.writeFile(htmlPath, html, "utf8");
  return htmlPath;
}

export async function saveElementHtml(
  page: Page,
  config: AppConfig,
  selector: string,
): Promise<string | undefined> {
  try {
    const html = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      return el?.outerHTML ?? "";
    }, selector);

    if (html.length === 0) {
      return undefined;
    }

    await ensureDirectory(config.downloadsDir);
    const htmlPath = path.join(
      config.downloadsDir,
      `${timestampedBasename("element")}.html`,
    );
    await fs.writeFile(htmlPath, html, "utf8");
    return htmlPath;
  } catch {
    return undefined;
  }
}
