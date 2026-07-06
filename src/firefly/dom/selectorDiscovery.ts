import type { Page } from "playwright";

import type { LocatorSuggestion } from "./locatorGen.js";

export interface DiscoveredElement {
  ariaDescribedby: string;
  ariaLabel: string;
  ariaLabelledby: string;
  boundingBox: { height: number; width: number; x: number; y: number } | null;
  classes: string;
  computedStyles: { display: string; pointerEvents: string; visibility: string };
  disabled: boolean;
  enabled: boolean;
  id: string;
  locators: LocatorSuggestion[];
  name: string;
  outerHTML: string;
  placeholder: string;
  readonly: boolean;
  role: string;
  tag: string;
  testid: string;
  text: string;
  type: string;
  visible: boolean;
}

const ELEMENT_SELECTOR = [
  "[data-testid]",
  "button",
  "[role='button']",
  "sp-button",
  "sp-action-button",
  "textarea",
  "input",
  "select",
  "option",
  "label",
  "fieldset",
  "form",
  "dialog",
  "[contenteditable='true']",
].join(", ");

export async function discoverElements(page: Page): Promise<DiscoveredElement[]> {
  const rawElements = await page.evaluate((selector: string) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.slice(0, 200).map((el) => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      const cs = window.getComputedStyle(el);

      let outerHTML = el.outerHTML;
      if (outerHTML.length > 3000) {
        outerHTML = outerHTML.slice(0, 3000) + "...";
      }

      return {
        ariaDescribedby: el.getAttribute("aria-describedby") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        ariaLabelledby: el.getAttribute("aria-labelledby") || "",
        boundingBox: isVisible
          ? {
              height: Math.round(rect.height),
              width: Math.round(rect.width),
              x: Math.round(rect.x),
              y: Math.round(rect.y),
            }
          : null,
        classes: el.className?.toString() || "",
        computedStyles: {
          display: cs.display,
          pointerEvents: cs.pointerEvents,
          visibility: cs.visibility,
        },
        disabled:
          el.hasAttribute("disabled") || (el instanceof HTMLElement && el.inert),
        enabled: !el.hasAttribute("disabled"),
        id: el.id || "",
        name: el.getAttribute("name") || "",
        outerHTML,
        placeholder: el.getAttribute("placeholder") || "",
        readonly: el.hasAttribute("readonly"),
        role: el.getAttribute("role") || "",
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") || "",
        text: el.textContent?.trim().slice(0, 200) || "",
        type: el.getAttribute("type") || "",
        visible: isVisible,
      };
    });
  }, ELEMENT_SELECTOR);

  const elements: DiscoveredElement[] = [];

  for (const raw of rawElements) {
    const selector = raw.testid
      ? `[data-testid="${raw.testid}"]`
      : raw.id
        ? `#${raw.id}`
        : `${raw.tag}[role="${raw.role}"]`;

    const locators = await generateLocatorsForElement(page, selector, raw);

    elements.push({
      ...raw,
      locators,
    });
  }

  return elements;
}

async function generateLocatorsForElement(
  page: Page,
  selector: string,
  info: {
    ariaLabel: string;
    id: string;
    role: string;
    tag: string;
    testid: string;
    text: string;
  },
): Promise<LocatorSuggestion[]> {
  const suggestions: LocatorSuggestion[] = [];
  const total = await page
    .locator(selector)
    .count()
    .catch(() => 0);

  if (info.testid !== undefined && info.testid.length > 0) {
    const css = `[data-testid="${info.testid}"]`;
    const matches = await page
      .locator(css)
      .count()
      .catch(() => 0);
    suggestions.push({
      css,
      matches,
      playwright: `page.getByTestId("${info.testid}")`,
      reason: "data-testid is stable and explicit",
      stability: "high",
      xpath: `//${info.tag}[@data-testid="${info.testid}"]`,
    });
  }

  if (info.ariaLabel.length > 0) {
    const css = `[aria-label="${info.ariaLabel}"]`;
    const matches = await page
      .locator(css)
      .count()
      .catch(() => 0);
    suggestions.push({
      css,
      matches,
      playwright: `page.getByLabel("${info.ariaLabel}")`,
      reason: "aria-label is stable and accessible",
      stability: "high",
      xpath: `//${info.tag}[@aria-label="${info.ariaLabel}"]`,
    });
  }

  if (info.role.length > 0 && info.text.length > 0 && info.text.length <= 60) {
    const shortText = info.text.slice(0, 50);
    const css = `${info.tag}[role="${info.role}"]:has-text("${shortText}")`;
    const matches = await page
      .locator(css)
      .count()
      .catch(() => 0);
    suggestions.push({
      css,
      matches,
      playwright: `page.getByRole("${info.role}", { name: "${info.text.slice(0, 50)}" })`,
      reason: "role + accessible name is semantic",
      stability: "medium",
      xpath: `//${info.tag}[@role="${info.role}"][contains(text(),"${info.text.slice(0, 50)}")]`,
    });
  }

  if (info.id.length > 0) {
    const css = `#${info.id}`;
    const matches = await page
      .locator(css)
      .count()
      .catch(() => 0);
    suggestions.push({
      css,
      matches,
      playwright: `page.locator("#${info.id}")`,
      reason: "id is explicit but may be generated",
      stability: "low",
      xpath: `//*[@id="${info.id}"]`,
    });
  }

  if (suggestions.length === 0 && total > 0) {
    suggestions.push({
      css: selector,
      matches: total,
      playwright: `page.locator("${selector}")`,
      reason: "fallback CSS selector",
      stability: "low",
      xpath: `//${info.tag}`,
    });
  }

  return suggestions;
}
