import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { BrowserManager } from "../src/browser.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import { runTextToImage } from "../src/firefly/generate.js";
import type { Logger } from "../src/logger.js";

// A stand-in for firefly.adobe.com/generate/images that reproduces the traps
// the live UI has sprung on this tool:
// - a prompt-suggestion popup opens on input and swallows the next outside
//   click (optionally ignoring Escape);
// - the prompt is a <firefly-prompt> custom element that carries the
//   placeholder on its host but renders the real textarea in shadow DOM, late;
// - a first-run coachmark with an "OK" button sits on top of Generate;
// - results from a previous run are already on the page, and their rendered
//   size changes when the popup closes (a pure layout shift);
// - each tile's download button only shows on hover and matches several of the
//   generic download selectors at once, and a "Download all" button exists.
const FAKE_FIREFLY_HTML = String.raw`<!doctype html>
<html><head><style>
  body { font-family: sans-serif; margin: 0; }
  #results .group { display: flex; gap: 8px; margin: 8px; }
  .tile { position: relative; }
  .tile img { width: 256px; height: 256px; display: block; }
  body.tall .tile img { width: 240px; height: 240px; }
  .tile .dl { display: none; position: absolute; top: 8px; right: 8px; }
  .tile:hover .dl { display: block; }
  #popup { position: fixed; bottom: 200px; left: 0; right: 0; background: #eee; }
  #coach { position: fixed; bottom: 0; right: 0; width: 320px; height: 140px; background: #fff; border: 1px solid; z-index: 10; }
  #bar { position: fixed; bottom: 20px; left: 20px; }
  firefly-prompt { display: block; width: 600px; height: 80px; border: 1px solid; }
</style></head><body>
  <button id="download-all" aria-label="Download all">Download all</button>
  <div id="results"></div>
  <div id="popup" data-testid="prompt-suggestion-popup" hidden>suggestions</div>
  <div id="bar">
    <firefly-prompt data-testid="prompt-bar-input" placeholder="Describe the image you want to generate"></firefly-prompt>
    <button data-testid="content-type-art">Art</button>
    <button data-testid="content-type-photo">Photo</button>
    <button data-testid="generate-button">Generate</button>
  </div>
  <div id="coach" role="dialog">Start generating images <button>OK</button></div>
<script>
  window.generations = 0;
  let popupOpen = false;
  const popup = document.getElementById("popup");
  class FireflyPrompt extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: "open" });
      setTimeout(() => {
        const textarea = document.createElement("textarea");
        textarea.setAttribute("aria-label", "Prompt");
        textarea.addEventListener("input", () => {
          popup.hidden = false; popupOpen = true;
        });
        root.appendChild(textarea);
      }, 8000);
    }
    get value() { return this.shadowRoot.querySelector("textarea")?.value ?? ""; }
  }
  customElements.define("firefly-prompt", FireflyPrompt);
  const promptBox = document.querySelector("firefly-prompt");
  const results = document.getElementById("results");

  function tileImage(label) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "hsl(" + (label.length * 47 % 360) + ",70%,50%)";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#000"; ctx.font = "20px sans-serif";
    ctx.fillText(label, 10, 128);
    return canvas.toDataURL("image/png");
  }

  function downloadDataUrl(dataUrl, name) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function addGroup(tag) {
    const group = document.createElement("div");
    group.className = "group";
    for (let i = 0; i < 4; i += 1) {
      const src = tileImage(tag + "-" + i);
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.innerHTML = '<img alt="">' +
        '<button class="dl" aria-label="Download" data-testid="tile-download">Download</button>';
      tile.querySelector("img").src = src;
      tile.querySelector(".dl").addEventListener("click", () => downloadDataUrl(src, "Firefly " + tag + " " + i + ".png"));
      group.appendChild(tile);
    }
    results.prepend(group);
  }

  document.getElementById("download-all").addEventListener("click", () => {
    const first = results.querySelector("img");
    if (first) downloadDataUrl(first.src, "Firefly all.png");
  });

  // Closing the popup reflows the page and resizes the previous results.
  function closePopup() {
    popup.hidden = true; popupOpen = false;
    document.body.classList.toggle("tall");
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && popupOpen && window.escapeClosesPopup !== false) {
      closePopup();
    }
  });
  document.addEventListener("click", (event) => {
    if (popupOpen && !popup.contains(event.target)) {
      closePopup();
      event.stopPropagation(); event.preventDefault();
    }
  }, true);
  document.querySelector("#coach button").addEventListener("click", () => {
    document.getElementById("coach").remove();
  });
  document.querySelector('[data-testid="generate-button"]').addEventListener("click", async () => {
    if (window.generateDoesNothing) return;
    window.generations += 1;
    const tag = "gen" + window.generations;
    await fetch("/v3/images/generate-async", { method: "POST", body: promptBox.value });
    setTimeout(() => addGroup(tag), 400);
  });

  addGroup("previous");
</script></body></html>`;

const silentLogger = {
  child: () => silentLogger,
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
} as unknown as Logger;

let browser: Browser;
let page: Page;
let config: AppConfig;
let tempDir: string;

async function openFakeFirefly(options: {
  escapeClosesPopup?: boolean;
  generateDoesNothing?: boolean;
}): Promise<void> {
  page = await browser.newPage({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("https://firefly.test/**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ body: "{}", contentType: "application/json" });
      return;
    }
    await route.fulfill({ body: FAKE_FIREFLY_HTML, contentType: "text/html" });
  });
  await page.addInitScript((opts) => {
    Object.assign(window, opts);
  }, options);
  await page.goto("https://firefly.test/generate/images");
}

function fakeBrowserManager(): BrowserManager {
  return { getPage: () => Promise.resolve(page) } as unknown as BrowserManager;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

describe("runTextToImage against a fake Firefly page", () => {
  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmcp-test-"));
    config = {
      ...loadConfig({ FIREFLY_MCP_DATA_DIR: tempDir }),
      generationStartTimeoutMs: 3_000,
      generationTimeoutMs: 10_000,
      operationTimeoutMs: 3_000,
    };
    await page?.close().catch(() => undefined);
  });

  it("generates once and saves each new image exactly once", async () => {
    await openFakeFirefly({});

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      contentClass: "Art",
      count: 4,
      negativePrompt: "people",
      prompt: "A yellow smiley face riding a horse",
    });

    expect(
      await page.evaluate(
        () => (window as unknown as { generations: number }).generations,
      ),
    ).toBe(1);
    expect(await page.locator("firefly-prompt textarea").inputValue()).toBe(
      "A yellow smiley face riding a horse",
    );

    expect(result.files).toHaveLength(4);
    const hashes = await Promise.all(result.files.map((file) => sha256(file.path)));
    expect(new Set(hashes).size).toBe(4);
    for (const file of result.files) {
      expect(file.suggestedFilename ?? "").not.toMatch(/previous|all/u);
    }
    expect(result.warnings.join(" ")).toMatch(/negativePrompt/u);
  }, 60_000);

  it("retries the click when a popup swallows the first one", async () => {
    await openFakeFirefly({ escapeClosesPopup: false });

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      count: 2,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(
      await page.evaluate(
        () => (window as unknown as { generations: number }).generations,
      ),
    ).toBe(1);
    expect(result.files).toHaveLength(2);
  }, 60_000);

  it("fails clearly instead of returning old images when Generate never starts", async () => {
    await openFakeFirefly({ generateDoesNothing: true });

    await expect(
      runTextToImage(fakeBrowserManager(), config, silentLogger, {
        count: 4,
        prompt: "A yellow smiley face riding a horse",
      }),
    ).rejects.toThrow(/did not start/iu);
  }, 60_000);
});
