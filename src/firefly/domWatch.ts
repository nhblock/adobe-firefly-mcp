import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { type PageInfo, collectPageInfo } from "./dom/pageInfo.js";

export interface DomWatchInput {
  maxMutations?: number;
  mutations?: Array<"attributes" | "characterData" | "childList">;
  targetSelector?: string;
  timeoutMs?: number;
}

export interface MutationEntry {
  action: string;
  addedNodes: string[];
  attributeName?: string;
  oldValue?: string;
  removedNodes: string[];
  targetSelector: string;
  timestamp: string;
  type: string;
}

export interface DomWatchResult {
  duration: number;
  mutations: MutationEntry[];
  ok: boolean;
  pageInfo: PageInfo;
  summary: {
    addedNodes: number;
    attributeChanges: number;
    removedNodes: number;
    totalMutations: number;
  };
  warnings: string[];
}

export async function runDomWatch(
  browser: BrowserManager,
  config: AppConfig,
  logger: Logger,
  input: DomWatchInput,
): Promise<DomWatchResult> {
  const warnings: string[] = [];
  const page = await browser.getPage();
  const context = await browser.getContext();
  const pageInfo = await collectPageInfo(page, context);

  const timeoutMs = input.timeoutMs ?? 60_000;
  const maxMutations = input.maxMutations ?? 100;
  const mutationTypes = input.mutations ?? ["childList", "attributes"];

  const mutations: MutationEntry[] = [];

  const selector = input.targetSelector ?? "body";

  await page.evaluate(
    ({
      mutationTypes: types,
      selector: sel,
    }: {
      mutationTypes: string[];
      selector: string;
    }) => {
      const target = document.querySelector(sel) ?? document.body;
      if (target === null) {
        return;
      }

      const getSelector = (node: Node): string => {
        if (node instanceof Element) {
          const testid = node.getAttribute("data-testid");
          if (testid !== null) {
            return `[data-testid="${testid}"]`;
          }
          if (node.id !== "") {
            return `#${node.id}`;
          }
          return node.tagName.toLowerCase();
        }
        return node.parentElement?.tagName.toLowerCase() ?? "unknown";
      };

      const getShortContent = (node: Node): string => {
        if (node instanceof Element) {
          return node.textContent?.trim().slice(0, 50) ?? "";
        }
        if (node instanceof Text) {
          return node.textContent?.trim().slice(0, 50) ?? "";
        }
        return "";
      };

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const entry = {
            action: "",
            addedNodes: Array.from(record.addedNodes).map((n) => getShortContent(n)),
            attributeName: record.attributeName ?? undefined,
            oldValue: record.oldValue ?? undefined,
            removedNodes: Array.from(record.removedNodes).map((n) =>
              getShortContent(n),
            ),
            targetSelector: getSelector(record.target),
            timestamp: new Date().toISOString(),
            type: record.type,
          };

          if (record.type === "childList") {
            if (record.addedNodes.length > 0) {
              entry.action = "added";
            } else if (record.removedNodes.length > 0) {
              entry.action = "removed";
            }
          } else if (record.type === "attributes") {
            entry.action = "attributeChanged";
          }

          (
            window as unknown as { __domWatchMutations: (typeof entry)[] }
          ).__domWatchMutations ??= [];
          (
            window as unknown as { __domWatchMutations: (typeof entry)[] }
          ).__domWatchMutations.push(entry);

          if (
            (window as unknown as { __domWatchMutations: (typeof entry)[] })
              .__domWatchMutations.length >= 500
          ) {
            observer.disconnect();
          }
        }
      });

      observer.observe(target, {
        attributeOldValue: types.includes("attributes"),
        attributes: types.includes("attributes"),
        characterData: types.includes("characterData"),
        characterDataOldValue: types.includes("characterData"),
        childList: types.includes("childList"),
        subtree: true,
      });

      (
        window as unknown as { __domWatchObserver: MutationObserver }
      ).__domWatchObserver = observer;
    },
    { mutationTypes, selector },
  );

  logger.info("DOM watch started", { selector, timeoutMs });

  const startTime = Date.now();
  const deadline = startTime + timeoutMs;

  while (Date.now() < deadline && mutations.length < maxMutations) {
    const current = await page.evaluate(() => {
      const arr =
        (window as unknown as { __domWatchMutations?: MutationEntry[] })
          .__domWatchMutations ?? [];
      return arr;
    });

    while (mutations.length < current.length && mutations.length < maxMutations) {
      const entry = current[mutations.length];
      if (entry !== undefined) {
        mutations.push(entry);
      } else {
        break;
      }
    }

    if (current.length >= maxMutations) {
      break;
    }

    await page.waitForTimeout(500);
  }

  await page.evaluate(() => {
    const observer = (window as unknown as { __domWatchObserver?: MutationObserver })
      .__domWatchObserver;
    observer?.disconnect();
  });

  const duration = Date.now() - startTime;

  let addedNodes = 0;
  let removedNodes = 0;
  let attributeChanges = 0;

  for (const m of mutations) {
    if (m.action === "added") {
      addedNodes += 1;
    } else if (m.action === "removed") {
      removedNodes += 1;
    } else if (m.action === "attributeChanged") {
      attributeChanges += 1;
    }
  }

  logger.info("DOM watch completed", {
    duration,
    totalMutations: mutations.length,
  });

  return {
    duration,
    mutations,
    ok: true,
    pageInfo,
    summary: {
      addedNodes,
      attributeChanges,
      removedNodes,
      totalMutations: mutations.length,
    },
    warnings,
  };
}
