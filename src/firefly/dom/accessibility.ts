import type { Page } from "playwright";

export interface AccessibilitySnapshot {
  root: AccessibilityNode | null;
}

export interface AccessibilityNode {
  children: AccessibilityNode[];
  description?: string;
  name?: string;
  role: string;
  value?: string;
}

export async function collectAccessibility(page: Page): Promise<AccessibilitySnapshot> {
  try {
    const hasAccessibility = await page
      .evaluate(() => {
        return typeof window !== "undefined";
      })
      .catch(() => false);

    if (!hasAccessibility) {
      return { root: null };
    }

    const snapshot = await page.evaluate(() => {
      try {
        const tree = (window as unknown as { __accessibilityTree?: unknown })
          .__accessibilityTree;
        if (tree !== null && tree !== undefined) {
          return tree;
        }
        return null;
      } catch {
        return null;
      }
    });

    if (snapshot === null || snapshot === undefined) {
      return { root: null };
    }

    return { root: convertNode(snapshot as RawAccessibilityNode) };
  } catch {
    return { root: null };
  }
}

interface RawAccessibilityNode {
  children?: RawAccessibilityNode[];
  description?: string;
  name?: string;
  role: string;
  value?: string;
}

function convertNode(raw: RawAccessibilityNode): AccessibilityNode {
  return {
    children: (raw.children ?? []).map((child) => convertNode(child)),
    description: raw.description,
    name: raw.name,
    role: raw.role,
    value: raw.value,
  };
}
