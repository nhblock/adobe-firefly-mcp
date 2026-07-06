import type { Page } from "playwright";
import path from "node:path";

const DIAGNOSTIC_TIMEOUT_MS = 3000;

export interface Diagnostics {
  console: { type: string; text: string; time: number }[];
  network: { url: string; method: string; status: number; time: number }[];
  screenshot?: string;
  pageHTML?: string;
  accessibilitySnapshot?: string;
  timestamp: string;
}

export async function captureDiagnostics(
  page: Page,
  label: string,
): Promise<Diagnostics> {
  const ts = Date.now();
  const diag: Diagnostics = {
    console: (await page
      .evaluate(() => {
        const w = window as {
          __consoleBuffer?: { type: string; text: string; time: number }[];
        };
        return (w.__consoleBuffer ?? []).slice(-50);
      })
      .catch(() => [])) as Diagnostics["console"],
    network: (await page
      .evaluate(() => {
        const w = window as {
          __networkBuffer?: {
            url: string;
            method: string;
            status: number;
            time: number;
          }[];
        };
        return (w.__networkBuffer ?? []).slice(-50);
      })
      .catch(() => [])) as Diagnostics["network"],
    timestamp: new Date(ts).toISOString(),
  };

  try {
    diag.screenshot = path.join("test-results", label + "-" + ts + ".png");
    await page.screenshot({ path: diag.screenshot, timeout: DIAGNOSTIC_TIMEOUT_MS });
  } catch (e) {
    void e;
  }

  try {
    diag.pageHTML = path.join("test-results", label + "-" + ts + ".html");
    const html = await page.content();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(diag.pageHTML, html);
  } catch (e) {
    void e;
  }

  try {
    diag.accessibilitySnapshot = path.join(
      "test-results",
      label + "-" + ts + "-a11y.json",
    );
    const { writeFile } = await import("node:fs/promises");
    const html = await page.content();
    await writeFile(diag.accessibilitySnapshot, html.substring(0, 10000));
  } catch (e) {
    void e;
  }

  return diag;
}

export async function checkPageHealth(
  page: Page,
): Promise<{ ok: boolean; reason?: string }> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const isAuth = /sign.?in|log.?in|auth/i.test(title + url);
  const is404 = /404|not.?found/i.test(title);
  const isBlocked = /blocked|captcha|verify/i.test(title + url);

  if (isAuth) return { ok: false, reason: "Auth redirect: " + url };
  if (is404) return { ok: false, reason: "404 page: " + url };
  if (isBlocked) return { ok: false, reason: "Blocked page: " + url };
  return { ok: true };
}
