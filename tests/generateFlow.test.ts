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
//   generic download selectors at once, and a "Download all" button exists;
// - the aspect ratio (multi-model /generate/image UI) is a closed picker whose
//   options are role-less sp-menu-items in shadow DOM, shown only once opened.
const FAKE_FIREFLY_HTML = String.raw`<!doctype html>
<html><head><style>
  body { font-family: sans-serif; margin: 0; }
  #results .group { display: flex; gap: 8px; margin: 8px; }
  .tile { position: relative; }
  .tile img { width: 256px; height: 256px; display: block; }
  body.tall .tile img { width: 240px; height: 240px; }
  .wide .tile img, body.tall .wide .tile img { width: 225px; height: 125px; }
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
    <firefly-picker data-testid="model-picker"></firefly-picker>
    <firefly-picker data-testid="aspect-ratio-picker"></firefly-picker>
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
  window.aspectRatio = "Square (1:1)";
  window.model = "Gemini 3.1 (Nano Banana 2)";
  const pickers = {
    "aspect-ratio-picker": {
      opener: "firefly-picker-size", setting: "aspectRatio",
      options: ["Ultra Wide (21:9)", "Widescreen (16:9)", "Square (1:1)", "Vertical (9:16)"],
    },
    // Like the live page: "Image 4 Ultra" is listed before "Image 4", and a
    // hidden duplicate menu of the same items exists elsewhere in the DOM.
    "model-picker": {
      opener: "firefly-picker-model", setting: "model",
      options: ["Firefly Image 5", "Firefly Image 4 Ultra", "Firefly Image 4", "Gemini 3.1 (Nano Banana 2)"],
      hiddenDuplicate: true,
    },
  };
  class FireflyPicker extends HTMLElement {
    connectedCallback() {
      const spec = pickers[this.dataset.testid];
      const root = this.attachShadow({ mode: "open" });
      const items = spec.options
        .map((label) => '<sp-menu-item style="display:block">' + label + '</sp-menu-item>').join("");
      root.innerHTML = '<button data-testid="' + spec.opener + '">' + window[spec.setting] + '</button>' +
        (spec.hiddenDuplicate ? '<div class="dup" hidden>' + items + '</div>' : '') +
        '<div class="menu" hidden>' + items + '</div>';
      const menu = root.querySelector(".menu");
      root.querySelector("button").addEventListener("click", () => { menu.hidden = false; });
      for (const item of menu.querySelectorAll("sp-menu-item")) {
        item.addEventListener("click", () => {
          window[spec.setting] = item.textContent;
          root.querySelector("button").textContent = item.textContent;
          menu.hidden = true;
        });
      }
    }
  }
  customElements.define("firefly-picker", FireflyPicker);
  const promptBox = document.querySelector("firefly-prompt");
  // The multi-model UI renders results inside shadow DOM.
  const resultsHost = document.getElementById("results");
  const results = window.shadowResults ? resultsHost.attachShadow({ mode: "open" }) : resultsHost;
  if (window.shadowResults) {
    // Page styles do not reach into shadow DOM; the tiles need their own.
    const style = document.createElement("style");
    style.textContent = [...document.querySelectorAll("style")].map((el) => el.textContent).join(" ");
    results.appendChild(style);
  }

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

  function dataUrlToBlobUrl(dataUrl) {
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  }

  function addGroup(tag) {
    const group = document.createElement("div");
    group.className = window.wideThumbs ? "group wide" : "group";
    for (let i = 0; i < 4; i += 1) {
      const src = tileImage(tag + "-" + i);
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.innerHTML = '<img alt="">' +
        '<button class="dl" aria-label="Download" data-testid="tile-download">Download</button>';
      // The multi-model UI shows full-size results as blob: URLs, and its
      // Download button does not start a plain browser download.
      tile.querySelector("img").src = window.blobResults ? dataUrlToBlobUrl(src) : src;
      tile.querySelector(".dl").addEventListener("click", () => {
        if (!window.blobResults) downloadDataUrl(src, "Firefly " + tag + " " + i + ".png");
      });
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
  shadowResults?: boolean;
  blobResults?: boolean;
  wideThumbs?: boolean;
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

  it("opens the aspect ratio picker and picks the option matching a bare ratio", async () => {
    await openFakeFirefly({});

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      aspectRatio: "16:9",
      count: 1,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(
      await page.evaluate(
        () => (window as unknown as { aspectRatio: string }).aspectRatio,
      ),
    ).toBe("Widescreen (16:9)");
    expect(result.warnings.join(" ")).not.toMatch(/aspect ratio/u);
  }, 60_000);

  it("sets the aspect ratio even when the prompt popup ignores Escape", async () => {
    await openFakeFirefly({ escapeClosesPopup: false });

    await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      aspectRatio: "9:16",
      count: 1,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(
      await page.evaluate(
        () => (window as unknown as { aspectRatio: string }).aspectRatio,
      ),
    ).toBe("Vertical (9:16)");
  }, 60_000);

  it("selects the default image model by its exact label", async () => {
    await openFakeFirefly({});

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      count: 1,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(
      await page.evaluate(() => (window as unknown as { model: string }).model),
    ).toBe("Firefly Image 4");
    expect(result.warnings.join(" ")).not.toMatch(/image model/u);
  }, 60_000);

  it("finds and saves results rendered inside shadow DOM", async () => {
    await openFakeFirefly({ shadowResults: true });

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      count: 4,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(result.files).toHaveLength(4);
    const hashes = await Promise.all(result.files.map((file) => sha256(file.path)));
    expect(new Set(hashes).size).toBe(4);
  }, 60_000);

  it("saves blob: results from the image itself without waiting on Download", async () => {
    await openFakeFirefly({ blobResults: true, shadowResults: true });

    const startedAt = Date.now();
    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      count: 4,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(result.files).toHaveLength(4);
    expect(result.files.every((file) => file.source === "image-src")).toBe(true);
    const hashes = await Promise.all(result.files.map((file) => sha256(file.path)));
    expect(new Set(hashes).size).toBe(4);
    // Waiting on the Download button costs 15s per tile before falling back.
    expect(Date.now() - startedAt).toBeLessThan(30_000);
  }, 180_000);

  it("detects 16:9 results whose thumbnails render shorter than 128px", async () => {
    // The multi-model UI shows 16:9 results as 225x125 thumbnails.
    await openFakeFirefly({ shadowResults: true, wideThumbs: true });

    const result = await runTextToImage(fakeBrowserManager(), config, silentLogger, {
      count: 4,
      prompt: "A yellow smiley face riding a horse",
    });

    expect(result.files).toHaveLength(4);
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
