import type { BrowserContext, Page } from "playwright";

export interface PageInfo {
  browserVersion: string;
  frameworks: FrameworkInfo;
  language: string;
  readyState: string;
  timestamp: string;
  title: string;
  url: string;
  userAgent: string;
  viewport: { height: number; width: number };
}

export interface FrameworkInfo {
  angular?: string;
  lit?: string;
  react?: string;
  shadowRootCount: number;
  vue?: string;
}

export async function collectPageInfo(
  page: Page,
  context: BrowserContext,
): Promise<PageInfo> {
  const domInfo = await page.evaluate(() => {
    const doc = document.documentElement;

    const detectReact = (): string | undefined => {
      const root = document.querySelector("[data-reactroot]");
      if (root !== null) {
        return "detected";
      }
      try {
        const hook = (window as unknown as Record<string, unknown>)[
          "__REACT_DEVTOOLS_GLOBAL_HOOK__"
        ];
        if (hook !== null && hook !== undefined && typeof hook === "object") {
          const renderers = (hook as Record<string, unknown>)["renderers"];
          if (renderers instanceof Map && renderers.size > 0) {
            return "detected";
          }
        }
      } catch {
        // Ignore
      }
      return undefined;
    };

    const detectVue = (): string | undefined => {
      if ("__VUE__" in window) {
        return "detected";
      }
      if (document.querySelector("[data-v-]") !== null) {
        return "detected";
      }
      return undefined;
    };

    const detectAngular = (): string | undefined => {
      if ("ng" in window) {
        return "detected";
      }
      const el = document.querySelector("[ng-version]");
      if (el !== null) {
        return el.getAttribute("ng-version") ?? "detected";
      }
      return undefined;
    };

    const detectLit = (): string | undefined => {
      try {
        if (customElements.get("lit-html") !== undefined) {
          return "detected";
        }
      } catch {
        // Ignore
      }
      return undefined;
    };

    const countShadowRoots = (root: Element | Document): number => {
      let count = 0;
      const walk = (node: Element | Document): void => {
        if (node instanceof Element && node.shadowRoot !== null) {
          count += 1;
          for (const child of Array.from(node.shadowRoot.children)) {
            walk(child);
          }
        }
        if (node instanceof Element || node instanceof Document) {
          for (const child of Array.from(node.children)) {
            walk(child);
          }
        }
      };
      walk(root);
      return count;
    };

    return {
      frameworks: {
        angular: detectAngular(),
        lit: detectLit(),
        react: detectReact(),
        shadowRootCount: countShadowRoots(document),
        vue: detectVue(),
      },
      language: doc.lang || "",
      readyState: document.readyState,
      title: document.title,
      userAgent: navigator.userAgent,
    };
  });

  const browser = context.browser();
  const browserVersion = browser?.version() ?? "unknown";
  const viewport = page.viewportSize() ?? { height: 0, width: 0 };

  return {
    browserVersion,
    frameworks: domInfo.frameworks,
    language: domInfo.language,
    readyState: domInfo.readyState,
    timestamp: new Date().toISOString(),
    title: domInfo.title,
    url: page.url(),
    userAgent: domInfo.userAgent,
    viewport,
  };
}
