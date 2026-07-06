import type { Page } from "playwright";

export interface DialogInfo {
  ariaModal: boolean;
  id: string;
  role: string;
  tag: string;
  testid: string;
  text: string;
}

const DIALOG_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '[data-testid*="dialog"]',
  '[data-testid*="modal"]',
  "dialog",
  "[popover]",
].join(", ");

export async function detectDialogs(page: Page): Promise<DialogInfo[]> {
  return page.evaluate((selector: string) => {
    const dialogs = document.querySelectorAll(selector);
    return Array.from(dialogs).map((el) => ({
      ariaModal: el.getAttribute("aria-modal") === "true",
      id: el.id || "",
      role: el.getAttribute("role") || "",
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid") || "",
      text: el.textContent?.trim().slice(0, 200) || "",
    }));
  }, DIALOG_SELECTOR);
}
