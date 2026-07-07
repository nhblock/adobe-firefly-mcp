import { describe, it, expect, vi, beforeEach } from "vitest";

import { runDebugBundle, type DebugBundleInput } from "../src/tools/debugBundle.js";

vi.mock("../src/utils/filesystem.js", () => ({
  ensureDirectory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const createMockLogger = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});

const createMockPage = () => ({
  bringToFront: vi.fn().mockResolvedValue(undefined),
  content: vi.fn().mockResolvedValue("<html></html>"),
  context: vi.fn().mockReturnValue({
    cookies: vi.fn().mockResolvedValue([]),
  }),
  evaluate: vi.fn().mockResolvedValue(""),
  getAttribute: vi.fn().mockResolvedValue(""),
  getByLabel: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(null),
      getAttribute: vi.fn().mockResolvedValue(""),
      isEnabled: vi.fn().mockResolvedValue(false),
      isHidden: vi.fn().mockResolvedValue(true),
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(""),
    }),
  }),
  getByRole: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(null),
      getAttribute: vi.fn().mockResolvedValue(""),
      isEnabled: vi.fn().mockResolvedValue(false),
      isHidden: vi.fn().mockResolvedValue(true),
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(""),
    }),
  }),
  getByTestId: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(null),
      getAttribute: vi.fn().mockResolvedValue(""),
      isEnabled: vi.fn().mockResolvedValue(false),
      isHidden: vi.fn().mockResolvedValue(true),
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(""),
    }),
  }),
  getByText: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(null),
      getAttribute: vi.fn().mockResolvedValue(""),
      isEnabled: vi.fn().mockResolvedValue(false),
      isHidden: vi.fn().mockResolvedValue(true),
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(""),
    }),
  }),
  goto: vi.fn().mockResolvedValue(undefined),
  locator: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(null),
      getAttribute: vi.fn().mockResolvedValue(""),
      isEnabled: vi.fn().mockResolvedValue(false),
      isHidden: vi.fn().mockResolvedValue(true),
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(""),
    }),
  }),
  on: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(undefined),
  setDefaultNavigationTimeout: vi.fn(),
  setDefaultTimeout: vi.fn(),
  url: vi.fn().mockReturnValue("https://firefly.adobe.com/generate/video"),
  viewportSize: vi.fn().mockReturnValue({ height: 1000, width: 1440 }),
});

const createMockBrowser = (page = createMockPage()) => ({
  clearBuffers: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  ensureListeners: vi.fn(),
  getContext: vi.fn().mockResolvedValue({
    browser: vi.fn().mockReturnValue({
      version: vi.fn().mockReturnValue("149.0.0.0"),
    }),
    cookies: vi.fn().mockResolvedValue([]),
    newPage: vi.fn().mockResolvedValue(page),
    pages: vi.fn().mockReturnValue([page]),
  }),
  getPage: vi.fn().mockResolvedValue(page),
  getConsoleMessages: vi.fn().mockReturnValue([]),
  getNetworkRequests: vi.fn().mockReturnValue([]),
  status: vi.fn().mockResolvedValue({
    downloadsDir: "debug/downloads",
    headless: false,
    isRunning: true,
    pages: 1,
    profileDir: "debug/profile",
  }),
});

const createMockConfig = () => ({
  dataDir: "debug",
  downloadsDir: "debug/downloads",
  generationTimeoutMs: 300000,
  headless: false,
  launchSlowMoMs: 0,
  logLevel: "info" as const,
  maxDownloads: 4,
  navigationTimeoutMs: 60000,
  operationTimeoutMs: 180000,
  profileDir: "debug/profile",
  selectors: {},
  urls: {
    base: "https://firefly.adobe.com",
    expand: "https://firefly.adobe.com/tools/generative-expand",
    removeBackground: "https://firefly.adobe.com/tools/remove-background",
    textToImage: "https://firefly.adobe.com/generate/images",
    variations: "https://firefly.adobe.com",
    video: "https://firefly.adobe.com/generate/video",
  },
  usePersistentProfile: false,
  userDataDir: undefined,
});

describe("debugBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns bundle directory and file list", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.bundleDir).toMatch(
      /debug[/\\]bundles[/\\]\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/,
    );
    expect(result.files).toBeInstanceOf(Array);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("collects page info", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("page.json");
  });

  it("collects browser status", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("browser.json");
  });

  it("collects DOM info", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("dom.json");
  });

  it("collects accessibility", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("accessibility.json");
  });

  it("collects performance metrics", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("performance.json");
  });

  it("collects console messages", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("console.json");
  });

  it("collects network requests", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("network.json");
  });

  it("collects cookies", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("cookies.json");
  });

  it("collects storage", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("storage.json");
  });

  it("collects framework detection", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("framework.json");
  });

  it("validates selectors", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("locators.json");
  });

  it("collects forms", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("forms.json");
  });

  it("collects dialogs", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("dialogs.json");
  });

  it("collects shadow DOM", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("shadow-dom.json");
  });

  it("collects iframes", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("iframes.json");
  });

  it("collects permissions", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("permissions.json");
  });

  it("collects fingerprint", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("fingerprint.json");
  });

  it("collects service workers", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("service-workers.json");
  });

  it("collects IndexedDB", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("indexeddb.json");
  });

  it("collects localStorage", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("localstorage.json");
  });

  it("collects sessionStorage", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("sessionstorage.json");
  });

  it("collects automation health", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("automation-health.json");
  });

  it("collects auth diagnostics", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("authentication.json");
  });

  it("generates selector report", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("selector-report.md");
  });

  it("generates automation health report", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("automation-health.md");
  });

  it("generates summary report", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("summary.md");
  });

  it("includes artifacts info", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    const result = await runDebugBundle(browser, config, logger, input);

    expect(result.files).toContain("artifacts.json");
  });

  it("handles errors gracefully", async () => {
    const browser = createMockBrowser();
    browser.getPage.mockRejectedValue(new Error("Browser not available"));
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    await expect(runDebugBundle(browser, config, logger, input)).rejects.toThrow(
      "Browser not available",
    );
  });

  it("logs start and completion", async () => {
    const browser = createMockBrowser();
    const config = createMockConfig();
    const logger = createMockLogger();
    const input: DebugBundleInput = {};

    await runDebugBundle(browser, config, logger, input);

    const startCall = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === "Starting debug bundle capture",
    );
    expect(startCall).toBeDefined();
    const startData = startCall![1] as Record<string, unknown>;
    expect(typeof startData.bundleDir).toBe("string");
    const completeCall = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === "Debug bundle complete",
    );
    expect(completeCall).toBeDefined();
    const completeData = completeCall![1] as Record<string, unknown>;
    expect(completeData.bundleDir).toEqual(expect.stringContaining("debug"));
    expect(typeof completeData.fileCount).toBe("number");
    expect(typeof completeData.warningCount).toBe("number");
  });
});
