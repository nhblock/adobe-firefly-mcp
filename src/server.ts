#!/usr/bin/env node
import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { BrowserManager } from "./browser.js";
import { loadConfig, SERVER_NAME, SERVER_VERSION, type AppConfig } from "./config.js";
import { Logger } from "./logger.js";
import { registerDomInspectTool } from "./tools/domInspect.js";
import { registerDomWatchTool } from "./tools/domWatch.js";
import { registerExpandTool } from "./tools/expand.js";
import { registerGenerateTool } from "./tools/generate.js";
import { registerGenerateVideoTool } from "./tools/generateVideo.js";
import { registerRemoveBackgroundTool } from "./tools/removeBackground.js";
import { type ToolDeps } from "./tools/shared.js";
import { registerDebugBundleTool } from "./tools/debugBundleTool.js";
import { registerStatusTool } from "./tools/status.js";
import { registerVariationsTool } from "./tools/variations.js";

export interface ServerRuntime {
  browser: BrowserManager;
  config: AppConfig;
  logger: Logger;
  server: McpServer;
}

export function createRuntime(config = loadConfig()): ServerRuntime {
  const logger = new Logger(config.logLevel, { server: SERVER_NAME });
  const browser = new BrowserManager(config, logger.child({ component: "browser" }));
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const deps: ToolDeps = {
    browser,
    config,
    logger: logger.child({ component: "tool" }),
  };

  registerDomInspectTool(server, deps);
  registerDomWatchTool(server, deps);
  registerDebugBundleTool(server, deps);
  registerGenerateTool(server, deps);
  registerGenerateVideoTool(server, deps);
  registerVariationsTool(server, deps);
  registerExpandTool(server, deps);
  registerRemoveBackgroundTool(server, deps);
  registerStatusTool(server, deps);

  return { browser, config, logger, server };
}

async function main(): Promise<void> {
  const runtime = createRuntime();
  installShutdownHandlers(runtime);

  const transport = new StdioServerTransport();
  await runtime.server.connect(transport);
  runtime.logger.info("MCP server running on stdio");
}

function installShutdownHandlers(runtime: ServerRuntime): void {
  let closing = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) {
      return;
    }

    closing = true;
    runtime.logger.info("Shutting down", { signal });
    await runtime.browser.close().catch((error: unknown) => {
      runtime.logger.warn("Browser close failed during shutdown", { error });
    });
    process.exit(0);
  };

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });
  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });
}

main().catch((error: unknown) => {
  const logger = new Logger("error", { server: SERVER_NAME });
  logger.error("Fatal server error", { error });
  process.exit(1);
});
