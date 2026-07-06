import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runImageWorkflow } from "../firefly/generate.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const expandInputShape = {
  aspectRatio: z
    .string()
    .trim()
    .optional()
    .describe("Optional target aspect ratio label to try to select in Firefly."),
  count: z.number().int().min(1).max(4).default(1).describe("Maximum images to save."),
  imagePath: z
    .string()
    .trim()
    .min(1)
    .describe("Local source image path. Relative paths resolve from the server cwd."),
  outputDir: z.string().trim().optional().describe("Optional output directory."),
  prompt: z
    .string()
    .trim()
    .optional()
    .describe("Optional direction for the expanded area."),
};

const expandInputSchema = z.object(expandInputShape);

export function registerExpandTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_expand",
    {
      description:
        "Use Adobe Firefly's browser UI to expand/outpaint a local image and save the result.",
      inputSchema: expandInputShape,
      title: "Adobe Firefly Expand",
    },
    async (input) =>
      withToolErrors(deps, "firefly_expand", async () => {
        const parsed = expandInputSchema.parse(input);
        const result = await runImageWorkflow(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_expand" }),
          "firefly_expand",
          deps.config.urls.expand,
          parsed,
        );

        return jsonToolResult({ ok: true, ...result });
      }),
  );
}
