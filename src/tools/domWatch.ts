import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runDomWatch } from "../firefly/domWatch.js";
import { jsonToolResult, type ToolDeps, withToolErrors } from "./shared.js";

const domWatchInputShape = {
  maxMutations: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum mutations to capture"),
  mutations: z
    .array(z.enum(["attributes", "characterData", "childList"]))
    .default(["childList", "attributes"])
    .describe("Types of mutations to observe"),
  targetSelector: z
    .string()
    .optional()
    .describe("Optional: only watch mutations in this subtree"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .default(60_000)
    .describe("Watch duration in milliseconds"),
};

const domWatchInputSchema = z.object(domWatchInputShape);

export function registerDomWatchTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "firefly_dom_watch",
    {
      description:
        "Watch for DOM mutations in Adobe Firefly. Reports when elements appear, disappear, or attributes change. Useful for knowing exactly when buttons load or spinners disappear.",
      inputSchema: domWatchInputShape,
      title: "Adobe Firefly DOM Watcher",
    },
    async (input) =>
      withToolErrors(deps, "firefly_dom_watch", async () => {
        const parsed = domWatchInputSchema.parse(input);
        const result = await runDomWatch(
          deps.browser,
          deps.config,
          deps.logger.child({ tool: "firefly_dom_watch" }),
          parsed,
        );

        return jsonToolResult(result);
      }),
  );
}
