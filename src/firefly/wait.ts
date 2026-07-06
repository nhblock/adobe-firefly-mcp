import type { Locator, Page } from "playwright";

import type { AppConfig } from "../config.js";
import { sleep } from "../utils/retry.js";
import { locatorFor, selectorGroups, type SelectorCandidate } from "./selectors.js";

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

export async function collectVisibleImageFingerprints(
  page: Page,
): Promise<Set<string>> {
  const fingerprints = await page.evaluate(() =>
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

        return [
          src,
          image.naturalWidth,
          image.naturalHeight,
          image.alt,
          Math.round(rect.width),
          Math.round(rect.height),
        ].join("|");
      })
      .filter((value): value is string => value !== undefined),
  );

  return new Set(fingerprints);
}

export async function waitForNewImages(
  page: Page,
  before: Set<string>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const after = await collectVisibleImageFingerprints(page);
    const hasNewImage = Array.from(after).some(
      (fingerprint) => !before.has(fingerprint),
    );

    if (hasNewImage) {
      return;
    }

    await sleep(1_000);
  }

  throw new FireflyAutomationError(
    "Timed out waiting for Firefly to render generated images.",
  );
}
