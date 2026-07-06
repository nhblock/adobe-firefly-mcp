import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runVideoGenerate } from "../firefly/video.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const generateVideoInputShape = {
  aspectRatio: z
    .string()
    .trim()
    .optional()
    .describe('Optional aspect ratio, such as "Widescreen (16:9)" or "Square (1:1)".'),
  cameraMotion: z
    .string()
    .trim()
    .optional()
    .describe("Optional camera motion style, if supported by the model."),
  duration: z
    .string()
    .trim()
    .optional()
    .describe('Optional video duration, such as "4 seconds" or "8 seconds".'),
  model: z
    .string()
    .trim()
    .optional()
    .describe('Optional model selection, such as "Veo 3.1" or "Veo 3.1 Fast".'),
  outputDir: z
    .string()
    .trim()
    .optional()
    .describe(
      "Optional output directory. Relative paths resolve under the MCP data dir.",
    ),
  prompt: z.string().trim().min(1).describe("Video prompt to send to Adobe Firefly."),
  resolution: z
    .string()
    .trim()
    .optional()
    .describe('Optional resolution, such as "720p" or "1080p".'),
  seed: z
    .string()
    .trim()
    .optional()
    .describe("Optional seed value for reproducible generation."),
  visualStyle: z
    .string()
    .trim()
    .optional()
    .describe("Optional visual style, if supported by the model."),
};

const generateVideoInputSchema = z.object(generateVideoInputShape);

export function registerGenerateVideoTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_generate_video",
    {
      description:
        "Generate videos in Adobe Firefly using the existing persistent browser session. Requires manual Adobe sign-in in the browser profile.",
      inputSchema: generateVideoInputShape,
      title: "Adobe Firefly Video Generate",
    },
    async (input) =>
      withToolErrors(deps, "firefly_generate_video", async () => {
        const parsed = generateVideoInputSchema.parse(input);
        const result = await runVideoGenerate(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_generate_video" }),
          parsed,
        );

        return jsonToolResult({
          ok: true,
          ...result,
        });
      }),
  );
}
