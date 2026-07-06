import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runTextToImage } from "../firefly/generate.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const generateInputShape = {
  aspectRatio: z
    .string()
    .trim()
    .optional()
    .describe('Optional Firefly aspect ratio label, such as "1:1" or "16:9".'),
  contentClass: z
    .string()
    .trim()
    .optional()
    .describe('Optional Firefly content type/control label, such as "Photo" or "Art".'),
  count: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(4)
    .describe("Maximum number of generated images to save."),
  negativePrompt: z.string().trim().optional().describe("Optional things to avoid."),
  outputDir: z
    .string()
    .trim()
    .optional()
    .describe(
      "Optional output directory. Relative paths resolve under the MCP data dir.",
    ),
  prompt: z.string().trim().min(1).describe("Image prompt to send to Adobe Firefly."),
  style: z
    .string()
    .trim()
    .optional()
    .describe("Optional visible Firefly style/control label to try to select."),
};

const generateInputSchema = z.object(generateInputShape);

export function registerGenerateTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_generate",
    {
      description:
        "Generate images in Adobe Firefly using the existing persistent browser session. Requires manual Adobe sign-in in the browser profile.",
      inputSchema: generateInputShape,
      title: "Adobe Firefly Generate",
    },
    async (input) =>
      withToolErrors(deps, "firefly_generate", async () => {
        const parsed = generateInputSchema.parse(input);
        const result = await runTextToImage(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_generate" }),
          parsed,
        );

        return jsonToolResult({
          ok: true,
          ...result,
        });
      }),
  );
}
