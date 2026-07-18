import type { Page } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import {
  type SelectorCandidate,
  locatorFor,
  selectorGroups,
} from "../firefly/selectors.js";
import { collectPageInfo } from "../firefly/dom/pageInfo.js";
import { collectAccessibility } from "../firefly/dom/accessibility.js";
import { collectPerformance } from "../firefly/dom/performance.js";
import { inspectForms } from "../firefly/dom/forms.js";
import { inspectIframes } from "../firefly/dom/iframes.js";
import { detectDialogs } from "../firefly/dom/dialogs.js";
import { traverseShadowDom } from "../firefly/dom/shadowDom.js";
import { buildDomTree } from "../firefly/dom/tree.js";
import { discoverElements } from "../firefly/dom/selectorDiscovery.js";
import {
  saveScreenshot,
  saveAnnotatedScreenshot,
  saveHtml,
} from "../firefly/dom/artifacts.js";
import { ensureDirectory } from "../utils/filesystem.js";

export type DebugBundleInput = Record<string, never>;

export interface DebugBundleResult {
  bundleDir: string;
  files: string[];
  warnings: string[];
}

interface SelectorValidation {
  name: string;
  kind: string;
  selector: string;
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  unique: boolean;
  count: number;
  recommendedLocator?: string;
}

interface AutomationHealth {
  webdriver: boolean;
  chromeRuntime: boolean;
  plugins: number;
  mimeTypes: number;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  viewport: { width: number; height: number };
  browserVersion: string;
  channel: string;
  persistentContext: boolean;
}

interface AuthDiagnostics {
  state: string;
  cookies: Array<{
    name: string;
    domain: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
    expires: number;
  }>;
  tokenExpiry: number | null;
  account: string;
  creditsShown: string;
  availableModels: string[];
  featureFlags: Record<string, unknown>;
}

export async function runDebugBundle(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  input: DebugBundleInput,
): Promise<DebugBundleResult> {
  void input;
  const warnings: string[] = [];
  const files: string[] = [];

  // Create timestamped bundle directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const bundleDir = path.join("debug", "bundles", timestamp);

  await mkdir(bundleDir, { recursive: true });

  logger.info("Starting debug bundle capture", { bundleDir });

  const page = await browser.getPage();
  const context = await browser.getContext();
  browser.ensureListeners(page);

  // Capture all data in parallel where possible
  const [
    pageInfo,
    accessibility,
    performance,
    forms,
    iframes,
    dialogs,
    shadowDom,
    tree,
    selectors_,
    automationHealth,
    authDiagnostics,
  ] = await Promise.all([
    collectPageInfo(page, context).catch((e) => {
      warnings.push(`Page info failed: ${e}`);
      return null;
    }),
    collectAccessibility(page).catch((e) => {
      warnings.push(`Accessibility failed: ${e}`);
      return null;
    }),
    collectPerformance(page).catch((e) => {
      warnings.push(`Performance failed: ${e}`);
      return null;
    }),
    inspectForms(page).catch((e) => {
      warnings.push(`Forms inspection failed: ${e}`);
      return [];
    }),
    inspectIframes(page).catch((e) => {
      warnings.push(`Iframes inspection failed: ${e}`);
      return [];
    }),
    detectDialogs(page).catch((e) => {
      warnings.push(`Dialog detection failed: ${e}`);
      return [];
    }),
    traverseShadowDom(page, 8).catch((e) => {
      warnings.push(`Shadow DOM traversal failed: ${e}`);
      return [];
    }),
    buildDomTree(page, 10).catch((e) => {
      warnings.push(`DOM tree building failed: ${e}`);
      return null;
    }),
    discoverElements(page).catch((e) => {
      warnings.push(`Selector discovery failed: ${e}`);
      return [];
    }),
    collectAutomationHealth(page, config).catch((e) => {
      warnings.push(`Automation health failed: ${e}`);
      return null;
    }),
    collectAuthDiagnostics(page).catch((e) => {
      warnings.push(`Auth diagnostics failed: ${e}`);
      return null;
    }),
  ]);

  // Validate selectors
  const selectorValidation = await validateSelectors(page, config).catch((e) => {
    warnings.push(`Selector validation failed: ${e}`);
    return [];
  });

  // Capture console and network from browser manager
  const consoleMessages = browser.getConsoleMessages(500);
  const networkRequests = browser.getNetworkRequests(500);

  // Capture screenshots and HTML
  const screenshotPath = await saveScreenshot(page, config, "debug-bundle").catch(
    () => "",
  );
  const htmlPath = await saveHtml(page, config).catch(() => "");

  // Annotated screenshot
  const elementsWithBounds = selectors_
    .filter((el) => el.boundingBox !== null)
    .map((el, i) => ({
      label: `${i + 1}`,
      x: el.boundingBox!.x,
      y: el.boundingBox!.y,
    }));
  const annotatedPath =
    elementsWithBounds.length > 0
      ? await saveAnnotatedScreenshot(page, config, elementsWithBounds).catch(() => "")
      : "";

  // Save all data files
  await ensureDirectory(bundleDir);

  const saveFile = async (name: string, data: unknown) => {
    const filePath = path.join(bundleDir, name);
    await writeFile(filePath, JSON.stringify(data, null, 2));
    files.push(name);
  };

  await Promise.all([
    saveFile("page.json", pageInfo),
    saveFile("browser.json", {
      status: await browser.status(),
      config: {
        headless: config.headless,
        profileDir: config.profileDir,
        usePersistentProfile: config.usePersistentProfile,
        userDataDir: config.userDataDir,
      },
    }),
    saveFile("dom.json", {
      tree,
      shadowDom: shadowDom?.length ?? 0,
      iframes: iframes.length,
      forms: forms.length,
      dialogs: dialogs.length,
    }),
    saveFile("accessibility.json", accessibility),
    saveFile("performance.json", performance),
    saveFile("console.json", consoleMessages),
    saveFile("network.json", networkRequests),
    saveFile("cookies.json", await context.cookies()),
    saveFile("storage.json", await collectStorage(page)),
    saveFile("framework.json", await detectFrameworks(page)),
    saveFile("selectors.json", selectors_),
    saveFile("locators.json", selectorValidation),
    saveFile("forms.json", forms),
    saveFile("dialogs.json", dialogs),
    saveFile("shadow-dom.json", shadowDom),
    saveFile("iframes.json", iframes),
    saveFile("permissions.json", await collectPermissions(page)),
    saveFile("fingerprint.json", await collectFingerprint(page)),
    saveFile("service-workers.json", await collectServiceWorkers(page)),
    saveFile("indexeddb.json", await collectIndexedDB(page)),
    saveFile("localstorage.json", await collectLocalStorage(page)),
    saveFile("sessionstorage.json", await collectSessionStorage(page)),
    saveFile("artifacts.json", {
      screenshotPath,
      htmlPath,
      annotatedPath,
    }),
    saveFile("automation-health.json", automationHealth),
    saveFile("authentication.json", authDiagnostics),
  ]);

  // Save HTML file
  if (htmlPath) {
    const htmlContent = await page.content();
    const bundleHtmlPath = path.join(bundleDir, "page.html");
    await writeFile(bundleHtmlPath, htmlContent);
    files.push("page.html");
  }

  // Save screenshots
  if (screenshotPath) {
    files.push("screenshot.png");
  }
  if (annotatedPath) {
    files.push("annotated.png");
  }

  // Generate selector report
  const selectorReport = generateSelectorReport(selectorValidation);
  await writeFile(path.join(bundleDir, "selector-report.md"), selectorReport);
  files.push("selector-report.md");

  // Generate automation health report
  const automationReport = generateAutomationReport(automationHealth);
  await writeFile(path.join(bundleDir, "automation-health.md"), automationReport);
  files.push("automation-health.md");

  // Generate summary report
  const summary = generateSummaryReport({
    pageInfo,
    automationHealth,
    authDiagnostics,
    selectorValidation,
    consoleMessages,
    networkRequests,
    warnings,
  });
  await writeFile(path.join(bundleDir, "summary.md"), summary);
  files.push("summary.md");

  logger.info("Debug bundle complete", {
    bundleDir,
    fileCount: files.length,
    warningCount: warnings.length,
  });

  return { bundleDir, files, warnings };
}

async function collectAutomationHealth(
  page: Page,
  config: AppConfig,
): Promise<AutomationHealth> {
  const chrome = (globalThis as Record<string, unknown>)["chrome"] as
    { runtime?: unknown } | undefined;

  return {
    webdriver: await page.evaluate(() => navigator.webdriver),
    chromeRuntime: chrome?.runtime !== undefined,
    plugins: await page.evaluate(() => navigator.plugins.length),
    mimeTypes: await page.evaluate(() => navigator.mimeTypes.length),
    userAgent: await page.evaluate(() => navigator.userAgent),
    platform: await page.evaluate(() => navigator.platform),
    language: await page.evaluate(() => navigator.language),
    timezone: await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    viewport: config.headless
      ? { width: 1440, height: 1000 }
      : { width: 1440, height: 1000 },
    browserVersion: await page.evaluate(() => {
      const match = navigator.userAgent.match(/Chrome\/([\d.]+)/);
      return match?.[1] ?? "unknown";
    }),
    channel: config.usePersistentProfile ? "chrome" : "chromium",
    persistentContext: true,
  };
}

async function collectAuthDiagnostics(page: Page): Promise<AuthDiagnostics> {
  const cookies = await page.context().cookies();
  const adobeCookies = cookies.filter(
    (c) => c.domain.includes("adobe.com") || c.domain.includes("firefly"),
  );

  const tokenCookies = adobeCookies.filter(
    (c) => c.name.includes("token") || c.name.includes("sid") || c.name.includes("ims"),
  );

  const tokenExpiry =
    tokenCookies.find((c) => c.name.includes("token"))?.expires ?? null;

  return {
    state: await page.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes("Sign In") || body.includes("Log In")) return "logged_out";
      if (body.includes("Generate")) return "logged_in";
      return "unknown";
    }),
    cookies: adobeCookies.map((c) => ({
      name: c.name,
      domain: c.domain,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite || "None",
      expires: c.expires,
    })),
    tokenExpiry,
    account: await page.evaluate(() => {
      const el =
        document.querySelector('[data-testid*="user"]') ||
        document.querySelector('[class*="user-name"]');
      return el?.textContent?.trim() ?? "unknown";
    }),
    creditsShown: await page.evaluate(() => {
      const el =
        document.querySelector('[data-testid*="credits"]') ||
        document.querySelector('[class*="credits"]');
      return el?.textContent?.trim() ?? "unknown";
    }),
    availableModels: [],
    featureFlags: {},
  };
}

async function validateSelectors(
  page: Page,
  config: AppConfig,
): Promise<SelectorValidation[]> {
  const groups = selectorGroups(config);
  const results: SelectorValidation[] = [];

  const validateCandidate = async (
    name: string,
    candidate: SelectorCandidate,
  ): Promise<SelectorValidation> => {
    let selectorStr: string;
    switch (candidate.kind) {
      case "css":
        selectorStr = candidate.selector;
        break;
      case "testId":
        selectorStr = `[data-testid="${candidate.testId}"]`;
        break;
      case "role":
        selectorStr = `role=${candidate.role}`;
        break;
      case "label":
        selectorStr = `label=${candidate.text}`;
        break;
      case "placeholder":
        selectorStr = `placeholder=${candidate.text}`;
        break;
      case "text":
        selectorStr = `text=${candidate.text}`;
        break;
      default:
        selectorStr = "unknown";
    }

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
    const unique = count === 1;

    return {
      name,
      kind: candidate.kind,
      selector: selectorStr,
      exists,
      visible,
      enabled,
      unique,
      count,
      recommendedLocator: exists ? undefined : `page.locator('${selectorStr}')`,
    };
  };

  for (const [groupName, candidates] of Object.entries(groups)) {
    const candidateList = candidates as SelectorCandidate[];
    for (const candidate of candidateList) {
      const result = await validateCandidate(
        `${groupName}.${candidate.name}`,
        candidate,
      );
      results.push(result);
    }
  }

  return results;
}

async function collectStorage(page: Page): Promise<Record<string, unknown>> {
  return {
    localStorage: await page.evaluate(() => Object.keys(window.localStorage)),
    sessionStorage: await page.evaluate(() => Object.keys(window.sessionStorage)),
  };
}

async function collectPermissions(page: Page): Promise<Record<string, string>> {
  const permissions: Record<string, string> = {};
  const apiNames = ["notifications", "geolocation", "camera", "microphone"] as const;

  for (const api of apiNames) {
    try {
      const result = await page.evaluate(async (name) => {
        const perms = navigator.permissions as {
          query: (opts: { name: string }) => Promise<{ state: string }>;
        };
        const status = await perms.query({ name });
        return status.state;
      }, api);
      permissions[api] = result;
    } catch {
      permissions[api] = "unavailable";
    }
  }

  return permissions;
}

async function collectFingerprint(page: Page): Promise<Record<string, unknown>> {
  return {
    userAgent: await page.evaluate(() => navigator.userAgent),
    platform: await page.evaluate(() => navigator.platform),
    languages: await page.evaluate(() => Array.from(navigator.languages)),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    deviceMemory: await page.evaluate(() => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      return nav.deviceMemory ?? 0;
    }),
    screenWidth: await page.evaluate(() => screen.width),
    screenHeight: await page.evaluate(() => screen.height),
    devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    timezone: await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    webglRenderer: await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
        }
      }
      return "";
    }),
    chrome: await page.evaluate(() => {
      const chromeObj = (globalThis as Record<string, unknown>)["chrome"];
      return chromeObj !== undefined && chromeObj !== null;
    }),
  };
}

async function collectServiceWorkers(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.map((r) => r.scope);
    }
    return [];
  });
}

async function collectIndexedDB(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      return dbs.map((db) => db.name ?? "unknown");
    }
    return [];
  });
}

async function collectLocalStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        items[key] = window.localStorage.getItem(key) ?? "";
      }
    }
    return items;
  });
}

async function collectSessionStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key) {
        items[key] = window.sessionStorage.getItem(key) ?? "";
      }
    }
    return items;
  });
}

async function detectFrameworks(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const frameworks: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as unknown as Record<string, any>;

    // React
    frameworks.react = !!(
      win["__REACT_DEVTOOLS_GLOBAL_HOOK__"] ||
      document.querySelector("[data-reactroot]") ||
      document.querySelector("[data-reactid]")
    );

    // Vue
    frameworks.vue = !!(win["__VUE__"] || win["__VUE_DEVTOOLS_GLOBAL_HOOK__"]);

    // Angular
    frameworks.angular = !!(
      win["ng"] ||
      document.querySelector("[ng-version]") ||
      document.querySelector("[ng-app]")
    );

    // Svelte
    frameworks.svelte = !!document.querySelector("[class*='svelte-']");

    // Next.js
    frameworks.nextjs = !!(win["__NEXT_DATA__"] || document.querySelector("#__next"));

    // Apollo/GraphQL
    frameworks.apollo = win["__APOLLO_CLIENT__"] !== undefined;

    return frameworks;
  });
}

function generateSelectorReport(validations: SelectorValidation[]): string {
  const lines: string[] = [
    "# Selector Validation Report",
    "",
    `**Timestamp**: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Status | Count |`,
    `|--------|-------|`,
    `| ✅ Exists | ${validations.filter((v) => v.exists).length} |`,
    `| ❌ Missing | ${validations.filter((v) => !v.exists).length} |`,
    `| 👁️ Visible | ${validations.filter((v) => v.visible).length} |`,
    `| 🔒 Enabled | ${validations.filter((v) => v.enabled).length} |`,
    `| 🎯 Unique | ${validations.filter((v) => v.unique).length} |`,
    "",
    "---",
    "",
    "## Details",
    "",
    "| Selector | Kind | Exists | Visible | Enabled | Unique | Count |",
    "|----------|------|--------|---------|---------|--------|-------|",
  ];

  for (const v of validations) {
    const existsIcon = v.exists ? "✅" : "❌";
    const visibleIcon = v.visible ? "✅" : "❌";
    const enabledIcon = v.enabled ? "✅" : "❌";
    const uniqueIcon = v.unique ? "✅" : "❌";

    lines.push(
      `| ${v.name} | ${v.kind} | ${existsIcon} | ${visibleIcon} | ${enabledIcon} | ${uniqueIcon} | ${v.count} |`,
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Report generated by debug bundle*");

  return lines.join("\n");
}

function generateAutomationReport(health: AutomationHealth | null): string {
  if (!health) {
    return "# Automation Health Report\n\nFailed to collect automation health data.";
  }

  const lines: string[] = [
    "# Automation Health Report",
    "",
    `**Timestamp**: ${new Date().toISOString()}`,
    "",
    "## Browser Environment",
    "",
    "| Property | Value | Status |",
    "|----------|-------|--------|",
    `| navigator.webdriver | ${health.webdriver} | ${health.webdriver ? "⚠️ Detected" : "✅ Clean"} |`,
    `| window.chrome | ${health.chromeRuntime} | ${health.chromeRuntime ? "✅ Present" : "⚠️ Missing"} |`,
    `| Plugins | ${health.plugins} | ${health.plugins > 0 ? "✅" : "⚠️ None"} |`,
    `| MIME Types | ${health.mimeTypes} | ${health.mimeTypes > 0 ? "✅" : "⚠️ None"} |`,
    `| User Agent | ${health.userAgent.substring(0, 60)}... | - |`,
    `| Platform | ${health.platform} | - |`,
    `| Language | ${health.language} | - |`,
    `| Timezone | ${health.timezone} | - |`,
    `| Viewport | ${health.viewport.width}x${health.viewport.height} | - |`,
    `| Browser Version | ${health.browserVersion} | - |`,
    `| Channel | ${health.channel} | - |`,
    `| Persistent Context | ${health.persistentContext} | - |`,
    "",
    "## Automation Indicators",
    "",
  ];

  const indicators: string[] = [];
  if (health.webdriver) indicators.push("- ⚠️ navigator.webdriver is true");
  if (!health.chromeRuntime) indicators.push("- ⚠️ window.chrome is missing");
  if (health.plugins === 0) indicators.push("- ⚠️ No plugins installed");

  if (indicators.length === 0) {
    lines.push("No automation indicators detected.");
  } else {
    lines.push(...indicators);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Report generated by debug bundle*");

  return lines.join("\n");
}

function generateSummaryReport(data: {
  pageInfo: unknown;
  automationHealth: AutomationHealth | null;
  authDiagnostics: AuthDiagnostics | null;
  selectorValidation: SelectorValidation[];
  consoleMessages: Array<{ type: string; text: string }>;
  networkRequests: Array<{ status?: number; url: string }>;
  warnings: string[];
}): string {
  const lines: string[] = [
    "# Debug Bundle Summary",
    "",
    `**Timestamp**: ${new Date().toISOString()}`,
    "",
    "## Environment",
    "",
    `- Browser: ${data.automationHealth?.browserVersion ?? "unknown"} (${data.automationHealth?.channel ?? "unknown"})`,
    `- Platform: ${data.automationHealth?.platform ?? "unknown"}`,
    `- User Agent: ${data.automationHealth?.userAgent.substring(0, 60) ?? "unknown"}...`,
    `- Viewport: ${data.automationHealth?.viewport.width ?? 0}x${data.automationHealth?.viewport.height ?? 0}`,
    "",
    "## Authentication",
    "",
    `- State: ${data.authDiagnostics?.state ?? "unknown"}`,
    `- Adobe Cookies: ${data.authDiagnostics?.cookies.length ?? 0}`,
    `- Token Expiry: ${data.authDiagnostics?.tokenExpiry ? new Date(data.authDiagnostics.tokenExpiry * 1000).toISOString() : "unknown"}`,
    `- Account: ${data.authDiagnostics?.account ?? "unknown"}`,
    `- Credits: ${data.authDiagnostics?.creditsShown ?? "unknown"}`,
    "",
    "## Browser",
    "",
    `- navigator.webdriver: ${data.automationHealth?.webdriver ?? "unknown"}`,
    `- window.chrome: ${data.automationHealth?.chromeRuntime ?? "unknown"}`,
    `- Plugins: ${data.automationHealth?.plugins ?? 0}`,
    `- Persistent Context: ${data.automationHealth?.persistentContext ?? "unknown"}`,
    "",
    "## Network",
    "",
    `- Total Requests: ${data.networkRequests.length}`,
    `- Failed Requests: ${data.networkRequests.filter((r) => r.status !== undefined && r.status >= 400).length}`,
    "",
    "## DOM",
    "",
    `- Selectors Found: ${data.selectorValidation.length}`,
    `- Valid Selectors: ${data.selectorValidation.filter((v) => v.exists).length}`,
    `- Broken Selectors: ${data.selectorValidation.filter((v) => !v.exists).length}`,
    "",
    "## Broken Selectors",
    "",
  ];

  const broken = data.selectorValidation.filter((v) => !v.exists);
  if (broken.length === 0) {
    lines.push("No broken selectors.");
  } else {
    for (const s of broken.slice(0, 10)) {
      lines.push(`- ${s.name}: ${s.selector}`);
    }
    if (broken.length > 10) {
      lines.push(`- ... and ${broken.length - 10} more`);
    }
  }

  lines.push("");
  lines.push("## Warnings", "");

  if (data.warnings.length === 0) {
    lines.push("No warnings.");
  } else {
    for (const w of data.warnings.slice(0, 10)) {
      lines.push(`- ${w}`);
    }
    if (data.warnings.length > 10) {
      lines.push(`- ... and ${data.warnings.length - 10} more`);
    }
  }

  lines.push("");
  lines.push("## Console Errors", "");

  const errors = data.consoleMessages.filter((m) => m.type === "error");
  if (errors.length === 0) {
    lines.push("No console errors.");
  } else {
    for (const e of errors.slice(0, 5)) {
      lines.push(`- ${e.text.substring(0, 100)}`);
    }
    if (errors.length > 5) {
      lines.push(`- ... and ${errors.length - 5} more`);
    }
  }

  lines.push("");
  lines.push("## Confidence Level", "");

  let confidence = 100;
  if (data.automationHealth?.webdriver) confidence -= 20;
  if (!data.automationHealth?.chromeRuntime) confidence -= 10;
  if (data.authDiagnostics?.state !== "logged_in") confidence -= 30;
  if (broken.length > 5) confidence -= 10;
  if (errors.length > 10) confidence -= 10;

  lines.push(`- Overall Confidence: ${confidence}%`);
  lines.push(
    `- Automation Detection: ${data.automationHealth?.webdriver ? "⚠️ Detected" : "✅ Clean"}`,
  );
  lines.push(
    `- Authentication: ${data.authDiagnostics?.state === "logged_in" ? "✅ Valid" : "❌ Invalid"}`,
  );
  lines.push(
    `- Selectors: ${broken.length === 0 ? "✅ All valid" : `⚠️ ${broken.length} broken`}`,
  );

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Report generated by debug bundle*");

  return lines.join("\n");
}
