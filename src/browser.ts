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
  contextLaunches: number;
  downloadsDir: string;
  headless: boolean;
  isRunning: boolean;
  livePageId?: number;
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
  private contextLaunches = 0;
  private readonly consoleBuffer = new RingBuffer<ConsoleEntry>(BUFFER_CAPACITY);
  private livePage: Page | undefined;
  private readonly pageIds = new WeakMap<Page, number>();
  private nextPageId = 1;
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
    const page =
      (this.livePage !== undefined && !this.livePage.isClosed()
        ? this.livePage
        : context.pages().find((candidate) => !candidate.isClosed())) ??
      (await context.newPage());
    this.livePage = page;
    if (!this.pageIds.has(page)) {
      this.pageIds.set(page, this.nextPageId++);
    }
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

  /**
   * Returns the current page without launching a browser, creating a context,
   * or navigating. Runtime diagnostics should prefer this when a session is
   * already active.
   */
  public async getLivePage(): Promise<Page | undefined> {
    const context = await this.contextPromise?.catch(() => undefined);
    if (context === undefined) return undefined;

    if (this.livePage !== undefined && !this.livePage.isClosed()) {
      return this.livePage;
    }

    const page = context.pages().find((candidate) => !candidate.isClosed());
    if (page !== undefined) {
      this.livePage = page;
      if (!this.pageIds.has(page)) {
        this.pageIds.set(page, this.nextPageId++);
      }
    }
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
    const page = await this.getLivePage();
    return {
      contextLaunches: this.contextLaunches,
      downloadsDir: this.config.downloadsDir,
      headless: this.config.headless,
      isRunning: context !== undefined,
      livePageId: page === undefined ? undefined : this.pageIds.get(page),
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
    this.livePage = undefined;
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
        const context = await chromium.launchPersistentContext(
          this.config.userDataDir,
          {
            channel: "chrome",
            acceptDownloads: true,
            downloadsPath: this.config.downloadsDir,
            headless: false, // Force headed mode for real Chrome
            slowMo: this.config.launchSlowMoMs,
            viewport: { height: 1000, width: 1440 },
          },
        );
        this.contextLaunches += 1;
        return context;
      }

      // Default: Launch using bundled Chromium
      const context = await chromium.launchPersistentContext(this.config.profileDir, {
        acceptDownloads: true,
        downloadsPath: this.config.downloadsDir,
        headless: this.config.headless,
        slowMo: this.config.launchSlowMoMs,
        viewport: { height: 1000, width: 1440 },
      });
      this.contextLaunches += 1;
      return context;
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
