#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 60000,
): Promise<void> {
  console.log(`\n=== Testing ${toolName} ===`);
  try {
    const result = await client.callTool(
      { name: toolName, arguments: args },
      { timeout: timeoutMs },
    );
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error:`, err);
  }
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  console.log("Connected to MCP server");

  // Test 1: firefly_status (no browser)
  await testTool(client, "firefly_status", { openBrowser: false });

  // Test 2: firefly_status (with browser)
  await testTool(client, "firefly_status", { openBrowser: true, screenshot: true });

  // Test 3: firefly_generate
  await testTool(client, "firefly_generate", {
    prompt: "A red flower in a garden",
    count: 1,
  });

  // Test 4: firefly_generate_video (with longer timeout)
  await testTool(
    client,
    "firefly_generate_video",
    {
      prompt: "A cat playing in the garden",
      duration: "4 seconds",
    },
    180000,
  );

  // Test 5: firefly_variations (requires image)
  // await testTool(client, "firefly_variations", {
  //   imagePath: "test-image.jpg",
  //   count: 2,
  // });

  // Test 6: firefly_expand (requires image)
  // await testTool(client, "firefly_expand", {
  //   imagePath: "test-image.jpg",
  //   count: 1,
  // });

  // Test 7: firefly_remove_background (requires image)
  // await testTool(client, "firefly_remove_background", {
  //   imagePath: "test-image.jpg",
  //   count: 1,
  // });

  await client.close();
  console.log("\n=== All tests completed ===");
}

main().catch(console.error);
