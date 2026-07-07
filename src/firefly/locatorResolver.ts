import type { Locator, Page } from "playwright";

import { selectors, locatorFor, type SelectorCandidate } from "./selectors.js";
import { SelfHealingEngine, type HealingConfig } from "./selfHealing.js";
import type { AppConfig } from "../config.js";

interface ResolveResult {
  candidate: SelectorCandidate;
  locator: Locator;
  healed?: boolean;
  confidence?: number;
}

export async function resolveLocator(
  root: Page | Locator,
  candidates: SelectorCandidate[],
  options: {
    timeout?: number;
    log?: (msg: string) => void;
    config?: AppConfig;
    healingConfig?: Partial<HealingConfig>;
  } = {},
): Promise<ResolveResult> {
  const { timeout = 12000, log = console.error, config, healingConfig } = options;
  const deadline = Date.now() + timeout;

  // Step 1: Try primary selector (first candidate)
  const primaryCandidate = candidates[0];
  if (primaryCandidate) {
    try {
      const loc = locatorFor(root, primaryCandidate);
      await loc.first().waitFor({ state: "visible", timeout: Math.min(timeout, 3000) });
      await loc.first().scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 1000) });
      const enabled = await loc
        .first()
        .isEnabled()
        .catch(() => false);
      log(
        `[locator-resolve] primary selector succeeded: ${primaryCandidate.name} in ${Date.now() - (deadline - timeout)}ms (enabled=${enabled})`,
      );
      return { candidate: primaryCandidate, locator: loc.first() };
    } catch {
      log(`[locator-resolve] primary selector failed: ${primaryCandidate.name}`);
    }
  }

  // Step 2: Try remaining candidates
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    try {
      const loc = locatorFor(root, candidate);
      await loc.first().waitFor({ state: "visible", timeout: Math.min(timeout, 2000) });
      await loc.first().scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 1000) });
      log(`[locator-resolve] fallback candidate succeeded: ${candidate.name}`);
      return { candidate, locator: loc.first() };
    } catch {
      // Continue to next candidate
    }
  }

  // Step 3: Use self-healing engine if Page is available
  if ("url" in root && config) {
    log("[locator-resolve] all candidates failed, attempting self-healing");
    const engine = new SelfHealingEngine(root, config, healingConfig);
    const result = await engine.resolveWithHealing(candidates, { timeout, log });

    if (result.success && result.recoveredLocator && result.recoveredCandidate) {
      log(
        `[locator-resolve] self-healing succeeded: ${result.recoveredCandidate.name} (confidence: ${result.confidence.toFixed(2)})`,
      );
      return {
        candidate: result.recoveredCandidate,
        locator: result.recoveredLocator,
        healed: true,
        confidence: result.confidence,
      };
    }
  }

  // Step 4: No recovery possible
  const elapsed = Date.now() - (deadline - timeout);
  throw new Error(
    `[locator-resolve] All candidates and self-healing failed after ${elapsed}ms`,
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
