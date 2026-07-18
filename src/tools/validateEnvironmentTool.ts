import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateEnvironment } from "./validateEnvironment.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

export function registerValidateEnvironmentTool(
  server: McpServer,
  deps: ToolDeps,
): void {
  server.registerTool(
    "firefly_validate_environment",
    {
      description:
        "Validate the Adobe Firefly environment readiness. Checks authentication, selectors, browser health, cookies, storage, credits, and automation indicators. Returns a readiness score from 0-100.",
      inputSchema: {},
      title: "Adobe Firefly Environment Validator",
    },
    async (_input) =>
      withToolErrors(deps, "firefly_validate_environment", async () => {
        void _input;
        const result = await validateEnvironment(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_validate_environment" }),
          {},
        );

        return jsonToolResult(result);
      }),
  );
}
