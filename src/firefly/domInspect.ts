import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";

import {
  type AccessibilitySnapshot,
  collectAccessibility,
} from "./dom/accessibility.js";
import {
  type ArtifactPaths,
  saveAnnotatedScreenshot,
  saveElementHtml,
  saveElementScreenshot,
  saveHtml,
  saveScreenshot,
} from "./dom/artifacts.js";
import { type DialogInfo, detectDialogs } from "./dom/dialogs.js";
import { type FormInfo, inspectForms } from "./dom/forms.js";
import { type IframeInfo, inspectIframes } from "./dom/iframes.js";
import { type PageInfo, collectPageInfo } from "./dom/pageInfo.js";
import { type PerformanceMetrics, collectPerformance } from "./dom/performance.js";
import { type DiscoveredElement, discoverElements } from "./dom/selectorDiscovery.js";
import { type ShadowRootInfo, traverseShadowDom } from "./dom/shadowDom.js";
import { type TreeNode, buildDomTree } from "./dom/tree.js";

export type InspectionMode = "accessibility" | "full" | "selector" | "shadow" | "tree";

export interface DomInspectInput {
  captureElementScreenshots?: boolean;
  includeAccessibility?: boolean;
  includeAnnotatedScreenshot?: boolean;
  includeConsole?: boolean;
  includeHtml?: boolean;
  includeNetwork?: boolean;
  includeScreenshot?: boolean;
  maxConsoleMessages?: number;
  maxDepth?: number;
  maxNetworkRequests?: number;
  mode: InspectionMode;
  selector?: string;
}

export interface DomInspectResult {
  accessibility?: AccessibilitySnapshot | null;
  artifacts: ArtifactPaths;
  console?: Array<{ text: string; timestamp: string; type: string }>;
  dialogs?: DialogInfo[];
  forms?: FormInfo[];
  iframes?: IframeInfo[];
  network?: Array<{
    duration?: number;
    method: string;
    resourceType: string;
    status?: number;
    url: string;
  }>;
  ok: boolean;
  pageInfo: PageInfo;
  performance?: PerformanceMetrics;
  selectors?: DiscoveredElement[];
  shadowDom?: ShadowRootInfo[];
  tree?: TreeNode;
  warnings: string[];
}

export async function runDomInspect(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  input: DomInspectInput,
): Promise<DomInspectResult> {
  const warnings: string[] = [];
  const artifacts: ArtifactPaths = {};

  const page = await browser.getPage();
  const context = await browser.getContext();
  browser.ensureListeners(page);

  const pageInfo = await collectPageInfo(page, context);

  if (
    input.mode === "selector" &&
    (input.selector === undefined || input.selector.length === 0)
  ) {
    warnings.push(
      "Selector mode requires a selector parameter. Falling back to full mode.",
    );
    input.mode = "full";
  }

  let selectors: DiscoveredElement[] | undefined;
  let shadowDom: ShadowRootInfo[] | undefined;
  let tree: TreeNode | undefined;
  let accessibility: AccessibilitySnapshot | null | undefined;
  let iframes: IframeInfo[] | undefined;
  let dialogs: DialogInfo[] | undefined;
  let forms: FormInfo[] | undefined;
  let performance: PerformanceMetrics | undefined;

  if (input.mode === "full" || input.mode === "selector") {
    try {
      selectors = await discoverElements(page);
    } catch (error) {
      warnings.push(
        `Selector discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.mode === "full" || input.mode === "shadow") {
    try {
      shadowDom = await traverseShadowDom(page, input.maxDepth ?? 8);
    } catch (error) {
      warnings.push(
        `Shadow DOM traversal failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.mode === "full" || input.mode === "tree") {
    try {
      tree = await buildDomTree(page, input.maxDepth ?? 10);
    } catch (error) {
      warnings.push(
        `DOM tree building failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.mode === "full" || input.mode === "accessibility") {
    if (input.includeAccessibility !== false) {
      try {
        accessibility = await collectAccessibility(page);
      } catch (error) {
        warnings.push(
          `Accessibility snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (input.mode === "full") {
    try {
      iframes = await inspectIframes(page);
    } catch (error) {
      warnings.push(
        `Iframe inspection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      dialogs = await detectDialogs(page);
    } catch (error) {
      warnings.push(
        `Dialog detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      forms = await inspectForms(page);
    } catch (error) {
      warnings.push(
        `Form inspection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      performance = await collectPerformance(page);
    } catch (error) {
      warnings.push(
        `Performance metrics failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.includeConsole !== false) {
    try {
      // Console messages are from BrowserManager buffers
    } catch (error) {
      warnings.push(
        `Console capture failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.includeScreenshot !== false) {
    try {
      artifacts.screenshotPath = await saveScreenshot(page, config, "dom-inspect");
    } catch (error) {
      warnings.push(
        `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.includeAnnotatedScreenshot !== false && selectors !== undefined) {
    try {
      const elements = selectors
        .filter((el) => el.boundingBox !== null)
        .map((el, i) => ({
          label: `${i + 1}`,
          x: el.boundingBox!.x,
          y: el.boundingBox!.y,
        }));
      artifacts.annotatedScreenshotPath = await saveAnnotatedScreenshot(
        page,
        config,
        elements,
      );
    } catch (error) {
      warnings.push(
        `Annotated screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.includeHtml !== false) {
    try {
      artifacts.htmlPath = await saveHtml(page, config);
    } catch (error) {
      warnings.push(
        `HTML save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.mode === "selector" && input.selector !== undefined) {
    try {
      artifacts.elementHtmlPath = await saveElementHtml(page, config, input.selector);
    } catch (error) {
      warnings.push(
        `Element HTML save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (input.captureElementScreenshots === true && selectors !== undefined) {
    const elementPaths: string[] = [];
    for (let i = 0; i < selectors.length && i < 20; i++) {
      const el = selectors[i];
      if (el === undefined) {
        continue;
      }
      const selector = el.testid
        ? `[data-testid="${el.testid}"]`
        : el.id !== ""
          ? `#${el.id}`
          : `${el.tag}[role="${el.role}"]`;

      const filename = `${el.tag}_${String(i + 1).padStart(3, "0")}${el.testid ? `_${el.testid}` : ""}`;
      const screenshotPath = await saveElementScreenshot(
        page,
        config,
        selector,
        filename,
      );
      if (screenshotPath !== undefined) {
        elementPaths.push(screenshotPath);
      }
    }
    if (elementPaths.length > 0) {
      artifacts.elementScreenshotPaths = elementPaths;
    }
  }

  const consoleMessages =
    input.includeConsole !== false
      ? browser.getConsoleMessages(input.maxConsoleMessages ?? 200)
      : undefined;

  const networkRequests =
    input.includeNetwork !== false
      ? browser.getNetworkRequests(input.maxNetworkRequests ?? 200)
      : undefined;

  return {
    accessibility,
    artifacts,
    console: consoleMessages,
    dialogs,
    forms,
    iframes,
    network: networkRequests,
    ok: true,
    pageInfo,
    performance,
    selectors,
    shadowDom,
    tree,
    warnings,
  };
}
