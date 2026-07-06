import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { BrowserManager } from "../browser.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";

export interface ToolDeps {
  browser: BrowserManager;
  config: AppConfig;
  logger: Logger;
}

export type ToolResult = CallToolResult;

export function jsonToolResult(value: unknown): ToolResult {
  return {
    content: [
      {
        text: JSON.stringify(value, null, 2),
        type: "text",
      },
    ],
  };
}

export async function withToolErrors(
  deps: ToolDeps,
  toolName: string,
  operation: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    deps.logger.info("Tool started", { toolName });
    const result = await operation();
    deps.logger.info("Tool completed", { toolName });
    return result;
  } catch (error) {
    deps.logger.error("Tool failed", { error, toolName });
    return {
      content: [
        {
          text: JSON.stringify(
            {
              error: errorMessage(error),
              ok: false,
              tool: toolName,
            },
            null,
            2,
          ),
          type: "text",
        },
      ],
      isError: true,
    };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
