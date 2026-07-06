import type { Page } from "playwright";

export interface ShadowRootInfo {
  childrenCount: number;
  depth: number;
  hostClasses: string;
  hostId: string;
  hostTag: string;
  nestedRoots: ShadowRootInfo[];
  shadowHTML: string;
  truncated: boolean;
}

export async function traverseShadowDom(
  page: Page,
  maxDepth: number = 8,
): Promise<ShadowRootInfo[]> {
  return page.evaluate((max: number) => {
    const traverse = (root: Element | Document, depth: number): ShadowRootInfo[] => {
      if (depth >= max) {
        return [];
      }

      const results: ShadowRootInfo[] = [];
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll("*"))]
          : Array.from(root.querySelectorAll("*"));

      for (const el of elements) {
        const sr = el.shadowRoot;
        if (sr === null) {
          continue;
        }

        let shadowHTML = sr.innerHTML;
        let truncated = false;
        if (shadowHTML.length > 5000) {
          shadowHTML = shadowHTML.slice(0, 5000) + "...";
          truncated = true;
        }

        const childrenCount = sr.children.length;

        const nestedRoots: ShadowRootInfo[] = [];
        for (const child of Array.from(sr.querySelectorAll("*"))) {
          if (child.shadowRoot !== null) {
            nestedRoots.push(...traverse(child, depth + 1));
          }
        }

        results.push({
          childrenCount,
          depth,
          hostClasses: el.className?.toString() || "",
          hostId: el.id || "",
          hostTag: el.tagName.toLowerCase(),
          nestedRoots,
          shadowHTML,
          truncated,
        });
      }

      return results;
    };

    return traverse(document, 0);
  }, maxDepth);
}
