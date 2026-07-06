import path from "node:path";

import type { Locator, Page } from "playwright";

import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { assertReadableImage } from "../utils/image.js";
import {
  ensureDirectory,
  resolveUserPath,
  timestampedBasename,
} from "../utils/filesystem.js";
import { downloadGeneratedImages, type DownloadedImage } from "./download.js";
import { composePrompt, escapeRegExp, shortPromptLabel } from "./prompts.js";
import { selectorGroups } from "./selectors.js";
import {
  FireflyAutomationError,
  collectVisibleImageFingerprints,
  dismissKnownDialogs,
  ensurePromptReady,
  fillFirstVisible,
  waitForFirstVisible,
  waitForNewImages,
} from "./wait.js";

export interface TextToImageInput {
  aspectRatio?: string;
  contentClass?: string;
  count: number;
  negativePrompt?: string;
  outputDir?: string;
  prompt: string;
  style?: string;
}

export interface ImageWorkflowInput {
  aspectRatio?: string;
  count: number;
  imagePath: string;
  outputDir?: string;
  prompt?: string;
}

export interface FireflyRunResult {
  diagnostics: {
    generateClickScreenshots: GenerateClickScreenshots;
  };
  durationMs: number;
  files: DownloadedImage[];
  operation: string;
  pageUrl: string;
  profileDir: string;
  warnings: string[];
}

interface GenerateClickScreenshots {
  afterClick?: string;
  beforeClick?: string;
  failedClick?: string;
}

interface GenerateButtonState {
  boundingBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  editable: boolean | string;
  enabled: boolean | string;
  visible: boolean | string;
}

export async function runTextToImage(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  input: TextToImageInput,
): Promise<FireflyRunResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const page = await openFireflyPage(browser, config.urls.textToImage, config);

  await ensurePromptReady(page, config);
  await dismissKnownDialogs(page, config);

  const groups = selectorGroups(config);
  const prompt = composePrompt(input);
  const promptField = await fillFirstVisible(
    page,
    groups.promptInputs,
    prompt,
    config.operationTimeoutMs,
  );

  if (promptField === undefined) {
    throw new FireflyAutomationError(
      "Could not fill the Firefly prompt input. Set FIREFLY_SELECTOR_PROMPT_INPUT if the UI changed.",
    );
  }
  logger.info("Prompt filled", { selector: promptField.candidate.name });

  warnings.push(...(await applyOptionalControls(page, input)));

  const before = await collectVisibleImageFingerprints(page);
  const generateClickScreenshots = await clickGenerate(page, config, logger);
  await waitForNewImages(page, before, config.generationTimeoutMs);

  const outputDir = resolveOutputDir(config, input.outputDir);
  const basename = timestampedBasename(`firefly-${shortPromptLabel(input.prompt)}`);
  const files = await downloadGeneratedImages(page, config, logger, {
    basename,
    beforeFingerprints: before,
    maxFiles: input.count,
    outputDir,
  });

  if (files.length === 0) {
    throw new FireflyAutomationError(
      "Firefly generated images, but no downloadable images could be saved. Try setting FIREFLY_SELECTOR_DOWNLOAD_BUTTON.",
    );
  }

  return {
    diagnostics: {
      generateClickScreenshots,
    },
    durationMs: Date.now() - startedAt,
    files,
    operation: "firefly_generate",
    pageUrl: page.url(),
    profileDir: config.profileDir,
    warnings,
  };
}

export async function runImageWorkflow(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  operation: "firefly_expand" | "firefly_remove_background" | "firefly_variations",
  url: string,
  input: ImageWorkflowInput,
): Promise<FireflyRunResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const imagePath = await assertReadableImage(resolveUserPath(input.imagePath));
  const page = await openFireflyPage(browser, url, config);

  await dismissKnownDialogs(page, config);
  await uploadImage(page, config, imagePath);

  if (input.prompt !== undefined && input.prompt.trim().length > 0) {
    const groups = selectorGroups(config);
    const filled = await fillFirstVisible(
      page,
      groups.promptInputs,
      input.prompt.trim(),
      5_000,
    );

    if (filled === undefined) {
      warnings.push("Prompt was provided, but no optional prompt input was found.");
    } else {
      logger.info("Prompt filled", { selector: filled.candidate.name });
    }
  }

  warnings.push(...(await applyOptionalControls(page, input)));

  const before = await collectVisibleImageFingerprints(page);
  const generateClickScreenshots = await clickGenerate(page, config, logger);
  await waitForNewImages(page, before, config.generationTimeoutMs);

  const outputDir = resolveOutputDir(config, input.outputDir);
  const basename = timestampedBasename(
    `${operation.replace(/^firefly_/u, "firefly-")}-${path.basename(imagePath, path.extname(imagePath))}`,
  );
  const files = await downloadGeneratedImages(page, config, logger, {
    basename,
    beforeFingerprints: before,
    maxFiles: input.count,
    outputDir,
  });

  if (files.length === 0) {
    throw new FireflyAutomationError(
      "Firefly completed the workflow, but no downloadable images could be saved.",
    );
  }

  return {
    diagnostics: {
      generateClickScreenshots,
    },
    durationMs: Date.now() - startedAt,
    files,
    operation,
    pageUrl: page.url(),
    profileDir: config.profileDir,
    warnings,
  };
}

async function openFireflyPage(
  browser: BrowserManager,
  url: string,
  config: AppConfig,
): Promise<Page> {
  const page = await browser.getPage(url);
  await page.waitForLoadState("domcontentloaded", {
    timeout: config.navigationTimeoutMs,
  });
  return page;
}

async function clickGenerate(
  page: Page,
  config: AppConfig,
  logger: Logger,
): Promise<GenerateClickScreenshots> {
  const groups = selectorGroups(config);
  logger.info("Waiting for Generate button");
  const button = await waitForFirstVisible(
    page,
    groups.generateButtons,
    config.operationTimeoutMs,
  );

  if (button === undefined) {
    throw new FireflyAutomationError(
      "Could not find Firefly's generate/action button. Set FIREFLY_SELECTOR_GENERATE_BUTTON if the UI changed.",
    );
  }

  logger.info("Generate button found", { selector: button.candidate.name });

  const state = await getGenerateButtonState(button.locator);
  if (state.enabled !== true) {
    logger.warn("Generate button attached but not enabled", { state });
  } else {
    logger.debug("Generate button state", { state });
  }

  const beforeClick = await saveGenerateClickScreenshot(page, config, logger, "before");

  logger.info("Clicking Generate", { state });
  try {
    await button.locator.click({ timeout: config.operationTimeoutMs });
  } catch (error) {
    logger.error("Generate click failed", { error, state });
    const failedClick = await saveGenerateClickScreenshot(
      page,
      config,
      logger,
      "failed",
    );
    throw new FireflyAutomationError(
      [
        "Failed to click the Firefly Generate button.",
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        beforeClick !== undefined
          ? `Before-click screenshot: ${beforeClick}`
          : undefined,
        failedClick !== undefined
          ? `Failed-click screenshot: ${failedClick}`
          : undefined,
      ]
        .filter((part): part is string => part !== undefined)
        .join(" "),
    );
  }

  logger.info("Generate clicked");
  const afterClick = await saveGenerateClickScreenshot(page, config, logger, "after");
  return { afterClick, beforeClick };
}

async function getGenerateButtonState(locator: Locator): Promise<GenerateButtonState> {
  const [visible, enabled, editable, boundingBox] = await Promise.all([
    locator.isVisible({ timeout: 500 }).catch((error: unknown) => stateError(error)),
    locator.isEnabled({ timeout: 500 }).catch((error: unknown) => stateError(error)),
    locator.isEditable({ timeout: 500 }).catch((error: unknown) => stateError(error)),
    locator.boundingBox({ timeout: 500 }).catch(() => null),
  ]);

  return { boundingBox, editable, enabled, visible };
}

async function saveGenerateClickScreenshot(
  page: Page,
  config: AppConfig,
  logger: Logger,
  phase: "after" | "before" | "failed",
): Promise<string | undefined> {
  await ensureDirectory(config.downloadsDir);
  const screenshotPath = path.join(
    config.downloadsDir,
    `${timestampedBasename(`firefly-generate-click-${phase}`)}.png`,
  );

  try {
    await page.screenshot({ fullPage: false, path: screenshotPath });
    logger.info(`Saved ${phase} Generate click screenshot`, { screenshotPath });
    return screenshotPath;
  } catch (error) {
    logger.error(`Failed to save ${phase} Generate click screenshot`, { error });
    return undefined;
  }
}

function stateError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

async function uploadImage(
  page: Page,
  config: AppConfig,
  imagePath: string,
): Promise<void> {
  const directInput = page.locator('input[type="file"]').first();
  const directInputCount = await directInput.count().catch(() => 0);

  if (directInputCount > 0) {
    await directInput.setInputFiles(imagePath);
    await page.waitForTimeout(1_000);
    return;
  }

  const groups = selectorGroups(config);
  const uploadButton = await waitForFirstVisible(
    page,
    groups.uploadButtons,
    config.operationTimeoutMs,
  );

  if (uploadButton === undefined) {
    throw new FireflyAutomationError(
      "Could not find an upload control. Set FIREFLY_SELECTOR_UPLOAD_BUTTON if the UI changed.",
    );
  }

  const fileChooserPromise = page.waitForEvent("filechooser", {
    timeout: config.operationTimeoutMs,
  });
  await uploadButton.locator.click({ timeout: config.operationTimeoutMs });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(imagePath);
  await page.waitForTimeout(1_000);
}

async function applyOptionalControls(
  page: Page,
  input: {
    aspectRatio?: string;
    contentClass?: string;
    style?: string;
  },
): Promise<string[]> {
  const warnings: string[] = [];

  for (const [label, value] of [
    ["aspect ratio", input.aspectRatio],
    ["style", input.style],
    ["content class", input.contentClass],
  ] as const) {
    if (value === undefined || value.trim().length === 0) {
      continue;
    }

    const clicked = await clickTextOption(page, value);
    if (!clicked) {
      warnings.push(
        `Requested ${label} "${value}", but no matching visible Firefly control was found.`,
      );
    }
  }

  return warnings;
}

async function clickTextOption(page: Page, value: string): Promise<boolean> {
  const pattern = new RegExp(escapeRegExp(value.trim()), "iu");
  const candidates = [
    page.getByRole("button", { name: pattern }).first(),
    page.getByRole("option", { name: pattern }).first(),
    page.getByText(pattern).first(),
  ];

  for (const locator of candidates) {
    const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
    if (!visible) {
      continue;
    }

    await locator.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  }

  return false;
}

function resolveOutputDir(config: AppConfig, outputDir: string | undefined): string {
  return outputDir === undefined
    ? config.downloadsDir
    : path.resolve(
        path.isAbsolute(outputDir) ? outputDir : path.join(config.dataDir, outputDir),
      );
}
