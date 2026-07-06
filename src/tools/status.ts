import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { detectAuthState, dismissKnownDialogs } from "../firefly/wait.js";
import { ensureDirectory, timestampedBasename } from "../utils/filesystem.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const statusInputShape = {
  openBrowser: z
    .boolean()
    .default(true)
    .describe("Open the persistent browser and navigate to Firefly."),
  screenshot: z
    .boolean()
    .default(false)
    .describe("Save a diagnostic screenshot in the downloads directory."),
};

const statusInputSchema = z.object(statusInputShape);

export function registerStatusTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_status",
    {
      description:
        "Report local configuration and Adobe Firefly browser session status. Use this first to complete manual sign-in.",
      inputSchema: statusInputShape,
      title: "Adobe Firefly Status",
    },
    async (input) =>
      withToolErrors(deps, "firefly_status", async () => {
        const parsed = statusInputSchema.parse(input);
        const browserStatusBefore = await deps.browser.status();

        if (!parsed.openBrowser) {
          return jsonToolResult({
            browser: browserStatusBefore,
            dataDir: deps.config.dataDir,
            ok: true,
            urls: deps.config.urls,
          });
        }

        const page = await deps.browser.getPage(deps.config.urls.base);
        await dismissKnownDialogs(page, deps.config);

        const authState = await detectAuthState(page, deps.config);
        const title = await page.title().catch(() => "");
        const screenshotPath = parsed.screenshot
          ? await saveScreenshot(deps, page)
          : undefined;
        const browserStatusAfter = await deps.browser.status();

        return jsonToolResult({
          authState,
          browser: browserStatusAfter,
          currentUrl: page.url(),
          dataDir: deps.config.dataDir,
          message:
            authState === "sign_in_required"
              ? "Sign in manually in the opened browser, then run firefly_status again."
              : undefined,
          ok: true,
          screenshotPath,
          title,
          urls: deps.config.urls,
        });
      }),
  );
}

async function saveScreenshot(
  deps: ToolDeps,
  page: Awaited<ReturnType<ToolDeps["browser"]["getPage"]>>,
): Promise<string> {
  await ensureDirectory(deps.config.downloadsDir);
  const screenshotPath = path.join(
    deps.config.downloadsDir,
    `${timestampedBasename("firefly-status")}.png`,
  );
  await page.screenshot({ fullPage: false, path: screenshotPath });
  return screenshotPath;
}
