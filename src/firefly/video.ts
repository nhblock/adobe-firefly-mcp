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
  /** Limits Generate clicks for controlled one-shot runs. */
  maxGenerateAttempts?: number;
  /** Disables the model fallback for controlled one-shot runs. */
  allowModelFallback?: boolean;
}

export interface VideoResult {
  success: boolean;
  message: string;
  outputPath?: string;
  diagnostics?: Record<string, unknown>;
}

// The real Firefly video request. Observing this response (instead of guessing
// from the DOM) is what lets us tell a transient backend "system under load"
// (HTTP 408) apart from auth failures, moderation, or genuine job acceptance.
// Third-party models (Veo, Kling) POST to `/3p-videos/generate-async` (note the
// hyphen: `3p-videos`, not `/videos/`); the first-party "Firefly Video" model
// POSTs to `/videos/generate` on a different host. Both are observed so
// acceptance and account-level errors are reported precisely instead of
// decaying into an opaque DOM timeout.
const VIDEO_API_PATTERN = /\/(3p-)?videos\/generate(-async)?\b/;

// When the chosen (third-party) model keeps timing out on its endpoint, the
// account's 3p video capacity is unavailable. The first-party "Firefly Video"
// model uses a different endpoint that Adobe accepts; trying it once lets a
// credit-entitled account still get a video, and lets a credit-less account get
// a clear, actionable error instead of a generic timeout.
const FALLBACK_MODEL = "Firefly Video";

export interface VideoApiOutcome {
  status: number;
  errorCode?: string;
  apiMessage?: string;
  bodyPreview?: string;
}

export interface VideoApiVerdict {
  kind: "accepted" | "transient" | "auth" | "moderation" | "error";
  message: string;
}

/**
 * Arms a response listener for the video generate-async endpoint, then triggers
 * the generate click. Returns the parsed API outcome, or undefined if no such
 * response was observed within the timeout (e.g. the click never fired a
 * request, in which case the caller falls back to DOM-based waiting).
 */
async function clickGenerateAndCaptureVideoApi(
  page: Page,
  clickGenerate: () => Promise<void>,
  timeoutMs: number,
  diag: (msg: string) => void,
): Promise<VideoApiOutcome | undefined> {
  const responsePromise = page
    .waitForResponse((res) => VIDEO_API_PATTERN.test(res.url()), {
      timeout: timeoutMs,
    })
    .catch(() => undefined);

  await clickGenerate();

  const response = await responsePromise;
  if (response === undefined) {
    return undefined;
  }

  const status = response.status();
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }

  let errorCode: string | undefined;
  let apiMessage: string | undefined;
  if (body.length > 0) {
    try {
      const parsed = JSON.parse(body) as { error_code?: string; message?: string };
      errorCode = parsed.error_code;
      apiMessage = parsed.message;
    } catch {
      // Non-JSON body (e.g. an HTML sign-in page); keep only the preview.
    }
  }

  diag(
    `Video API: HTTP ${status}` +
      (errorCode ? ` ${errorCode}` : "") +
      (apiMessage ? ` — ${apiMessage}` : ""),
  );

  return { status, errorCode, apiMessage, bodyPreview: body.slice(0, 500) };
}

/** Maps a raw video API outcome to an actionable verdict. */
export function classifyVideoApi(outcome: VideoApiOutcome): VideoApiVerdict {
  const { status, errorCode, apiMessage } = outcome;
  const text = `${errorCode ?? ""} ${apiMessage ?? ""}`;

  if (status >= 200 && status < 300) {
    return { kind: "accepted", message: "Adobe backend accepted the video job." };
  }

  if (
    status === 408 ||
    status === 503 ||
    errorCode === "timeout_error" ||
    /system under load/i.test(text)
  ) {
    return {
      kind: "transient",
      message:
        `Adobe's video backend is temporarily overloaded ` +
        `(HTTP ${status}${errorCode ? ` ${errorCode}` : ""}: ${apiMessage ?? "system under load"}). ` +
        `This is a transient server-side capacity limit — not an authentication, ` +
        `fingerprint, or automation problem. The request was accepted and reached ` +
        `Adobe's origin; retrying later should succeed.`,
    };
  }

  if (status === 429) {
    return {
      kind: "transient",
      message: `Adobe rate-limited the video request (HTTP 429). Retry later.`,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message:
        `Adobe rejected the video request (HTTP ${status}). The Firefly session ` +
        `likely needs re-authentication in the browser profile.`,
    };
  }

  if (/moderat|violat|not allowed|inappropriate/i.test(text)) {
    return {
      kind: "moderation",
      message: `Video request blocked by content moderation: ${
        apiMessage ?? errorCode ?? "policy violation"
      }.`,
    };
  }

  return {
    kind: "error",
    message:
      `Adobe video API returned an error (HTTP ${status}` +
      (errorCode ? ` ${errorCode}` : "") +
      (apiMessage ? `: ${apiMessage}` : "") +
      `).`,
  };
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
    maxGenerateAttempts = 3,
    allowModelFallback = true,
  } = options;

  await mkdir(downloadDirectory, { recursive: true });

  const diag = (msg: string) => console.error(`[video] ${msg}`);

  // [DIAG] TEMPORARY runtime instrumentation — returned in the MCP response
  // payload only. No stderr, no files, no behavior change. Remove after use.
  const t0 = Date.now();
  const rtEvents: string[] = [];
  const stamp = (name: string, url?: string) =>
    rtEvents.push(
      `+${((Date.now() - t0) / 1000).toFixed(3)}s ${name}${url ? ` url=${url}` : ""}`,
    );
  const currentGuid = (): string | undefined => {
    try {
      return (page as unknown as { _guid?: string })._guid;
    } catch {
      return undefined;
    }
  };
  const entryGuid = currentGuid();
  page.on("framenavigated", (fr) => {
    if (fr === page.mainFrame()) stamp("framenavigated", fr.url());
  });
  page.on("close", () => stamp("close"));
  page.on("crash", () => stamp("crash", page.url()));
  page.on("popup", (pg) => stamp("popup", pg.url()));
  const buildRuntimeDiag = async (): Promise<Record<string, unknown>> => {
    const ctx = page.context();
    const pgs = ctx.pages();
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < pgs.length; i++) {
      const pg = pgs[i];
      if (pg === undefined) continue;
      let title = "";
      try {
        title = await pg.title();
      } catch {
        title = "(unavailable)";
      }
      rows.push({
        index: i,
        url: pg.url(),
        title,
        isClosed: pg.isClosed(),
        guid: (pg as unknown as { _guid?: string })._guid,
        isCurrentPage: pg === page,
      });
    }
    let pageTitle = "";
    try {
      pageTitle = await page.title();
    } catch {
      pageTitle = "(unavailable)";
    }
    return {
      pageUrl: page.url(),
      pageTitle,
      pageCount: pgs.length,
      currentPageGuid: currentGuid(),
      entryPageGuid: entryGuid,
      currentPageStillInContext: pgs.includes(page),
      pages: rows,
      events: [...rtEvents],
    };
  };

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });

    const health = await checkPageHealth(page);
    if (!health.ok) {
      diag(`Page health check failed: ${health.reason}`);
      const diags = await captureDiagnostics(page, "video-health-fail");
      const _runtime = await buildRuntimeDiag();
      return {
        success: false,
        message: `Page health check failed: ${health.reason}`,
        diagnostics: { pageDiagnostics: diags, _runtime } as unknown as Record<
          string,
          unknown
        >,
      };
    }

    await dismissKnownDialogs(page, config);
    await page.waitForTimeout(2000);

    const authState = await detectAuthState(page, config);
    if (authState !== "ready") {
      diag(`Not authenticated: ${authState}`);
      const diags = await captureDiagnostics(page, "video-auth-fail");
      const _runtime = await buildRuntimeDiag();
      return {
        success: false,
        message: `Not authenticated: ${authState}`,
        diagnostics: { pageDiagnostics: diags, _runtime } as unknown as Record<
          string,
          unknown
        >,
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

      const _runtime = await buildRuntimeDiag();
      return {
        success: true,
        message: `Generation started then cancelled after ${cancelAfterMs}ms`,
        diagnostics: { _runtime } as unknown as Record<string, unknown>,
      };
    }

    // Fire the Generate click while observing the real video API response, so a
    // transient "system under load" (HTTP 408) is diagnosed precisely and
    // retried, instead of decaying into an opaque DOM timeout after 2 minutes.
    const maxAttempts = Math.max(1, maxGenerateAttempts);
    const retryDelayMs = 15000;
    let apiOutcome: VideoApiOutcome | undefined;
    let verdict: VideoApiVerdict | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const genLoc = await resolveLocator(page, selectors.video.generate, {
        timeout: 5000,
        log: diag,
      });

      apiOutcome = await clickGenerateAndCaptureVideoApi(
        page,
        async () => {
          await genLoc.locator.click();
          diag(
            attempt === 1
              ? "Generate clicked, observing video API..."
              : `Generate clicked (retry ${attempt}/${maxAttempts}), observing video API...`,
          );
        },
        20000,
        diag,
      );

      if (apiOutcome === undefined) {
        // No API response observed (the UI may submit differently than the
        // captured flow). Fall back to the existing DOM-based wait.
        diag("No video API response observed; falling back to DOM wait.");
        break;
      }

      verdict = classifyVideoApi(apiOutcome);

      if (verdict.kind !== "transient") {
        break;
      }

      diag(verdict.message);
      if (attempt < maxAttempts) {
        diag(`Waiting ${retryDelayMs}ms before retrying...`);
        await page.waitForTimeout(retryDelayMs);
      }
    }

    // If the third-party model kept timing out, its endpoint is unavailable for
    // this account. The first-party "Firefly Video" model uses a different
    // endpoint Adobe accepts — try it once before giving up.
    if (
      allowModelFallback &&
      verdict?.kind === "transient" &&
      (model ?? "").toLowerCase() !== FALLBACK_MODEL.toLowerCase()
    ) {
      diag(`3p model timed out; attempting first-party "${FALLBACK_MODEL}"...`);
      try {
        const modelLoc = await resolveLocator(page, selectors.video.model, {
          timeout: 5000,
          log: diag,
        });
        await modelLoc.locator.click();
        await page.waitForTimeout(500);
        const fbOpt = page
          .locator('[role="option"]', { hasText: FALLBACK_MODEL })
          .first();
        if (await fbOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fbOpt.click();
          diag(`Model set to: ${FALLBACK_MODEL}`);
          await page.waitForTimeout(500);

          apiOutcome = await clickGenerateAndCaptureVideoApi(
            page,
            async () => {
              const genLoc = await resolveLocator(page, selectors.video.generate, {
                timeout: 5000,
                log: diag,
              });
              await genLoc.locator.click();
              diag(
                `Generate clicked (${FALLBACK_MODEL} fallback), observing video API...`,
              );
            },
            20000,
            diag,
          );

          if (apiOutcome !== undefined) {
            verdict = classifyVideoApi(apiOutcome);
          } else {
            diag(
              "No video API response observed for fallback; falling back to DOM wait.",
            );
          }
        }
      } catch (fbErr) {
        diag(
          `Fallback to ${FALLBACK_MODEL} failed: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`,
        );
      }
    }

    // Act on a decisive (non-accepted) API verdict before waiting on the DOM.
    if (verdict !== undefined && verdict.kind !== "accepted") {
      diag(`Video generation not accepted: ${verdict.message}`);
      const diags = await captureDiagnostics(page, `video-${verdict.kind}`);
      const _runtime = await buildRuntimeDiag();
      return {
        success: false,
        message: verdict.message,
        diagnostics: {
          videoApi: apiOutcome,
          pageDiagnostics: diags,
          _runtime,
        } as unknown as Record<string, unknown>,
      };
    }

    if (verdict?.kind === "accepted") {
      diag("Video job accepted by Adobe backend, waiting for completion...");
    }

    const result = await waitForGenerationToComplete(page, {
      maxWaitMs: downloadTimeoutMs,
      onProgress: (elapsed, msg) => diag(`Progress: ${elapsed}ms - ${msg}`),
    });

    if (result.status !== "success") {
      diag(`Generation failed: ${result.status} - ${result.message}`);
      const diags = await captureDiagnostics(page, "video-gen-fail");
      const _runtime = await buildRuntimeDiag();
      return {
        success: false,
        message: `Generation ${result.status}: ${result.message}`,
        diagnostics: {
          generationResult: result,
          pageDiagnostics: diags,
          _runtime,
        } as unknown as Record<string, unknown>,
      };
    }

    diag(
      `Generation completed in ${result.diagnostics.elapsedMs}ms, attempting download...`,
    );

    let filePath: string | undefined;
    // Firefly serves the result via a blob: URL, and the media-timeline
    // download button is rendered disabled for ~5s after generation completes.
    // Both the button and the <video> live inside shadow DOM. Cap the
    // download-event wait so we fall through to the blob-fetch fallback quickly.
    const downloadEventTimeout = Math.min(downloadTimeoutMs, 10000);
    try {
      const resolveStart = Date.now();
      const downloadLoc = await resolveLocator(page, selectors.video.download, {
        timeout: 15000,
        log: diag,
      });
      diag(`Download button found in ${Date.now() - resolveStart}ms`);

      // The button starts life disabled (disabled="" / aria-disabled="true"
      // / tabindex="-1") for ~5s. Clicking while disabled is a no-op that fires
      // no download event, so wait until BOTH markers clear before clicking.
      const enableStart = Date.now();
      let enabled = false;
      while (Date.now() - enableStart < 15000) {
        const [ariaDisabled, disabledAttr] = await Promise.all([
          downloadLoc.locator.getAttribute("aria-disabled").catch(() => null),
          downloadLoc.locator.getAttribute("disabled").catch(() => null),
        ]);
        if (ariaDisabled !== "true" && disabledAttr === null) {
          enabled = true;
          break;
        }
        await page.waitForTimeout(250);
      }
      if (!enabled) {
        throw new Error(
          "download button did not become enabled within 15000ms",
        );
      }
      diag(`Download button enabled after ${Date.now() - enableStart}ms`);

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: downloadEventTimeout }),
        downloadLoc.locator.click(),
      ]);
      filePath = path.join(
        downloadDirectory,
        `${Date.now()}-${download.suggestedFilename()}`,
      );
      await download.saveAs(filePath);
      diag(`Video saved to: ${filePath}`);
    } catch {
      diag(`Download event not captured, attempting blob media save...`);
      try {
        // The <video> lives inside shadow DOM, so a light-DOM
        // document.querySelector is blind to it. Use Playwright's
        // shadow-piercing locator to read the blob: src, then fetch the bytes
        // inside the page context (blob URLs are same-origin to the page).
        const video = page.locator('[data-testid="core-video"]').first();
        const src = await video.getAttribute("src").catch(() => null);
        if (src && src.startsWith("blob:")) {
          const bytes = await page.evaluate(async (blobUrl) => {
            const res = await fetch(blobUrl);
            const buffer = await res.arrayBuffer();
            return Array.from(new Uint8Array(buffer));
          }, src);
          if (bytes && bytes.length > 0) {
            filePath = path.join(downloadDirectory, `${Date.now()}-video.mp4`);
            const { writeFile } = await import("node:fs/promises");
            await writeFile(filePath, Buffer.from(bytes));
            diag(`Video saved from blob src to: ${filePath}`);
          } else {
            diag("Blob fetch returned no bytes for direct save.");
          }
        } else {
          diag("No blob: media source found for direct save.");
        }
      } catch (directErr) {
        diag(`Direct save also failed: ${String(directErr)}`);
      }
    }

    if (!filePath) {
      const _runtime = await buildRuntimeDiag();
      return {
        success: false,
        message:
          "Video generation completed but the file could not be downloaded " +
          "(no download event fired and no playable media source was available).",
        diagnostics: { _runtime } as unknown as Record<string, unknown>,
      };
    }

    const _runtime = await buildRuntimeDiag();
    return {
      success: true,
      message: `Video generated in ${result.diagnostics.elapsedMs}ms, saved to ${filePath}`,
      outputPath: filePath,
      diagnostics: { _runtime } as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diag(`Fatal error: ${msg}`);
    const diags = await captureDiagnostics(page, "video-fatal");
    const _runtime = await buildRuntimeDiag().catch(() => undefined);
    return {
      success: false,
      message: msg,
      diagnostics: { pageDiagnostics: diags, _runtime } as unknown as Record<
        string,
        unknown
      >,
    };
  }
}
