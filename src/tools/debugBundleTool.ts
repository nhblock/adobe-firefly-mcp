import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runDebugBundle } from "./debugBundle.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

export function registerDebugBundleTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_debug_bundle",
    {
      description:
        "Capture a comprehensive debug bundle with 26+ diagnostic files. This is a read-only tool that never clicks Generate, uploads files, modifies settings, changes prompts, or navigates away. Use it to diagnose automation issues, validate selectors, check auth state, and inspect browser environment.",
      inputSchema: {},
      title: "Adobe Firefly Debug Bundle",
    },
    async (_input) =>
      withToolErrors(deps, "firefly_debug_bundle", async () => {
        void _input;
        const result = await runDebugBundle(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_debug_bundle" }),
          {},
        );

        return jsonToolResult(result);
      }),
  );
}
