import { chromium, type BrowserContext, type Page } from "playwright";

import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { ensureDirectory } from "./utils/filesystem.js";

export interface BrowserStatus {
  downloadsDir: string;
  headless: boolean;
  isRunning: boolean;
  pages: number;
  profileDir: string;
}

export class BrowserManager {
  private contextPromise: Promise<BrowserContext> | undefined;

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  public async getContext(): Promise<BrowserContext> {
    this.contextPromise ??= this.launch();
    return this.contextPromise;
  }

  public async getPage(url?: string): Promise<Page> {
    const context = await this.getContext();
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(this.config.operationTimeoutMs);
    page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

    if (url !== undefined && page.url() !== url) {
      await page.goto(url, {
        timeout: this.config.navigationTimeoutMs,
        waitUntil: "domcontentloaded",
      });
    }

    await page.bringToFront().catch(() => undefined);
    return page;
  }

  public async status(): Promise<BrowserStatus> {
    const context = await this.contextPromise?.catch(() => undefined);
    return {
      downloadsDir: this.config.downloadsDir,
      headless: this.config.headless,
      isRunning: context !== undefined,
      pages: context?.pages().length ?? 0,
      profileDir: this.config.profileDir,
    };
  }

  public async close(): Promise<void> {
    const context = await this.contextPromise?.catch(() => undefined);
    this.contextPromise = undefined;

    if (context !== undefined) {
      await context.close();
    }
  }

  private async launch(): Promise<BrowserContext> {
    await Promise.all([
      ensureDirectory(this.config.profileDir),
      ensureDirectory(this.config.downloadsDir),
    ]);

    this.logger.info("Launching persistent Chromium context", {
      headless: this.config.headless,
      profileDir: this.config.profileDir,
    });

    try {
      return await chromium.launchPersistentContext(this.config.profileDir, {
        acceptDownloads: true,
        downloadsPath: this.config.downloadsDir,
        headless: this.config.headless,
        slowMo: this.config.launchSlowMoMs,
        viewport: { height: 1000, width: 1440 },
      });
    } catch (error) {
      this.contextPromise = undefined;
      this.logger.error("Failed to launch Chromium", { error });
      throw new Error(
        [
          "Failed to launch Playwright Chromium.",
          "If another adobe-firefly-mcp process is open, close it first because persistent profiles cannot be shared.",
          error instanceof Error ? error.message : String(error),
        ].join(" "),
      );
    }
  }
}
