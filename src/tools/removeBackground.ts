import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runImageWorkflow } from "../firefly/generate.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const removeBackgroundInputShape = {
  count: z.number().int().min(1).max(4).default(1).describe("Maximum images to save."),
  imagePath: z
    .string()
    .trim()
    .min(1)
    .describe("Local source image path. Relative paths resolve from the server cwd."),
  outputDir: z.string().trim().optional().describe("Optional output directory."),
};

const removeBackgroundInputSchema = z.object(removeBackgroundInputShape);

export function registerRemoveBackgroundTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_remove_background",
    {
      description:
        "Use Adobe Firefly's browser UI to remove the background from a local image and save the result.",
      inputSchema: removeBackgroundInputShape,
      title: "Adobe Firefly Remove Background",
    },
    async (input) =>
      withToolErrors(deps, "firefly_remove_background", async () => {
        const parsed = removeBackgroundInputSchema.parse(input);
        const result = await runImageWorkflow(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_remove_background" }),
          "firefly_remove_background",
          deps.config.urls.removeBackground,
          parsed,
        );

        return jsonToolResult({ ok: true, ...result });
      }),
  );
}
