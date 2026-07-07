import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runDebugBundle } from "./debugBundle.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const debugBundleInputShape = {
  url: z
    .string()
    .optional()
    .describe(
      "Optional URL to navigate to before capturing debug bundle. Defaults to Firefly home page.",
    ),
};

const debugBundleInputSchema = z.object(debugBundleInputShape);

export function registerDebugBundleTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_debug_bundle",
    {
      description:
        "Capture a comprehensive debug bundle with 26+ diagnostic files. This is a read-only tool that never clicks Generate, uploads files, modifies settings, changes prompts, or navigates away. Use it to diagnose automation issues, validate selectors, check auth state, and inspect browser environment.",
      inputSchema: debugBundleInputShape,
      title: "Adobe Firefly Debug Bundle",
    },
    async (input) =>
      withToolErrors(deps, "firefly_debug_bundle", async () => {
        const parsed = debugBundleInputSchema.parse(input);
        const result = await runDebugBundle(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_debug_bundle" }),
          parsed,
        );

        return jsonToolResult(result);
      }),
  );
}
