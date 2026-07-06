import type { Page } from "playwright";

export interface IframeInfo {
  name: string;
  sameOrigin: boolean;
  title: string;
  url: string;
}

export async function inspectIframes(page: Page): Promise<IframeInfo[]> {
  return page.evaluate(() => {
    const frames = document.querySelectorAll("iframe");
    const currentHostname = window.location.hostname;

    return Array.from(frames).map((iframe) => {
      let url = "";
      try {
        url = iframe.src || iframe.contentWindow?.location?.href || "";
      } catch {
        url = iframe.src || "";
      }

      let hostname = "";
      try {
        hostname = new URL(url).hostname;
      } catch {
        // Ignore
      }

      return {
        name: iframe.name || "",
        sameOrigin: hostname === currentHostname || hostname === "",
        title: iframe.title || "",
        url,
      };
    });
  });
}
