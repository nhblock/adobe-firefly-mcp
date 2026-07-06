import type { Page } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { AppConfig } from "../config.js";
import { selectors } from "./selectors.js";
import { resolveLocator } from "./locatorResolver.js";
import { captureDiagnostics, checkPageHealth } from "./diagnostics.js";
import { waitForGenerationToComplete } from "./generationWait.js";
import { dismissKnownDialogs, detectAuthState } from "./wait.js";

export interface VideoGenerateOptions {
  config: AppConfig;
  page: Page;
  prompt: string;
  negativePrompt?: string;
  duration?: string;
  aspectRatio?: string;
  fps?: number;
  model?: string;
  resolution?: string;
  seed?: number;
  cancelAfterMs?: number;
  downloadTimeoutMs?: number;
  downloadDirectory?: string;
}

export interface VideoResult {
  success: boolean;
  message: string;
  outputPath?: string;
  diagnostics?: Record<string, unknown>;
}

export async function runVideoGenerate(
  browser: { getPage: (url: string) => Promise<Page> },
  config: AppConfig,
  logger: {
    child: (ctx: Record<string, unknown>) => {
      info: (msg: string, ctx?: Record<string, unknown>) => void;
      debug: (msg: string, ctx?: Record<string, unknown>) => void;
    };
  },
  input: {
    prompt: string;
    negativePrompt?: string;
    duration?: string;
    aspectRatio?: string;
    fps?: number;
    model?: string;
    resolution?: string;
    seed?: string;
    cancelAfterMs?: number;
    downloadTimeoutMs?: number;
    outputDir?: string;
  },
): Promise<VideoResult> {
  const page = await browser.getPage(config.urls.video);
  return generateVideo({
    config,
    page,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    fps: input.fps,
    model: input.model,
    resolution: input.resolution,
    seed: input.seed !== undefined ? Number(input.seed) : undefined,
    cancelAfterMs: input.cancelAfterMs,
    downloadTimeoutMs: input.downloadTimeoutMs,
    downloadDirectory: input.outputDir,
  });
}

export async function generateVideo(
  options: VideoGenerateOptions,
): Promise<VideoResult> {
  const {
    config,
    page,
    prompt,
    negativePrompt,
    duration,
    aspectRatio,
    fps,
    model,
    resolution,
    seed,
    cancelAfterMs,
    downloadTimeoutMs = 120000,
    downloadDirectory = path.join(tmpdir(), "firefly-videos"),
  } = options;

  await mkdir(downloadDirectory, { recursive: true });

  const diag = (msg: string) => console.error(`[video] ${msg}`);

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });

    const health = await checkPageHealth(page);
    if (!health.ok) {
      diag(`Page health check failed: ${health.reason}`);
      const diags = await captureDiagnostics(page, "video-health-fail");
      return {
        success: false,
        message: `Page health check failed: ${health.reason}`,
        diagnostics: diags as unknown as Record<string, unknown>,
      };
    }

    await dismissKnownDialogs(page, config);
    await page.waitForTimeout(2000);

    const authState = await detectAuthState(page, config);
    if (authState !== "ready") {
      diag(`Not authenticated: ${authState}`);
      const diags = await captureDiagnostics(page, "video-auth-fail");
      return {
        success: false,
        message: `Not authenticated: ${authState}`,
        diagnostics: diags as unknown as Record<string, unknown>,
      };
    }

    const promptLoc = await resolveLocator(page, selectors.video.prompt, {
      timeout: 10000,
      log: diag,
    });
    await promptLoc.locator.fill(prompt);
    diag("Prompt filled");

    if (negativePrompt) {
      const negLoc = page.locator(
        'textarea[aria-label*="negative" i], input[aria-label*="negative" i]',
      );
      if (
        await negLoc
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await negLoc.first().fill(negativePrompt);
        diag("Negative prompt filled");
      }
    }

    if (model) {
      const modelLoc = await resolveLocator(page, selectors.video.model, {
        timeout: 5000,
        log: diag,
      });
      await modelLoc.locator.click();
      await page.waitForTimeout(500);
      const modelOption = page.getByRole("option", { name: model, exact: false });
      if (await modelOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modelOption.click();
        diag(`Model set to: ${model}`);
      }
    }

    if (resolution) {
      const resLoc = await resolveLocator(page, selectors.video.resolution, {
        timeout: 5000,
        log: diag,
      });
      await resLoc.locator.click();
      await page.waitForTimeout(500);
      const resOption = page.getByRole("option", { name: resolution, exact: false });
      if (await resOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resOption.click();
        diag(`Resolution set to: ${resolution}`);
      }
    }

    if (aspectRatio) {
      const arLoc = await resolveLocator(page, selectors.video.aspectRatio, {
        timeout: 5000,
        log: diag,
      });
      await arLoc.locator.click();
      await page.waitForTimeout(500);
      const arOption = page.getByRole("option", { name: aspectRatio, exact: false });
      if (await arOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await arOption.click();
        diag(`Aspect ratio set to: ${aspectRatio}`);
      }
    }

    if (duration) {
      const durLoc = await resolveLocator(page, selectors.video.duration, {
        timeout: 5000,
        log: diag,
      });
      await durLoc.locator.click();
      await page.waitForTimeout(500);
      const durOption = page.getByRole("option", { name: duration, exact: false });
      if (await durOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await durOption.click();
        diag(`Duration set to: ${duration}`);
      }
    }

    if (fps) {
      const fpsLoc = await resolveLocator(page, selectors.video.fps, {
        timeout: 5000,
        log: diag,
      });
      await fpsLoc.locator.click();
      await page.waitForTimeout(500);
      const fpsOption = page.getByRole("option", { name: `${fps}`, exact: true });
      if (await fpsOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await fpsOption.click();
        diag(`FPS set to: ${fps}`);
      }
    }

    if (seed !== undefined) {
      const seedLoc = await resolveLocator(page, selectors.video.seed, {
        timeout: 5000,
        log: diag,
      });
      await seedLoc.locator.fill(String(seed));
      diag(`Seed set to: ${seed}`);
    }

    await page.waitForTimeout(500);

    if (cancelAfterMs !== undefined) {
      const genLoc = await resolveLocator(page, selectors.video.generate, {
        timeout: 5000,
        log: diag,
      });
      await genLoc.locator.click();
      diag("Generate clicked (cancel mode)");

      await page.waitForTimeout(cancelAfterMs);

      const cancelLoc = await resolveLocator(page, selectors.video.cancel, {
        timeout: 2000,
        log: diag,
      }).catch(() => null);
      if (cancelLoc) {
        await cancelLoc.locator.click();
        diag("Cancel clicked");
      }

      return {
        success: true,
        message: `Generation started then cancelled after ${cancelAfterMs}ms`,
      };
    }

    const genLoc = await resolveLocator(page, selectors.video.generate, {
      timeout: 5000,
      log: diag,
    });
    await genLoc.locator.click();
    diag("Generate clicked, waiting for completion...");

    const result = await waitForGenerationToComplete(page, {
      maxWaitMs: downloadTimeoutMs,
      onProgress: (elapsed, msg) => diag(`Progress: ${elapsed}ms - ${msg}`),
    });

    if (result.status !== "success") {
      diag(`Generation failed: ${result.status} - ${result.message}`);
      const diags = await captureDiagnostics(page, "video-gen-fail");
      return {
        success: false,
        message: `Generation ${result.status}: ${result.message}`,
        diagnostics: {
          generationResult: result,
          pageDiagnostics: diags,
        } as unknown as Record<string, unknown>,
      };
    }

    diag(
      `Generation completed in ${result.diagnostics.elapsedMs}ms, attempting download...`,
    );

    let filePath: string | undefined;
    try {
      const downloadLoc = await resolveLocator(page, selectors.video.download, {
        timeout: 10000,
        log: diag,
      });
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: downloadTimeoutMs }),
        downloadLoc.locator.click(),
      ]);
      filePath = path.join(
        downloadDirectory,
        `${Date.now()}-${download.suggestedFilename()}`,
      );
      await download.saveAs(filePath);
      diag(`Video saved to: ${filePath}`);
    } catch {
      diag(`Download failed, attempting direct save...`);
      try {
        const mediaLoc = page.locator("video[src], source[src], video source");
        const mediaUrl = await mediaLoc.first().getAttribute("src", { timeout: 5000 });
        if (mediaUrl) {
          const response = await page.request.get(mediaUrl);
          filePath = path.join(downloadDirectory, `${Date.now()}-video.mp4`);
          const { writeFile } = await import("node:fs/promises");
          await writeFile(filePath, await response.body());
          diag(`Video saved from direct URL to: ${filePath}`);
        }
      } catch (directErr) {
        diag(`Direct save also failed: ${String(directErr)}`);
      }
    }

    return {
      success: true,
      message: `Video generated in ${result.diagnostics.elapsedMs}ms, saved to ${filePath}`,
      outputPath: filePath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diag(`Fatal error: ${msg}`);
    const diags = await captureDiagnostics(page, "video-fatal");
    return {
      success: false,
      message: msg,
      diagnostics: diags as unknown as Record<string, unknown>,
    };
  }
}
