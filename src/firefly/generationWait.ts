import type { Page } from "playwright";

import { selectors, locatorFor } from "./selectors.js";

export type GenerationStatus =
  | "success"
  | "firefly_error"
  | "moderation_error"
  | "auth_error"
  | "credit_error"
  | "timeout";

export interface GenerationResult {
  status: GenerationStatus;
  message: string;
  diagnostics: {
    downloadButtonVisible: boolean;
    downloadButtonEnabled: boolean;
    errorIndicators: string[];
    pageUrl: string;
    elapsedMs: number;
  };
}

export interface WaitOptions {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  onProgress?: (elapsed: number, message: string) => void;
}

const FIREFOX_ERROR_PATTERNS: Array<{
  pattern: RegExp;
  status: GenerationStatus;
  label: string;
}> = [
  {
    pattern: /something went wrong/i,
    status: "firefly_error",
    label: "Something went wrong",
  },
  { pattern: /try again/i, status: "firefly_error", label: "Try again" },
  {
    pattern: /unable to generate/i,
    status: "firefly_error",
    label: "Unable to generate",
  },
  {
    // Match only genuine credit-depletion messages. The account menu shows a
    // permanent "Get Credits" upsell button whose text must NOT be treated as a
    // generation failure — it is present even during a successful generation.
    pattern:
      /not enough credits|out of credits|no (more )?credits?|credits? (required|needed|exhausted|depleted|remaining|left)|insufficient credits|purchase (more )?credits/i,
    status: "credit_error",
    label: "Credit issue",
  },
  { pattern: /quota/i, status: "credit_error", label: "Quota exceeded" },
  { pattern: /limit.?reached/i, status: "credit_error", label: "Limit reached" },
  {
    pattern: /no.?generations.?left/i,
    status: "credit_error",
    label: "No generations left",
  },
];

export async function waitForGenerationToComplete(
  page: Page,
  options: WaitOptions = {},
): Promise<GenerationResult> {
  const { maxWaitMs = 180000, pollIntervalMs = 3000, onProgress } = options;
  const deadline = Date.now() + maxWaitMs;
  const start = Date.now();
  let lastMessage = "";

  while (Date.now() < deadline) {
    const elapsed = Date.now() - start;
    const state = await checkGenerationState(page);

    if (state.status === "success") {
      onProgress?.(elapsed, "Generation completed successfully");
      return {
        status: "success",
        message: "Generation completed",
        diagnostics: {
          downloadButtonVisible: state.downloadButtonVisible,
          downloadButtonEnabled: state.downloadButtonEnabled,
          errorIndicators: [],
          pageUrl: page.url(),
          elapsedMs: elapsed,
        },
      };
    }

    if (state.errorStatus !== undefined) {
      onProgress?.(elapsed, `Error detected: ${state.errorStatus}`);
      return {
        status: state.errorStatus,
        message: state.errorMessage ?? "Unknown error",
        diagnostics: {
          downloadButtonVisible: state.downloadButtonVisible,
          downloadButtonEnabled: state.downloadButtonEnabled,
          errorIndicators: state.errorIndicators,
          pageUrl: page.url(),
          elapsedMs: elapsed,
        },
      };
    }

    const currentMessage = state.downloadButtonVisible
      ? "Download button visible (disabled)"
      : state.spinnerVisible
        ? "Generating..."
        : "Pending";

    if (currentMessage !== lastMessage) {
      lastMessage = currentMessage;
      onProgress?.(elapsed, currentMessage);
    }

    await page.waitForTimeout(Math.min(pollIntervalMs, deadline - Date.now()));
  }

  return {
    status: "timeout",
    message: `Generation did not complete within ${maxWaitMs}ms`,
    diagnostics: {
      downloadButtonVisible: false,
      downloadButtonEnabled: false,
      errorIndicators: [],
      pageUrl: page.url(),
      elapsedMs: Date.now() - start,
    },
  };
}

interface GenerationState {
  downloadButtonVisible: boolean;
  downloadButtonEnabled: boolean;
  spinnerVisible: boolean;
  errorIndicators: string[];
  status: "success" | "error" | "pending";
  errorStatus?: GenerationStatus;
  errorMessage?: string;
}

async function checkGenerationState(page: Page): Promise<GenerationState> {
  const downloadButtonVisible = await isDownloadButtonVisible(page);
  const downloadButtonEnabled = await isDownloadButtonEnabled(page);
  const spinnerVisible = await isSpinnerVisible(page);
  const errorIndicators = await detectErrorIndicators(page);

  if (downloadButtonVisible && downloadButtonEnabled) {
    return {
      downloadButtonVisible,
      downloadButtonEnabled,
      errorIndicators,
      spinnerVisible,
      status: "success",
    };
  }

  if (errorIndicators.length > 0) {
    const { status, message } = classifyError(errorIndicators);
    return {
      downloadButtonVisible,
      downloadButtonEnabled,
      errorIndicators,
      spinnerVisible,
      status: "error",
      errorStatus: status,
      errorMessage: message,
    };
  }

  return {
    downloadButtonVisible,
    downloadButtonEnabled,
    errorIndicators,
    spinnerVisible,
    status: "pending",
  };
}

async function isDownloadButtonVisible(page: Page): Promise<boolean> {
  const candidates = selectors.video.download;
  for (const candidate of candidates) {
    try {
      const loc = locatorFor(page, candidate);
      const visible = await loc.first().isVisible({ timeout: 300 });
      if (visible) return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function isDownloadButtonEnabled(page: Page): Promise<boolean> {
  const candidates = selectors.video.download;
  for (const candidate of candidates) {
    try {
      const loc = locatorFor(page, candidate);
      const element = loc.first();
      const visible = await element.isVisible({ timeout: 300 });
      if (visible) {
        const enabled = await element.isEnabled({ timeout: 300 }).catch(() => false);
        if (enabled) return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

async function isSpinnerVisible(page: Page): Promise<boolean> {
  const candidates = selectors.shared.loading;
  for (const candidate of candidates) {
    try {
      const loc = locatorFor(page, candidate);
      const visible = await loc.first().isVisible({ timeout: 300 });
      if (visible) return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function detectErrorIndicators(page: Page): Promise<string[]> {
  const errors: string[] = [];

  const errorSelectors = [
    '[data-testid*="error" i]',
    '[role="alert"]',
    '[class*="error" i]',
    '[class*="Error" i]',
    'div:has-text("Something went wrong")',
    'div:has-text("Try again")',
    'div:has-text("Unable to generate")',
    'div:has-text("Failed")',
    'div:has-text("Server error")',
    'div:has-text("Network error")',
    'div:has-text("moderation")',
    'div:has-text("violation")',
    'div:has-text("not allowed")',
    'div:has-text("inappropriate")',
    'div:has-text("quota")',
    'div:has-text("limit")',
    'div:has-text("sign in")',
    'div:has-text("log in")',
    'div:has-text("session expired")',
  ];

  for (const selector of errorSelectors) {
    try {
      const loc = page.locator(selector);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const element = loc.nth(i);
        const visible = await element.isVisible({ timeout: 200 }).catch(() => false);
        if (visible) {
          const text = await element.textContent({ timeout: 200 }).catch(() => "");
          if (text && text.trim().length > 0 && text.trim().length < 200) {
            const trimmed = text.trim();
            if (!errors.includes(trimmed)) {
              errors.push(trimmed);
            }
          }
        }
      }
    } catch {
      // continue
    }
  }

  return errors;
}

function classifyError(errorIndicators: string[]): {
  status: GenerationStatus;
  message: string;
} {
  const combinedText = errorIndicators.join(" ");

  for (const { pattern, status, label } of FIREFOX_ERROR_PATTERNS) {
    if (pattern.test(combinedText)) {
      return { status, message: `${label}: ${errorIndicators[0]}` };
    }
  }

  return {
    status: "firefly_error",
    message: `Unknown error: ${errorIndicators[0]}`,
  };
}
