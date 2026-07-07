/**
 * Confidence-Based Authentication Detector
 * 
 * Replaces binary auth detection with a confidence scoring system.
 * Eliminates false positives from header "Sign in" buttons.
 */
import type { Page } from "playwright";

export interface AuthIndicator {
  name: string;
  weight: number;
  description: string;
}

export interface AuthCheckResult {
  indicator: AuthIndicator;
  found: boolean;
  visible: boolean;
  text: string;
}

export interface AuthConfidenceResult {
  score: number;
  status: "authenticated" | "probably_authenticated" | "uncertain" | "not_authenticated";
  indicators: AuthCheckResult[];
  timestamp: string;
  url: string;
}

// Positive indicators (increase confidence)
const POSITIVE_INDICATORS: AuthIndicator[] = [
  {
    name: "prompt_textarea",
    weight: 40,
    description: "Prompt textarea visible - core workspace element",
  },
  {
    name: "generate_button",
    weight: 30,
    description: "Generate button visible - user can create content",
  },
  {
    name: "avatar_button",
    weight: 25,
    description: "Avatar/profile button visible - user menu accessible",
  },
  {
    name: "workspace_controls",
    weight: 20,
    description: "Workspace controls visible (model, resolution, etc.)",
  },
  {
    name: "credit_display",
    weight: 15,
    description: "Credit/quota display visible - user is logged in",
  },
];

// Negative indicators (decrease confidence)
const NEGATIVE_INDICATORS: AuthIndicator[] = [
  {
    name: "full_screen_signin",
    weight: -40,
    description: "Full-screen sign-in page - definitely not authenticated",
  },
  {
    name: "login_dialog",
    weight: -30,
    description: "Login dialog/modal visible",
  },
  {
    name: "signin_redirect",
    weight: -35,
    description: "URL indicates sign-in redirect (adobeid, sign-in, auth)",
  },
];

// Selectors for each indicator
const SELECTORS = {
  prompt_textarea: [
    'textarea[placeholder*="Describe"]',
    'textarea[aria-label*="Prompt"]',
    'textarea[aria-label*="prompt"]',
    '[role="textbox"][aria-label*="prompt"]',
  ],
  generate_button: [
    'button:has-text("Generate")',
    '[data-testid*="generate-button"]',
    '[aria-label*="Generate"]',
  ],
  avatar_button: [
    '[data-testid*="avatar"]',
    '[aria-label*="account" i]',
    '[aria-label*="profile" i]',
    '[aria-label*="user" i]',
    'img[alt*="avatar"]',
  ],
  workspace_controls: [
    '[data-testid*="model"]',
    '[data-testid*="resolution"]',
    '[data-testid*="aspect-ratio"]',
    'button:has-text("Veo")',
    'button:has-text("720p")',
    'button:has-text("16:9")',
  ],
  credit_display: [
    '[data-testid*="credit"]',
    '[data-testid*="quota"]',
    'text=/\\d+ credits?/',
  ],
  full_screen_signin: [
    'div:has-text("Sign in to Adobe")',
    'div:has-text("Continue to sign in")',
    '[data-testid*="sign-in-container"]',
  ],
  login_dialog: [
    '[role="dialog"]:has-text("Sign in")',
    '[role="dialog"]:has-text("Log in")',
    '.modal:has-text("Sign in")',
  ],
};

/**
 * Check if a selector matches any visible elements
 */
async function checkSelector(
  page: Page,
  selector: string,
): Promise<{ found: boolean; visible: boolean; text: string }> {
  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return { found: false, visible: false, text: "" };
    }

    // Check if any instance is visible
    for (let i = 0; i < Math.min(count, 3); i++) {
      try {
        const isVisible = await locator.nth(i).isVisible({ timeout: 200 });
        if (isVisible) {
          const text = (await locator.nth(i).textContent({ timeout: 200 })) || "";
          return { found: true, visible: true, text: text.substring(0, 50) };
        }
      } catch {
        // Continue to next element
      }
    }

    return { found: true, visible: false, text: "" };
  } catch {
    return { found: false, visible: false, text: "" };
  }
}

/**
 * Check a single indicator against all its selectors
 */
async function checkIndicator(
  page: Page,
  indicator: AuthIndicator,
  selectors: string[],
): Promise<AuthCheckResult> {
  for (const selector of selectors) {
    const result = await checkSelector(page, selector);
    if (result.visible) {
      return {
        indicator,
        found: true,
        visible: true,
        text: result.text,
      };
    }
  }

  return {
    indicator,
    found: false,
    visible: false,
    text: "",
  };
}

/**
 * Check URL for sign-in indicators
 */
function checkUrlForSignIn(url: string): boolean {
  return /adobeid|sign[_-]?in|login|auth/i.test(url);
}

/**
 * Calculate confidence score from indicator results
 */
function calculateConfidence(results: AuthCheckResult[]): number {
  let score = 50; // Start at neutral

  for (const result of results) {
    if (result.visible) {
      score += result.indicator.weight;
    }
  }

  // Check URL (handled separately)
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine status from confidence score
 */
function getStatus(
  score: number,
): "authenticated" | "probably_authenticated" | "uncertain" | "not_authenticated" {
  if (score >= 90) return "authenticated";
  if (score >= 60) return "probably_authenticated";
  if (score >= 30) return "uncertain";
  return "not_authenticated";
}

/**
 * Main authentication detection function
 */
export async function detectAuthConfidence(
  page: Page,
): Promise<AuthConfidenceResult> {
  const results: AuthCheckResult[] = [];

  // Check positive indicators
  for (const indicator of POSITIVE_INDICATORS) {
    const selectors = SELECTORS[indicator.name as keyof typeof SELECTORS] || [];
    const result = await checkIndicator(page, indicator, selectors);
    results.push(result);
  }

  // Check negative indicators
  for (const indicator of NEGATIVE_INDICATORS) {
    const selectors = SELECTORS[indicator.name as keyof typeof SELECTORS] || [];
    const result = await checkIndicator(page, indicator, selectors);
    results.push(result);
  }

  // Check URL
  const url = page.url();
  const urlHasSignIn = checkUrlForSignIn(url);

  // Calculate score from indicators
  let score = calculateConfidence(results);

  // Apply URL penalty
  if (urlHasSignIn) {
    score -= 35;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status: getStatus(score),
    indicators: results,
    timestamp: new Date().toISOString(),
    url,
  };
}

/**
 * Legacy compatibility function
 * Returns "ready" | "sign_in_required" | "unknown"
 */
export async function detectAuthStateLegacy(
  page: Page,
): Promise<"ready" | "sign_in_required" | "unknown"> {
  const result = await detectAuthConfidence(page);

  switch (result.status) {
    case "authenticated":
    case "probably_authenticated":
      return "ready";
    case "not_authenticated":
      return "sign_in_required";
    case "uncertain":
    default:
      return "unknown";
  }
}
