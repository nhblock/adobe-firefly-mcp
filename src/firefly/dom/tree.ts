import type { Page } from "playwright";

export interface TreeNode {
  ariaLabel: string;
  children: TreeNode[];
  classes: string;
  depth: number;
  id: string;
  tag: string;
  testid: string;
  text: string;
}

export async function buildDomTree(
  page: Page,
  maxDepth: number = 10,
): Promise<TreeNode> {
  return page.evaluate((max: number) => {
    const buildNode = (el: Element, depth: number): TreeNode => {
      const children: TreeNode[] = [];

      if (depth < max) {
        for (const child of Array.from(el.children)) {
          children.push(buildNode(child, depth + 1));
        }
      }

      const text =
        children.length === 0 ? el.textContent?.trim().slice(0, 100) || "" : "";

      return {
        ariaLabel: el.getAttribute("aria-label") || "",
        children,
        classes: el.className?.toString().slice(0, 100) || "",
        depth,
        id: el.id || "",
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") || "",
        text,
      };
    };

    const body = document.body;
    if (body === null) {
      return {
        ariaLabel: "",
        children: [],
        classes: "",
        depth: 0,
        id: "",
        tag: "body",
        testid: "",
        text: "",
      };
    }

    return buildNode(body, 0);
  }, maxDepth);
}
