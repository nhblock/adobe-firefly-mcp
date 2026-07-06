import type { Locator, Page } from "playwright";

import { selectors, locatorFor, type SelectorCandidate } from "./selectors.js";

interface ResolveResult {
  candidate: SelectorCandidate;
  locator: Locator;
}

export async function resolveLocator(
  root: Page | Locator,
  candidates: SelectorCandidate[],
  options: { timeout?: number; log?: (msg: string) => void } = {},
): Promise<ResolveResult> {
  const { timeout = 12000, log = console.error } = options;
  const deadline = Date.now() + timeout;

  for (const candidate of candidates) {
    const start = Date.now();
    try {
      const loc = locatorFor(root, candidate);
      await loc
        .first()
        .waitFor({ state: "visible", timeout: Math.max(deadline - Date.now(), 100) });
      await loc
        .first()
        .scrollIntoViewIfNeeded({ timeout: Math.max(deadline - Date.now(), 100) });
      const enabled = await loc
        .first()
        .isEnabled()
        .catch(() => false);
      log(
        `[locator-resolve] success: ${candidate.name} in ${Date.now() - start}ms (enabled=${enabled})`,
      );
      return { candidate, locator: loc.first() };
    } catch {
      log(`[locator-resolve] failed: ${candidate.name} in ${Date.now() - start}ms`);
    }
  }

  throw new Error(
    `[locator-resolve] All candidates failed after ${Date.now() - (deadline - timeout)}ms`,
  );
}

export async function clickResolved(
  root: Page | Locator,
  candidates: SelectorCandidate[],
  options: { timeout?: number; log?: (msg: string) => void } = {},
): Promise<void> {
  const { locator } = await resolveLocator(root, candidates, options);
  await locator.click();
}

export async function fillResolved(
  root: Page | Locator,
  candidates: SelectorCandidate[],
  value: string,
  options: { timeout?: number; log?: (msg: string) => void } = {},
): Promise<void> {
  const { locator } = await resolveLocator(root, candidates, options);
  await locator.fill(value);
}

export async function selectResolved(
  root: Page | Locator,
  candidates: SelectorCandidate[],
  value: string,
  options: { timeout?: number; log?: (msg: string) => void } = {},
): Promise<void> {
  const { locator } = await resolveLocator(root, candidates, options);
  await locator.selectOption(value);
}

export function videoLocators() {
  return selectors.video;
}

export function imageLocators() {
  return selectors.image;
}

export function sharedLocators() {
  return selectors.shared;
}
