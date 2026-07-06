import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runImageWorkflow } from "../firefly/generate.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const variationsInputShape = {
  aspectRatio: z
    .string()
    .trim()
    .optional()
    .describe("Optional visible aspect ratio label."),
  count: z.number().int().min(1).max(4).default(4).describe("Maximum images to save."),
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
    .describe("Optional prompt or direction for the variation."),
};

const variationsInputSchema = z.object(variationsInputShape);

export function registerVariationsTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_variations",
    {
      description:
        "Upload a local image to Adobe Firefly and create variations through the persistent browser session.",
      inputSchema: variationsInputShape,
      title: "Adobe Firefly Variations",
    },
    async (input) =>
      withToolErrors(deps, "firefly_variations", async () => {
        const parsed = variationsInputSchema.parse(input);
        const result = await runImageWorkflow(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_variations" }),
          "firefly_variations",
          deps.config.urls.variations,
          parsed,
        );

        return jsonToolResult({ ok: true, ...result });
      }),
  );
}
