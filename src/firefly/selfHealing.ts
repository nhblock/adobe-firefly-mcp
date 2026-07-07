import type { Locator, Page } from "playwright";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../config.js";
import { type SelectorCandidate, locatorFor, selectorGroups } from "./selectors.js";
import { discoverElements, type DiscoveredElement } from "./dom/selectorDiscovery.js";

export interface ConfidenceWeights {
  ariaLabel: number;
  associatedLabel: number;
  cssClass: number;
  dataTestId: number;
  hashedClass: number;
  placeholder: number;
  roleName: number;
  tag: number;
  uniqueText: number;
}

export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  ariaLabel: 90,
  associatedLabel: 80,
  cssClass: 10,
  dataTestId: 100,
  hashedClass: 0,
  placeholder: 80,
  roleName: 85,
  tag: 40,
  uniqueText: 70,
};

export interface HealingConfig {
  confidenceThreshold: number;
  maxSearchDepth: number;
  persistRecovery: boolean;
  weights: ConfidenceWeights;
}

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  confidenceThreshold: 0.7,
  maxSearchDepth: 10,
  persistRecovery: true,
  weights: DEFAULT_CONFIDENCE_WEIGHTS,
};

export interface CandidateScore {
  candidate: SelectorCandidate;
  confidence: number;
  elements: DiscoveredElement[];
  reasons: string[];
}

export interface HealingResult {
  success: boolean;
  originalCandidate?: SelectorCandidate;
  recoveredCandidate?: SelectorCandidate;
  recoveredLocator?: Locator;
  confidence: number;
  reasons: string[];
  timestamp: string;
  pageUrl: string;
}

export interface SelectorVerification {
  name: string;
  candidate: SelectorCandidate;
  status: "valid" | "missing" | "multiple" | "hidden" | "disabled";
  matchCount: number;
  confidence: number;
}

export interface HealingReport {
  timestamp: string;
  pageUrl: string;
  verifications: SelectorVerification[];
  recoveredSelectors: Array<{
    name: string;
    old: string;
    new: string;
    confidence: number;
  }>;
  warnings: string[];
}

export class SelfHealingEngine {
  private readonly config: HealingConfig;
  private readonly recoveredSelectors: Map<string, CandidateScore> = new Map();
  private readonly report: HealingReport;

  constructor(
    private readonly page: Page,
    private readonly appConfig: AppConfig,
    config: Partial<HealingConfig> = {},
  ) {
    this.config = { ...DEFAULT_HEALING_CONFIG, ...config };
    this.report = {
      timestamp: new Date().toISOString(),
      pageUrl: page.url(),
      recoveredSelectors: [],
      verifications: [],
      warnings: [],
    };
  }

  async resolveWithHealing(
    candidates: SelectorCandidate[],
    options: { timeout?: number; log?: (msg: string) => void } = {},
  ): Promise<HealingResult> {
    const { timeout = 12000, log = console.error } = options;
    const startTime = Date.now();

    // Step 1: Try primary selector (first candidate)
    const primaryCandidate = candidates[0];
    if (primaryCandidate) {
      try {
        const locator = locatorFor(this.page, primaryCandidate);
        await locator
          .first()
          .waitFor({ state: "visible", timeout: Math.min(timeout, 3000) });

        log(`[self-healing] primary selector succeeded: ${primaryCandidate.name}`);
        return {
          success: true,
          originalCandidate: primaryCandidate,
          recoveredCandidate: primaryCandidate,
          recoveredLocator: locator.first(),
          confidence: 1.0,
          reasons: ["Primary selector matched"],
          timestamp: new Date().toISOString(),
          pageUrl: this.page.url(),
        };
      } catch {
        log(`[self-healing] primary selector failed: ${primaryCandidate.name}`);
      }
    }

    // Step 2: Try remaining candidates
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!candidate) continue;
      try {
        const locator = locatorFor(this.page, candidate);
        await locator
          .first()
          .waitFor({ state: "visible", timeout: Math.min(timeout, 2000) });

        log(`[self-healing] fallback candidate succeeded: ${candidate.name}`);
        return {
          success: true,
          originalCandidate: primaryCandidate,
          recoveredCandidate: candidate,
          recoveredLocator: locator.first(),
          confidence: 0.9,
          reasons: [`Fallback candidate matched: ${candidate.name}`],
          timestamp: new Date().toISOString(),
          pageUrl: this.page.url(),
        };
      } catch {
        // Continue to next candidate
      }
    }

    // Step 3: Query DOM inspector for matching elements
    log("[self-healing] all candidates failed, querying DOM inspector");
    const discoveredElements = await discoverElements(this.page).catch(() => []);

    if (discoveredElements.length > 0) {
      const scoredCandidates = this.scoreCandidates(candidates, discoveredElements);

      // Sort by confidence
      scoredCandidates.sort((a, b) => b.confidence - a.confidence);

      // Find best candidate above threshold
      const bestCandidate = scoredCandidates.find(
        (c) => c.confidence >= this.config.confidenceThreshold,
      );

      if (bestCandidate) {
        log(
          `[self-healing] DOM recovery succeeded: ${bestCandidate.candidate.name} (confidence: ${bestCandidate.confidence.toFixed(2)})`,
        );

        const locator = locatorFor(this.page, bestCandidate.candidate);

        // Persist recovery if enabled
        if (this.config.persistRecovery) {
          await this.persistRecovery(
            candidates[0]?.name ?? "unknown",
            primaryCandidate,
            bestCandidate,
          );
        }

        return {
          success: true,
          originalCandidate: primaryCandidate,
          recoveredCandidate: bestCandidate.candidate,
          recoveredLocator: locator.first(),
          confidence: bestCandidate.confidence,
          reasons: bestCandidate.reasons,
          timestamp: new Date().toISOString(),
          pageUrl: this.page.url(),
        };
      }
    }

    // Step 4: No recovery possible
    const elapsed = Date.now() - startTime;
    log(`[self-healing] all recovery attempts failed after ${elapsed}ms`);

    return {
      success: false,
      originalCandidate: primaryCandidate,
      confidence: 0,
      reasons: ["All candidates and DOM recovery failed"],
      timestamp: new Date().toISOString(),
      pageUrl: this.page.url(),
    };
  }

  scoreCandidates(
    candidates: SelectorCandidate[],
    discoveredElements: DiscoveredElement[],
  ): CandidateScore[] {
    return candidates.map((candidate) => {
      const matchingElements = this.findMatchingElements(candidate, discoveredElements);

      if (matchingElements.length === 0) {
        return {
          candidate,
          confidence: 0,
          elements: [],
          reasons: ["No matching elements found"],
        };
      }

      let totalScore = 0;
      const reasons: string[] = [];

      for (const element of matchingElements) {
        const score = this.scoreElement(candidate, element);
        totalScore += score.score;
        reasons.push(...score.reasons);
      }

      // Normalize confidence to 0-1 range
      const confidence = Math.min(totalScore / (matchingElements.length * 100), 1.0);

      // Bonus for uniqueness
      if (matchingElements.length === 1) {
        reasons.push("Unique match");
      }

      // Penalty for multiple matches
      if (matchingElements.length > 1) {
        reasons.push(`Multiple matches: ${matchingElements.length}`);
      }

      return {
        candidate,
        confidence,
        elements: matchingElements,
        reasons,
      };
    });
  }

  private findMatchingElements(
    candidate: SelectorCandidate,
    discoveredElements: DiscoveredElement[],
  ): DiscoveredElement[] {
    return discoveredElements.filter((element) => {
      switch (candidate.kind) {
        case "testId":
          return element.testid === candidate.testId;
        case "role":
          return element.role === candidate.role;
        case "label":
          return (
            element.ariaLabel
              .toLowerCase()
              .includes((candidate.text as string).toLowerCase()) ||
            element.text
              .toLowerCase()
              .includes((candidate.text as string).toLowerCase())
          );
        case "placeholder":
          return element.placeholder
            .toLowerCase()
            .includes((candidate.text as string).toLowerCase());
        case "text":
          return element.text
            .toLowerCase()
            .includes((candidate.text as string).toLowerCase());
        case "css":
          return this.matchesCssSelector(element, candidate.selector);
        default:
          return false;
      }
    });
  }

  private matchesCssSelector(element: DiscoveredElement, selector: string): boolean {
    // Simple CSS selector matching
    const lowerSelector = selector.toLowerCase();

    // Check data-testid
    if (lowerSelector.includes("data-testid")) {
      const match = lowerSelector.match(/data-testid[~|^$*]?="([^"]+)"/);
      if (match?.[1]) {
        return element.testid.includes(match[1]);
      }
    }

    // Check aria-label
    if (lowerSelector.includes("aria-label")) {
      const match = lowerSelector.match(/aria-label[~|^$*]?="([^"]+)"/);
      if (match?.[1]) {
        return element.ariaLabel.toLowerCase().includes(match[1].toLowerCase());
      }
    }

    // Check tag
    if (lowerSelector.startsWith("button") || lowerSelector.includes("button")) {
      return element.tag === "button";
    }
    if (lowerSelector.startsWith("input") || lowerSelector.includes("input")) {
      return element.tag === "input";
    }
    if (lowerSelector.startsWith("textarea") || lowerSelector.includes("textarea")) {
      return element.tag === "textarea";
    }

    // Check role
    if (lowerSelector.includes("[role=")) {
      const match = lowerSelector.match(/\[role="([^"]+)"\]/);
      if (match?.[1]) {
        return element.role === match[1];
      }
    }

    // Check text content
    if (lowerSelector.includes(":has-text(")) {
      const match = lowerSelector.match(/:has-text\("([^"]+)"\)/);
      if (match?.[1]) {
        return element.text.toLowerCase().includes(match[1].toLowerCase());
      }
    }

    return false;
  }

  private scoreElement(
    candidate: SelectorCandidate,
    element: DiscoveredElement,
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const weights = this.config.weights;

    // Score based on candidate type
    switch (candidate.kind) {
      case "testId":
        if (element.testid === candidate.testId) {
          score += weights.dataTestId;
          reasons.push(`data-testid match: ${weights.dataTestId}`);
        }
        break;

      case "role":
        if (element.role === candidate.role) {
          score += weights.roleName;
          reasons.push(`role match: ${weights.roleName}`);
        }
        if (
          element.text.toLowerCase().includes((candidate.text as string).toLowerCase())
        ) {
          score += weights.uniqueText;
          reasons.push(`text match: ${weights.uniqueText}`);
        }
        break;

      case "label":
        if (
          element.ariaLabel
            .toLowerCase()
            .includes((candidate.text as string).toLowerCase())
        ) {
          score += weights.ariaLabel;
          reasons.push(`aria-label match: ${weights.ariaLabel}`);
        }
        if (
          element.text.toLowerCase().includes((candidate.text as string).toLowerCase())
        ) {
          score += weights.uniqueText;
          reasons.push(`text match: ${weights.uniqueText}`);
        }
        break;

      case "placeholder":
        if (
          element.placeholder
            .toLowerCase()
            .includes((candidate.text as string).toLowerCase())
        ) {
          score += weights.placeholder;
          reasons.push(`placeholder match: ${weights.placeholder}`);
        }
        break;

      case "text":
        if (
          element.text.toLowerCase().includes((candidate.text as string).toLowerCase())
        ) {
          score += weights.uniqueText;
          reasons.push(`text match: ${weights.uniqueText}`);
        }
        break;

      case "css":
        if (this.matchesCssSelector(element, candidate.selector)) {
          score += weights.cssClass;
          reasons.push(`CSS match: ${weights.cssClass}`);
        }
        break;
    }

    // Bonus for visibility
    if (element.visible) {
      score += 10;
      reasons.push("visible");
    }

    // Bonus for enabled state
    if (element.enabled) {
      score += 5;
      reasons.push("enabled");
    }

    // Bonus for tag match
    if (
      (candidate.kind === "role" && element.tag === "button") ||
      (candidate.kind === "role" && element.tag === "a")
    ) {
      score += weights.tag;
      reasons.push(`tag match: ${weights.tag}`);
    }

    return { score, reasons };
  }

  private async persistRecovery(
    selectorName: string,
    original: SelectorCandidate | undefined,
    recovered: CandidateScore,
  ): Promise<void> {
    try {
      const debugDir = path.join(this.appConfig.dataDir, "debug");
      await mkdir(debugDir, { recursive: true });

      const filePath = path.join(debugDir, "recovered-selectors.json");

      // Read existing file
      let existing: Record<string, unknown> = {};
      try {
        const content = await readFile(filePath, "utf-8");
        existing = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // File doesn't exist or is invalid
      }

      // Add new recovery
      existing[selectorName] = {
        old: original?.name ?? "unknown",
        new: recovered.candidate.name,
        confidence: recovered.confidence,
        timestamp: new Date().toISOString(),
        page: this.page.url(),
        reasons: recovered.reasons,
      };

      await writeFile(filePath, JSON.stringify(existing, null, 2));

      // Update report
      this.report.recoveredSelectors.push({
        name: selectorName,
        old: original?.name ?? "unknown",
        new: recovered.candidate.name,
        confidence: recovered.confidence,
      });
    } catch (error) {
      console.error("[self-healing] failed to persist recovery:", error);
    }
  }

  async verifyAllSelectors(url?: string): Promise<SelectorVerification[]> {
    if (url && this.page.url() !== url) {
      await this.page.goto(url, {
        timeout: this.appConfig.navigationTimeoutMs,
        waitUntil: "domcontentloaded",
      });
    }

    const groups = selectorGroups(this.appConfig);
    const verifications: SelectorVerification[] = [];

    for (const [groupName, candidates] of Object.entries(groups)) {
      const candidateList = candidates as SelectorCandidate[];
      for (const candidate of candidateList) {
        const verification = await this.verifySelector(
          `${groupName}.${candidate.name}`,
          candidate,
        );
        verifications.push(verification);
      }
    }

    this.report.verifications = verifications;
    return verifications;
  }

  private async verifySelector(
    name: string,
    candidate: SelectorCandidate,
  ): Promise<SelectorVerification> {
    try {
      const locator = locatorFor(this.page, candidate);
      const count = await locator.count().catch(() => 0);

      if (count === 0) {
        return {
          name,
          candidate,
          status: "missing",
          matchCount: 0,
          confidence: 0,
        };
      }

      if (count > 1) {
        return {
          name,
          candidate,
          status: "multiple",
          matchCount: count,
          confidence: 0.5,
        };
      }

      // Check visibility
      const isVisible = await locator
        .first()
        .isVisible()
        .catch(() => false);
      if (!isVisible) {
        return {
          name,
          candidate,
          status: "hidden",
          matchCount: count,
          confidence: 0.3,
        };
      }

      // Check enabled state
      const isEnabled = await locator
        .first()
        .isEnabled()
        .catch(() => false);
      if (!isEnabled) {
        return {
          name,
          candidate,
          status: "disabled",
          matchCount: count,
          confidence: 0.4,
        };
      }

      return {
        name,
        candidate,
        status: "valid",
        matchCount: count,
        confidence: 1.0,
      };
    } catch {
      return {
        name,
        candidate,
        status: "missing",
        matchCount: 0,
        confidence: 0,
      };
    }
  }

  generateReport(): string {
    const lines: string[] = [
      "# Self-Healing Automation Report",
      "",
      `**Timestamp**: ${this.report.timestamp}`,
      `**Page URL**: ${this.report.pageUrl}`,
      "",
      "## Selector Verification",
      "",
      "| Status | Count |",
      "|--------|-------|",
      `| ✅ Valid | ${this.report.verifications.filter((v) => v.status === "valid").length} |`,
      `| ❌ Missing | ${this.report.verifications.filter((v) => v.status === "missing").length} |`,
      `| ⚠️ Multiple | ${this.report.verifications.filter((v) => v.status === "multiple").length} |`,
      `| 👁️ Hidden | ${this.report.verifications.filter((v) => v.status === "hidden").length} |`,
      `| 🔒 Disabled | ${this.report.verifications.filter((v) => v.status === "disabled").length} |`,
      "",
      "## Recovered Selectors",
      "",
    ];

    if (this.report.recoveredSelectors.length === 0) {
      lines.push("No selectors needed recovery.");
    } else {
      lines.push("| Selector | Old | New | Confidence |");
      lines.push("|----------|-----|-----|------------|");
      for (const recovery of this.report.recoveredSelectors) {
        lines.push(
          `| ${recovery.name} | ${recovery.old} | ${recovery.new} | ${(recovery.confidence * 100).toFixed(1)}% |`,
        );
      }
    }

    lines.push("");
    lines.push("## Warnings", "");

    if (this.report.warnings.length === 0) {
      lines.push("No warnings.");
    } else {
      for (const warning of this.report.warnings) {
        lines.push(`- ${warning}`);
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("*Report generated by self-healing automation*");

    return lines.join("\n");
  }

  getReport(): HealingReport {
    return { ...this.report };
  }
}

export function createSelfHealingEngine(
  page: Page,
  config: AppConfig,
  healingConfig: Partial<HealingConfig> = {},
): SelfHealingEngine {
  return new SelfHealingEngine(page, config, healingConfig);
}
