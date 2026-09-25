import type { Locator, Page, Request } from "playwright";

import type { AppConfig } from "../config.js";
import { sleep } from "../utils/retry.js";
import {
  locatorFor,
  selectorGroups,
  selectors,
  type SelectorCandidate,
} from "./selectors.js";

export class FireflyAutomationError extends Error {
  public override name = "FireflyAutomationError";
}

export class FireflyAuthRequiredError extends FireflyAutomationError {
  public override name = "FireflyAuthRequiredError";
}

export interface LocatedCandidate {
  candidate: SelectorCandidate;
  locator: Locator;
}

export type AuthState = "ready" | "sign_in_required" | "unknown";

export async function waitForFirstVisible(
  page: Page,
  candidates: SelectorCandidate[],
  timeoutMs: number,
): Promise<LocatedCandidate | undefined> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const candidate of candidates) {
      const locator = locatorFor(page, candidate).first();
      const isVisible = await locator.isVisible({ timeout: 150 }).catch(() => false);

      if (isVisible) {
        return { candidate, locator };
      }
    }

    await sleep(250);
  }

  return undefined;
}

export async function clickFirstVisible(
  page: Page,
  candidates: SelectorCandidate[],
  timeoutMs: number,
): Promise<LocatedCandidate | undefined> {
  const located = await waitForFirstVisible(page, candidates, timeoutMs);
  if (located === undefined) {
    return undefined;
  }

  await located.locator.click({ timeout: timeoutMs });
  return located;
}

export async function fillFirstVisible(
  page: Page,
  candidates: SelectorCandidate[],
  value: string,
  timeoutMs: number,
): Promise<LocatedCandidate | undefined> {
  const located = await waitForFirstVisible(page, candidates, timeoutMs);
  if (located === undefined) {
    return undefined;
  }

  await fillLocator(page, located.locator, value);
  return located;
}

export async function fillLocator(
  page: Page,
  locator: Locator,
  value: string,
): Promise<void> {
  try {
    await locator.fill(value, { timeout: 5_000 });
  } catch {
    await locator.click({ timeout: 5_000 });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(value);
  }
}

export async function dismissKnownDialogs(
  page: Page,
  config: AppConfig,
): Promise<void> {
  const groups = selectorGroups(config);

  for (let index = 0; index < 3; index += 1) {
    const clicked = await clickFirstVisible(page, groups.dismissButtons, 750).catch(
      () => undefined,
    );

    if (clicked === undefined) {
      return;
    }

    await page.waitForTimeout(300);
  }
}

export async function detectAuthState(
  page: Page,
  config: AppConfig,
): Promise<AuthState> {
  const groups = selectorGroups(config);
  const prompt = await waitForFirstVisible(page, groups.promptInputs, 3000);

  if (prompt !== undefined) {
    return "ready";
  }

  const authMarker = await waitForFirstVisible(page, groups.authMarkers, 1500);
  if (authMarker !== undefined || /adobeid|sign[_-]?in|login|auth/u.test(page.url())) {
    return "sign_in_required";
  }

  return "unknown";
}

export async function ensurePromptReady(page: Page, config: AppConfig): Promise<void> {
  const state = await detectAuthState(page, config);

  if (state === "sign_in_required") {
    throw new FireflyAuthRequiredError(
      [
        "Adobe sign-in is required in the opened browser window.",
        "Sign in manually with your Adobe account, then run the tool again.",
        "This MCP server never asks for, stores, or automates credentials.",
      ].join(" "),
    );
  }

  if (state !== "ready") {
    throw new FireflyAutomationError(
      [
        "Could not find Firefly's prompt input.",
        "The browser may still be loading, or Adobe may have changed the UI.",
        "Try firefly_status first, or set FIREFLY_SELECTOR_PROMPT_INPUT.",
      ].join(" "),
    );
  }
}

// Identify a generated image by what it shows, never by where or how large it
// is rendered: layout shifts (a taller prompt box, a closed popup) resize the
// previous results, and a size-based fingerprint made them look "new".
export async function collectVisibleImageFingerprints(
  page: Page,
): Promise<Set<string>> {
  const fingerprints = await evaluateAcrossNavigation(page, () =>
    Array.from(document.images)
      .map((image) => {
        const rect = image.getBoundingClientRect();
        const src = image.currentSrc || image.src;

        if (
          src.length === 0 ||
          rect.width < 128 ||
          rect.height < 128 ||
          image.naturalWidth < 128 ||
          image.naturalHeight < 128
        ) {
          return undefined;
        }

        return [src, image.naturalWidth, image.naturalHeight].join("|");
      })
      .filter((value): value is string => value !== undefined),
  );

  return new Set(fingerprints);
}

// Firefly rewrites the URL (e.g. `?id=...`) around generation, which can tear
// down the execution context mid-evaluate. Retry after the page settles
// instead of failing the whole run.
async function evaluateAcrossNavigation<T>(page: Page, fn: () => T): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await page.evaluate(fn);
    } catch (error) {
      const destroyed =
        error instanceof Error &&
        /execution context was destroyed/iu.test(error.message);
      if (!destroyed || attempt >= 5) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await sleep(500);
    }
  }
}

function countNew(after: Set<string>, before: Set<string>): number {
  return Array.from(after).filter((fingerprint) => !before.has(fingerprint)).length;
}

export interface GenerationStartWatch {
  dispose(): void;
  /** Resolves true once Firefly has visibly or observably started generating. */
  wait(timeoutMs: number): Promise<boolean>;
}

/**
 * Arm before clicking Generate. A click Playwright reports as successful can
 * still be swallowed by the UI (the prompt-suggestion popup closes on the first
 * outside click without passing it on), so success is judged by Firefly's
 * reaction: a POST to a `.../generate...` endpoint, or new result images.
 */
export function watchGenerationStart(
  page: Page,
  before: Set<string>,
): GenerationStartWatch {
  let requested = false;
  const onRequest = (request: Request): void => {
    if (request.method() !== "POST") {
      return;
    }
    try {
      if (/generate/iu.test(new URL(request.url()).pathname)) {
        requested = true;
      }
    } catch {
      // Unparseable URL: not a generate request.
    }
  };
  page.on("request", onRequest);

  return {
    dispose: () => {
      page.off("request", onRequest);
    },
    wait: async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        if (requested) {
          return true;
        }
        const after = await collectVisibleImageFingerprints(page).catch(
          () => new Set<string>(),
        );
        if (countNew(after, before) > 0) {
          return true;
        }
        await sleep(250);
      }
      return requested;
    },
  };
}

/**
 * Waits for the new results to render. Returns once `expected` new images are
 * visible, or once some are visible and the count has stopped growing, so a
 * partially rendered batch is not downloaded mid-stream.
 */
export async function waitForNewImages(
  page: Page,
  before: Set<string>,
  timeoutMs: number,
  expected = 1,
  settleMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  let lastChangeAt = Date.now();

  while (Date.now() <= deadline) {
    const count = countNew(await collectVisibleImageFingerprints(page), before);

    if (count >= expected) {
      return;
    }
    if (count !== lastCount) {
      lastCount = count;
      lastChangeAt = Date.now();
    } else if (count > 0 && Date.now() - lastChangeAt >= settleMs) {
      return;
    }

    await sleep(500);
  }

  if (lastCount > 0) {
    return;
  }

  throw new FireflyAutomationError(
    "Timed out waiting for Firefly to render generated images.",
  );
}

/**
 * Closes anything that sits between the prompt and the Generate button: the
 * prompt-suggestion popup (which eats the next click) and first-run
 * coachmarks/cookie banners.
 */
export async function closePromptOverlays(
  page: Page,
  config: AppConfig,
): Promise<void> {
  const popup = await waitForFirstVisible(page, selectors.shared.popovers, 300);
  if (popup !== undefined) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
  }

  await dismissKnownDialogs(page, config);
}
