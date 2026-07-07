import {
  chromium,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "playwright";

import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { ensureDirectory } from "./utils/filesystem.js";
import { RingBuffer } from "./utils/ringBuffer.js";

export interface BrowserStatus {
  downloadsDir: string;
  headless: boolean;
  isRunning: boolean;
  pages: number;
  profileDir: string;
}

export interface ConsoleEntry {
  text: string;
  timestamp: string;
  type: string;
}

export interface NetworkEntry {
  duration?: number;
  method: string;
  resourceType: string;
  startTime: number;
  status?: number;
  url: string;
}

const BUFFER_CAPACITY = 500;

export class BrowserManager {
  private contextPromise: Promise<BrowserContext> | undefined;
  private readonly consoleBuffer = new RingBuffer<ConsoleEntry>(BUFFER_CAPACITY);
  private readonly networkBuffer = new RingBuffer<NetworkEntry>(BUFFER_CAPACITY);
  private readonly requestTimes = new Map<string, number>();
  private readonly listenersInstalled = new WeakSet<Page>();

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
    this.ensureListeners(page);
    return page;
  }

  public ensureListeners(page: Page): void {
    if (this.listenersInstalled.has(page)) {
      return;
    }

    page.on("console", (msg) => {
      this.consoleBuffer.add({
        text: msg.text(),
        timestamp: new Date().toISOString(),
        type: msg.type(),
      });
    });

    page.on("request", (req: Request) => {
      const key = req.url();
      this.requestTimes.set(key, Date.now());
    });

    page.on("response", (res: Response) => {
      const req = res.request();
      const key = req.url();
      const startTime = this.requestTimes.get(key) ?? Date.now();
      this.requestTimes.delete(key);

      this.networkBuffer.add({
        duration: Date.now() - startTime,
        method: req.method(),
        resourceType: req.resourceType(),
        startTime,
        status: res.status(),
        url: key,
      });
    });

    page.on("requestfailed", (req: Request) => {
      const key = req.url();
      const startTime = this.requestTimes.get(key) ?? Date.now();
      this.requestTimes.delete(key);

      this.networkBuffer.add({
        duration: Date.now() - startTime,
        method: req.method(),
        resourceType: req.resourceType(),
        startTime,
        status: 0,
        url: key,
      });
    });

    this.listenersInstalled.add(page);
    this.logger.debug("Installed capture listeners on page", {
      url: page.url(),
    });
  }

  public getConsoleMessages(limit?: number): ConsoleEntry[] {
    return this.consoleBuffer.toArray(limit);
  }

  public getNetworkRequests(limit?: number): NetworkEntry[] {
    return this.networkBuffer.toArray(limit);
  }

  public clearBuffers(): void {
    this.consoleBuffer.clear();
    this.networkBuffer.clear();
    this.requestTimes.clear();
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

    const useRealChrome = this.config.usePersistentProfile && this.config.userDataDir;

    this.logger.info("Launching persistent Chromium context", {
      headless: this.config.headless,
      profileDir: useRealChrome ? this.config.userDataDir : this.config.profileDir,
      useRealChrome,
    });

    try {
      if (useRealChrome && this.config.userDataDir) {
        // Launch using real Chrome with user's existing profile
        return await chromium.launchPersistentContext(this.config.userDataDir, {
          channel: "chrome",
          acceptDownloads: true,
          downloadsPath: this.config.downloadsDir,
          headless: false, // Force headed mode for real Chrome
          slowMo: this.config.launchSlowMoMs,
          viewport: { height: 1000, width: 1440 },
        });
      }

      // Default: Launch using bundled Chromium
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
