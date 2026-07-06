import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runDomInspect } from "../firefly/domInspect.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const domInspectInputShape = {
  captureElementScreenshots: z
    .boolean()
    .default(false)
    .describe("Save individual screenshots for each discovered element"),
  includeAccessibility: z
    .boolean()
    .default(true)
    .describe("Include accessibility tree"),
  includeAnnotatedScreenshot: z
    .boolean()
    .default(true)
    .describe("Save annotated screenshot with element labels"),
  includeConsole: z.boolean().default(true).describe("Capture console messages"),
  includeHtml: z
    .boolean()
    .default(true)
    .describe("Save HTML snapshot to debug/dom.html"),
  includeNetwork: z.boolean().default(true).describe("Capture network requests"),
  includeScreenshot: z
    .boolean()
    .default(true)
    .describe("Save screenshot to debug/dom-inspect.png"),
  maxConsoleMessages: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(200)
    .describe("Maximum console messages to return"),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum depth for tree/shadow traversal"),
  maxNetworkRequests: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(200)
    .describe("Maximum network requests to return"),
  mode: z
    .enum(["full", "selector", "shadow", "accessibility", "tree"])
    .default("full")
    .describe("Inspection mode"),
  selector: z
    .string()
    .optional()
    .describe("CSS selector for selector mode (required when mode=selector)"),
};

const domInspectInputSchema = z.object(domInspectInputShape);

export function registerDomInspectTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_dom_inspect",
    {
      description:
        "Inspect the current Adobe Firefly DOM state for debugging. This is a read-only tool that never navigates, clicks, or modifies the page. Use it to diagnose broken automation, discover selectors, and inspect shadow DOM.",
      inputSchema: domInspectInputShape,
      title: "Adobe Firefly DOM Inspector",
    },
    async (input) =>
      withToolErrors(deps, "firefly_dom_inspect", async () => {
        const parsed = domInspectInputSchema.parse(input);
        const result = await runDomInspect(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_dom_inspect" }),
          parsed,
        );

        return jsonToolResult(result);
      }),
  );
}
