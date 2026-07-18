import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: mocks.launchPersistentContext,
  },
}));

import { BrowserManager } from "../src/browser.js";
import { loadConfig } from "../src/config.js";

describe("BrowserManager live session reuse", () => {
  beforeEach(() => {
    mocks.launchPersistentContext.mockReset();
  });

  it("launches one context and returns the same live page", async () => {
    const page = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn(() => false),
      on: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      url: vi.fn(() => "https://firefly.adobe.com/generate/video"),
    };
    const context = {
      newPage: vi.fn(),
      pages: vi.fn(() => [page]),
    };
    mocks.launchPersistentContext.mockResolvedValue(context);

    const manager = new BrowserManager(loadConfig(), {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as never);

    const first = await manager.getPage();
    const second = await manager.getPage();
    const status = await manager.status();

    expect(first).toBe(page);
    expect(second).toBe(page);
    expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);
    expect(context.newPage).not.toHaveBeenCalled();
    expect(status).toMatchObject({ contextLaunches: 1, livePageId: 1, pages: 1 });
  });
});
