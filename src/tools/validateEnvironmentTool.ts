import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { validateEnvironment } from "./validateEnvironment.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const validateEnvironmentInputShape = {
  url: z
    .string()
    .optional()
    .describe(
      "Optional URL to navigate to before validation. Defaults to current page.",
    ),
};

const validateEnvironmentInputSchema = z.object(validateEnvironmentInputShape);

export function registerValidateEnvironmentTool(
  server: McpServer,
  deps: ToolDeps,
): void {
  server.registerTool(
    "firefly_validate_environment",
    {
      description:
        "Validate the Adobe Firefly environment readiness. Checks authentication, selectors, browser health, cookies, storage, credits, and automation indicators. Returns a readiness score from 0-100.",
      inputSchema: validateEnvironmentInputShape,
      title: "Adobe Firefly Environment Validator",
    },
    async (input) =>
      withToolErrors(deps, "firefly_validate_environment", async () => {
        const parsed = validateEnvironmentInputSchema.parse(input);
        const result = await validateEnvironment(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_validate_environment" }),
          parsed,
        );

        return jsonToolResult(result);
      }),
  );
}
