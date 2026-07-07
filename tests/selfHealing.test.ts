import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  SelfHealingEngine,
  DEFAULT_CONFIDENCE_WEIGHTS,
  DEFAULT_HEALING_CONFIG,
  type HealingConfig,
  type SelectorCandidate,
} from "../src/firefly/selfHealing.js";
import type { DiscoveredElement } from "../src/firefly/dom/selectorDiscovery.js";

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

const createMockDiscoveredElement = (
  overrides: Partial<DiscoveredElement> = {},
): DiscoveredElement => ({
  ariaDescribedby: "",
  ariaLabel: "",
  ariaLabelledby: "",
  boundingBox: null,
  classes: "",
  computedStyles: {
    display: "block",
    pointerEvents: "auto",
    visibility: "visible",
  },
  disabled: false,
  enabled: true,
  id: "",
  locators: [],
  name: "",
  outerHTML: "<button></button>",
  placeholder: "",
  readonly: false,
  role: "button",
  tag: "button",
  testid: "",
  text: "Generate",
  type: "",
  visible: true,
  ...overrides,
});

const createTestCandidate = (
  overrides: Partial<SelectorCandidate> = {},
): SelectorCandidate =>
  ({
    kind: "role",
    name: "test button",
    role: "button",
    text: "generate",
    ...overrides,
  }) as SelectorCandidate;

describe("SelfHealingEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates engine with default config", () => {
    const page = createMockPage();
    const config = createMockConfig();
    const engine = new SelfHealingEngine(page, config);

    expect(engine).toBeDefined();
  });

  it("creates engine with custom config", () => {
    const page = createMockPage();
    const config = createMockConfig();
    const healingConfig: Partial<HealingConfig> = {
      confidenceThreshold: 0.8,
      maxSearchDepth: 5,
    };
    const engine = new SelfHealingEngine(page, config, healingConfig);

    expect(engine).toBeDefined();
  });

  it("returns default confidence weights", () => {
    expect(DEFAULT_CONFIDENCE_WEIGHTS).toEqual({
      ariaLabel: 90,
      associatedLabel: 80,
      cssClass: 10,
      dataTestId: 100,
      hashedClass: 0,
      placeholder: 80,
      roleName: 85,
      tag: 40,
      uniqueText: 70,
    });
  });

  it("returns default healing config", () => {
    expect(DEFAULT_HEALING_CONFIG).toEqual({
      confidenceThreshold: 0.7,
      maxSearchDepth: 10,
      persistRecovery: true,
      weights: DEFAULT_CONFIDENCE_WEIGHTS,
    });
  });

  describe("scoreCandidates", () => {
    it("scores candidates based on discovered elements", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({ kind: "role", role: "button", text: "generate" }),
        createTestCandidate({ kind: "testId", testId: "generate-button" }),
      ];

      const elements = [
        createMockDiscoveredElement({
          role: "button",
          text: "Generate",
          testid: "generate-button",
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      expect(scores).toHaveLength(2);
      expect(scores[0].confidence).toBeGreaterThan(0);
      expect(scores[1].confidence).toBeGreaterThan(0);
    });

    it("returns zero confidence for no matching elements", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({ kind: "testId", testId: "nonexistent" }),
      ];

      const elements = [createMockDiscoveredElement({ testid: "other-button" })];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      expect(scores).toHaveLength(1);
      expect(scores[0].confidence).toBe(0);
    });

    it("prefers unique matches over multiple matches", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({ kind: "testId", testId: "unique-button" }),
        createTestCandidate({ kind: "testId", testId: "shared-button" }),
      ];

      const elements = [
        createMockDiscoveredElement({ testid: "unique-button" }),
        createMockDiscoveredElement({ testid: "shared-button" }),
        createMockDiscoveredElement({ testid: "shared-button" }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      // Both should have confidence > 0
      expect(scores[0].confidence).toBeGreaterThan(0);
      expect(scores[1].confidence).toBeGreaterThan(0);

      // Unique match should have "Unique match" in reasons
      expect(scores[0].reasons).toContain("Unique match");
      // Multiple matches should have "Multiple matches" in reasons
      expect(scores[1].reasons).toContain("Multiple matches: 2");
    });
  });

  describe("verifyAllSelectors", () => {
    it("returns verification results for all selectors", async () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const verifications = await engine.verifyAllSelectors();

      expect(verifications).toBeInstanceOf(Array);
      expect(verifications.length).toBeGreaterThan(0);

      for (const verification of verifications) {
        expect(verification).toHaveProperty("name");
        expect(verification).toHaveProperty("candidate");
        expect(verification).toHaveProperty("status");
        expect(verification).toHaveProperty("matchCount");
        expect(verification).toHaveProperty("confidence");
        expect(["valid", "missing", "multiple", "hidden", "disabled"]).toContain(
          verification.status,
        );
      }
    });
  });

  describe("generateReport", () => {
    it("generates a markdown report", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const report = engine.generateReport();

      expect(report).toContain("# Self-Healing Automation Report");
      expect(report).toContain("**Timestamp**:");
      expect(report).toContain("**Page URL**:");
      expect(report).toContain("## Selector Verification");
      expect(report).toContain("## Recovered Selectors");
      expect(report).toContain("## Warnings");
    });
  });

  describe("getReport", () => {
    it("returns the current report", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const report = engine.getReport();

      expect(report).toHaveProperty("timestamp");
      expect(report).toHaveProperty("pageUrl");
      expect(report).toHaveProperty("verifications");
      expect(report).toHaveProperty("recoveredSelectors");
      expect(report).toHaveProperty("warnings");
    });
  });

  describe("CSS selector matching", () => {
    it("matches data-testid selectors", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({
          kind: "css",
          selector: '[data-testid="generate-button"]',
        }),
      ];

      const elements = [createMockDiscoveredElement({ testid: "generate-button" })];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      expect(scores[0].confidence).toBeGreaterThan(0);
    });

    it("matches aria-label selectors", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({
          kind: "css",
          selector: '[aria-label="Generate"]',
        }),
      ];

      const elements = [createMockDiscoveredElement({ ariaLabel: "Generate" })];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      expect(scores[0].confidence).toBeGreaterThan(0);
    });

    it("matches role selectors", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates: SelectorCandidate[] = [
        createTestCandidate({
          kind: "css",
          selector: '[role="button"]',
        }),
      ];

      const elements = [createMockDiscoveredElement({ role: "button" })];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, elements);

      expect(scores[0].confidence).toBeGreaterThan(0);
    });
  });

  describe("confidence scoring", () => {
    it("gives high weight to data-testid matches", () => {
      expect(DEFAULT_CONFIDENCE_WEIGHTS.dataTestId).toBe(100);
    });

    it("gives high weight to aria-label matches", () => {
      expect(DEFAULT_CONFIDENCE_WEIGHTS.ariaLabel).toBe(90);
    });

    it("gives medium weight to role+name matches", () => {
      expect(DEFAULT_CONFIDENCE_WEIGHTS.roleName).toBe(85);
    });

    it("gives low weight to CSS class matches", () => {
      expect(DEFAULT_CONFIDENCE_WEIGHTS.cssClass).toBe(10);
    });

    it("gives zero weight to hashed class matches", () => {
      expect(DEFAULT_CONFIDENCE_WEIGHTS.hashedClass).toBe(0);
    });
  });

  describe("error handling", () => {
    it("handles empty candidates gracefully", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const scores = engine.scoreCandidates([], []);

      expect(scores).toHaveLength(0);
    });

    it("handles empty elements gracefully", () => {
      const page = createMockPage();
      const config = createMockConfig();
      const engine = new SelfHealingEngine(page, config);

      const candidates = [createTestCandidate({ kind: "testId", testId: "button" })];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const scores = engine.scoreCandidates(candidates, []);

      expect(scores).toHaveLength(1);
      expect(scores[0].confidence).toBe(0);
    });
  });
});
