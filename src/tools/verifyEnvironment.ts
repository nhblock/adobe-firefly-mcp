import type { Page } from "playwright";

import { detectAuthState } from "../firefly/wait.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

interface VisibleAccountDetails {
  email?: string;
  name?: string;
  creditsOrQuota?: string[];
}

async function readVisibleAccountDetails(page: Page): Promise<VisibleAccountDetails> {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    const name = text
      .match(/(?:signed in as|hello)[,:]?\s*([^\n]{2,80})/i)?.[1]
      ?.trim();
    const creditsOrQuota = text.match(
      /.{0,45}(?:\d[\d,]*\s*(?:credits?|generations?)|quota|credits? remaining|generations? (?:left|remaining)).{0,45}/gi,
    );
    return {
      creditsOrQuota: creditsOrQuota?.slice(0, 10),
      email,
      name,
    };
  });
}

export function registerVerifyEnvironmentTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_verify_environment",
    {
      description:
        "Read-only verification of the current live Firefly page. It reuses the MCP server's BrowserManager, BrowserContext, and Page without navigating or clicking.",
      inputSchema: {},
      title: "Adobe Firefly Live Environment Verification",
    },
    async () =>
      withToolErrors(deps, "firefly_verify_environment", async () => {
        // getPage() reuses the active page when the runtime has already opened one.
        // It launches only when the server has no browser context at all.
        const page = await deps.browser.getPage();
        const [authState, details, browser] = await Promise.all([
          detectAuthState(page, deps.config),
          readVisibleAccountDetails(page),
          deps.browser.status(),
        ]);

        return jsonToolResult({
          account: details,
          authState,
          browser,
          currentUrl: page.url(),
          ok: true,
          pageIdentity: browser.livePageId,
          workspaceReady: authState === "ready",
        });
      }),
  );
}
