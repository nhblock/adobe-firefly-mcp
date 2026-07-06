import type { Page } from "playwright";

export interface LocatorSuggestion {
  css: string;
  matches: number;
  playwright: string;
  reason: string;
  stability: "high" | "medium" | "low";
  xpath: string;
}

interface ElementInfo {
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
  role?: string;
  tag: string;
  testid?: string;
  text?: string;
  type?: string;
}

export async function generateLocatorSuggestions(
  page: Page,
  selector: string,
): Promise<LocatorSuggestion[]> {
  const elements = await page.evaluate((sel: string) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    return nodes.slice(0, 50).map((el) => {
      const text = el.textContent?.trim().slice(0, 100) ?? "";
      return {
        ariaLabel: el.getAttribute("aria-label") || undefined,
        id: el.id || undefined,
        placeholder: el.getAttribute("placeholder") || undefined,
        role: el.getAttribute("role") || undefined,
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") || undefined,
        text: text.length > 0 ? text : undefined,
        type: el.getAttribute("type") || undefined,
      };
    });
  }, selector);

  const suggestions: LocatorSuggestion[] = [];

  for (const info of elements) {
    const locators = generateForElement(info);
    for (const loc of locators) {
      const matches = await page
        .locator(loc.css)
        .count()
        .catch(() => 0);
      suggestions.push({ ...loc, matches });
    }
  }

  return suggestions;
}

function generateForElement(info: ElementInfo): Omit<LocatorSuggestion, "matches">[] {
  const result: Omit<LocatorSuggestion, "matches">[] = [];
  const escaped = escapeXPath(info.text ?? "");
  const escapedLabel = escapeXPath(info.ariaLabel ?? "");

  if (info.testid !== undefined) {
    const css = `[data-testid="${info.testid}"]`;
    result.push({
      css,
      playwright: `page.getByTestId("${info.testid}")`,
      reason: "data-testid is stable and explicit",
      stability: "high",
      xpath: `//${info.tag}[@data-testid="${info.testid}"]`,
    });
  }

  if (info.ariaLabel !== undefined) {
    const css = `[aria-label="${info.ariaLabel}"]`;
    result.push({
      css,
      playwright: `page.getByLabel("${info.ariaLabel}")`,
      reason: "aria-label is stable and accessible",
      stability: "high",
      xpath: `//${info.tag}[@aria-label="${escapedLabel}"]`,
    });
  }

  if (info.role !== undefined && info.text !== undefined && info.text.length > 0) {
    const shortText = info.text.slice(0, 50);
    result.push({
      css: `${info.tag}[role="${info.role}"]:has-text("${shortText}")`,
      playwright: `page.getByRole("${info.role}" as AriaRole, { name: "${escaped}" })`,
      reason: "role + accessible name is semantic",
      stability: "medium",
      xpath: `//${info.tag}[@role="${info.role}"][contains(text(),"${escaped}")]`,
    });
  }

  if (info.placeholder !== undefined) {
    const css = `[placeholder="${info.placeholder}"]`;
    result.push({
      css,
      playwright: `page.getByPlaceholder("${info.placeholder}")`,
      reason: "placeholder is user-visible text",
      stability: "medium",
      xpath: `//${info.tag}[@placeholder="${escaped}"]`,
    });
  }

  if (info.text !== undefined && info.text.length > 0 && info.text.length <= 60) {
    const shortText = info.text.slice(0, 50);
    result.push({
      css: `${info.tag}:has-text("${shortText}")`,
      playwright: `page.getByText("${escaped}")`,
      reason: "text content matches",
      stability: "low",
      xpath: `//${info.tag}[contains(text(),"${escaped}")]`,
    });
  }

  if (info.id !== undefined) {
    const css = `#${info.id}`;
    result.push({
      css,
      playwright: `page.locator("#${info.id}")`,
      reason: "id is explicit but may be generated",
      stability: "low",
      xpath: `//*[@id="${info.id}"]`,
    });
  }

  if (info.role !== undefined) {
    const css = `${info.tag}[role="${info.role}"]`;
    result.push({
      css,
      playwright: `page.getByRole("${info.role}" as AriaRole)`,
      reason: "role-only selector matches multiple elements",
      stability: "low",
      xpath: `//${info.tag}[@role="${info.role}"]`,
    });
  }

  return result;
}

function escapeXPath(text: string): string {
  if (!text.includes('"')) {
    return text;
  }
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  return `concat('${text.split('"').join(`', '"', '`)}')`;
}
