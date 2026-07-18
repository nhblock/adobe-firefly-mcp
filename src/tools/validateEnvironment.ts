import type { Page } from "playwright";

import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import {
  selectorGroups,
  locatorFor,
  type SelectorCandidate,
} from "../firefly/selectors.js";

export interface EnvironmentCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: unknown;
}

export interface EnvironmentValidation {
  readinessScore: number;
  checks: EnvironmentCheck[];
  timestamp: string;
  pageUrl: string;
}

export async function validateEnvironment(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  _options: Record<string, never> = {},
): Promise<EnvironmentValidation> {
  void _options;
  const checks: EnvironmentCheck[] = [];
  const page = await browser.getPage();

  logger.info("Starting environment validation", { url: page.url() });

  // Run all checks in parallel where possible
  const [
    authCheck,
    browserCheck,
    cookiesCheck,
    storageCheck,
    creditsCheck,
    automationCheck,
    selectorsCheck,
    promptCheck,
    downloadCheck,
  ] = await Promise.all([
    checkAuthentication(page).catch((e) => ({
      name: "authentication",
      status: "fail" as const,
      message: `Auth check failed: ${e}`,
    })),
    checkBrowser(page).catch((e) => ({
      name: "browser",
      status: "fail" as const,
      message: `Browser check failed: ${e}`,
    })),
    checkCookies(page).catch((e) => ({
      name: "cookies",
      status: "fail" as const,
      message: `Cookie check failed: ${e}`,
    })),
    checkStorage(page).catch((e) => ({
      name: "storage",
      status: "fail" as const,
      message: `Storage check failed: ${e}`,
    })),
    checkCredits(page).catch((e) => ({
      name: "credits",
      status: "warn" as const,
      message: `Credits check failed: ${e}`,
    })),
    checkAutomationHealth(page).catch((e) => ({
      name: "automation_health",
      status: "fail" as const,
      message: `Automation health check failed: ${e}`,
    })),
    checkSelectors(page, config).catch((e) => ({
      name: "selectors",
      status: "fail" as const,
      message: `Selector check failed: ${e}`,
    })),
    checkPromptInput(page, config).catch((e) => ({
      name: "prompt_input",
      status: "fail" as const,
      message: `Prompt input check failed: ${e}`,
    })),
    checkDownloadSupport(page).catch((e) => ({
      name: "download_support",
      status: "warn" as const,
      message: `Download support check failed: ${e}`,
    })),
  ]);

  checks.push(
    authCheck,
    browserCheck,
    cookiesCheck,
    storageCheck,
    creditsCheck,
    automationCheck,
    selectorsCheck,
    promptCheck,
    downloadCheck,
  );

  // Calculate readiness score
  const readinessScore = calculateReadinessScore(checks);

  logger.info("Environment validation complete", {
    readinessScore,
    passCount: checks.filter((c) => c.status === "pass").length,
    failCount: checks.filter((c) => c.status === "fail").length,
    warnCount: checks.filter((c) => c.status === "warn").length,
  });

  return {
    readinessScore,
    checks,
    timestamp: new Date().toISOString(),
    pageUrl: page.url(),
  };
}

async function checkAuthentication(page: Page): Promise<EnvironmentCheck> {
  const isLoggedIn = await page.evaluate(() => {
    const body = document.body.innerText;
    if (body.includes("Sign In") || body.includes("Log In")) return false;
    if (body.includes("Generate")) return true;
    return false;
  });

  return {
    name: "authentication",
    status: isLoggedIn ? "pass" : "fail",
    message: isLoggedIn
      ? "User is logged in to Adobe Firefly"
      : "User is not logged in to Adobe Firefly",
    details: { isLoggedIn },
  };
}

async function checkBrowser(page: Page): Promise<EnvironmentCheck> {
  const browserInfo = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
    webdriver: navigator.webdriver,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  }));

  const isChrome = browserInfo.userAgent.includes("Chrome");
  const hasWebdriver = browserInfo.webdriver;

  return {
    name: "browser",
    status: isChrome && !hasWebdriver ? "pass" : "warn",
    message: isChrome
      ? hasWebdriver
        ? "Chrome detected but webdriver flag is set (automation detected)"
        : "Chrome detected, no automation flags"
      : `Non-Chrome browser detected: ${browserInfo.userAgent.substring(0, 50)}`,
    details: browserInfo,
  };
}

async function checkCookies(page: Page): Promise<EnvironmentCheck> {
  const cookies = await page.context().cookies();
  const adobeCookies = cookies.filter(
    (c) => c.domain.includes("adobe.com") || c.domain.includes("firefly"),
  );

  const sessionCookies = adobeCookies.filter(
    (c) => c.name.includes("sid") || c.name.includes("token") || c.name.includes("ims"),
  );

  return {
    name: "cookies",
    status: adobeCookies.length > 0 ? "pass" : "warn",
    message: `${adobeCookies.length} Adobe cookies found, ${sessionCookies.length} session cookies`,
    details: {
      totalCookies: cookies.length,
      adobeCookies: adobeCookies.length,
      sessionCookies: sessionCookies.length,
    },
  };
}

async function checkStorage(page: Page): Promise<EnvironmentCheck> {
  const storage = await page.evaluate(() => ({
    localStorageKeys: Object.keys(window.localStorage).length,
    sessionStorageKeys: Object.keys(window.sessionStorage).length,
  }));

  return {
    name: "storage",
    status: "pass",
    message: `localStorage: ${storage.localStorageKeys} keys, sessionStorage: ${storage.sessionStorageKeys} keys`,
    details: storage,
  };
}

async function checkCredits(page: Page): Promise<EnvironmentCheck> {
  const creditsInfo = await page.evaluate(() => {
    const body = document.body.innerText;
    const creditMatch = body.match(/(\d+)\s*(?:credits?|generations?)/i);
    return {
      shown: creditMatch ? creditMatch[1] : "unknown",
      visible: body.includes("credit") || body.includes("generation"),
    };
  });

  return {
    name: "credits",
    status: creditsInfo.visible ? "pass" : "warn",
    message: creditsInfo.visible
      ? `Credits visible: ${creditsInfo.shown}`
      : "Credits information not visible",
    details: creditsInfo,
  };
}

async function checkAutomationHealth(page: Page): Promise<EnvironmentCheck> {
  const health = await page.evaluate(() => {
    const chromeObj = (globalThis as Record<string, unknown>)["chrome"] as
      { runtime?: unknown } | undefined;
    return {
      webdriver: navigator.webdriver,
      chromeRuntime: chromeObj?.runtime !== undefined,
      plugins: navigator.plugins.length,
      languages: navigator.languages.length,
      hasNotificationPermission:
        "Notification" in window ? Notification.permission : "unavailable",
    };
  });

  const issues: string[] = [];
  if (health.webdriver) issues.push("navigator.webdriver is true");
  if (!health.chromeRuntime) issues.push("window.chrome is missing");
  if (health.plugins === 0) issues.push("No plugins installed");

  return {
    name: "automation_health",
    status: issues.length === 0 ? "pass" : issues.length <= 2 ? "warn" : "fail",
    message:
      issues.length === 0
        ? "No automation indicators detected"
        : `Automation indicators: ${issues.join(", ")}`,
    details: health,
  };
}

async function checkSelectors(
  page: Page,
  config: AppConfig,
): Promise<EnvironmentCheck> {
  const groups = selectorGroups(config);
  const results: Array<{
    name: string;
    exists: boolean;
    visible: boolean;
    enabled: boolean;
  }> = [];

  for (const [groupName, candidates] of Object.entries(groups)) {
    const candidateList = candidates as SelectorCandidate[];
    for (const candidate of candidateList) {
      try {
        const locator = locatorFor(page, candidate);
        const count = await locator.count().catch(() => 0);
        const exists = count > 0;
        const visible = exists
          ? await locator
              .first()
              .isVisible()
              .catch(() => false)
          : false;
        const enabled = exists
          ? await locator
              .first()
              .isEnabled()
              .catch(() => false)
          : false;

        results.push({
          name: `${groupName}.${candidate.name}`,
          exists,
          visible,
          enabled,
        });
      } catch {
        results.push({
          name: `${groupName}.${candidate.name}`,
          exists: false,
          visible: false,
          enabled: false,
        });
      }
    }
  }

  const validCount = results.filter((r) => r.exists && r.visible && r.enabled).length;
  const totalCount = results.length;

  return {
    name: "selectors",
    status: validCount > totalCount * 0.5 ? "pass" : "fail",
    message: `${validCount}/${totalCount} selectors are valid (visible and enabled)`,
    details: { validCount, totalCount, results },
  };
}

async function checkPromptInput(
  page: Page,
  config: AppConfig,
): Promise<EnvironmentCheck> {
  const groups = selectorGroups(config);
  const promptCandidates = groups.promptInputs;

  let found = false;
  for (const candidate of promptCandidates) {
    try {
      const locator = locatorFor(page, candidate);
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        const isVisible = await locator
          .first()
          .isVisible()
          .catch(() => false);
        if (isVisible) {
          found = true;
          break;
        }
      }
    } catch {
      // Continue
    }
  }

  return {
    name: "prompt_input",
    status: found ? "pass" : "fail",
    message: found
      ? "Prompt input is visible and ready"
      : "Prompt input not found or not visible",
    details: { found },
  };
}

async function checkDownloadSupport(page: Page): Promise<EnvironmentCheck> {
  const downloadSupported = await page.evaluate(() => {
    const link = document.createElement("a");
    return "download" in link;
  });

  return {
    name: "download_support",
    status: downloadSupported ? "pass" : "warn",
    message: downloadSupported
      ? "Download support available"
      : "Download support limited",
    details: { downloadSupported },
  };
}

function calculateReadinessScore(checks: EnvironmentCheck[]): number {
  let score = 0;
  const totalWeight = 100;

  // Critical checks (higher weight)
  const criticalChecks = ["authentication", "prompt_input", "selectors"];
  const importantChecks = ["browser", "automation_health", "cookies"];
  const optionalChecks = ["credits", "storage", "download_support"];

  for (const check of checks) {
    if (criticalChecks.includes(check.name)) {
      if (check.status === "pass") score += 25;
      else if (check.status === "warn") score += 10;
    } else if (importantChecks.includes(check.name)) {
      if (check.status === "pass") score += 10;
      else if (check.status === "warn") score += 5;
    } else if (optionalChecks.includes(check.name)) {
      if (check.status === "pass") score += 5;
      else if (check.status === "warn") score += 2;
    }
  }

  return Math.min(score, totalWeight);
}
