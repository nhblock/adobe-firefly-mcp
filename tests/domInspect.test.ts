import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { RingBuffer } from "../src/utils/ringBuffer.js";

describe("DOM inspector", () => {
  describe("RingBuffer", () => {
    it("stores and retrieves items", () => {
      const buf = new RingBuffer<number>(3);
      buf.add(1);
      buf.add(2);
      buf.add(3);

      expect(buf.toArray()).toEqual([1, 2, 3]);
      expect(buf.size).toBe(3);
    });

    it("overwrites oldest items when full", () => {
      const buf = new RingBuffer<number>(2);
      buf.add(1);
      buf.add(2);
      buf.add(3);

      expect(buf.toArray()).toEqual([2, 3]);
      expect(buf.size).toBe(2);
    });

    it("respects limit parameter", () => {
      const buf = new RingBuffer<number>(5);
      buf.add(1);
      buf.add(2);
      buf.add(3);
      buf.add(4);
      buf.add(5);

      expect(buf.toArray(3)).toEqual([3, 4, 5]);
    });

    it("clears buffer", () => {
      const buf = new RingBuffer<number>(3);
      buf.add(1);
      buf.add(2);
      buf.clear();

      expect(buf.toArray()).toEqual([]);
      expect(buf.size).toBe(0);
    });
  });

  describe("tool registration", () => {
    it("registers firefly_dom_inspect tool", async () => {
      const { registerDomInspectTool } = await import("../src/tools/domInspect.js");

      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockDeps = {
        browser: {} as never,
        config: loadConfig(),
        logger: {
          child: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
          }),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
      };

      registerDomInspectTool(mockServer as never, mockDeps);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "firefly_dom_inspect",
        expect.objectContaining({
          title: "Adobe Firefly DOM Inspector",
        }),
        expect.any(Function),
      );
    });

    it("registers firefly_dom_watch tool", async () => {
      const { registerDomWatchTool } = await import("../src/tools/domWatch.js");

      const mockServer = {
        registerTool: vi.fn(),
      };

      const mockDeps = {
        browser: {} as never,
        config: loadConfig(),
        logger: {
          child: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
          }),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
      };

      registerDomWatchTool(mockServer as never, mockDeps);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "firefly_dom_watch",
        expect.objectContaining({
          title: "Adobe Firefly DOM Watcher",
        }),
        expect.any(Function),
      );
    });
  });

  describe("schema validation", () => {
    it("validates mode enum", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        mode: z.enum(["full", "selector", "shadow", "accessibility", "tree"]),
      });

      expect(() => schema.parse({ mode: "invalid" })).toThrow();
      expect(() => schema.parse({ mode: "full" })).not.toThrow();
      expect(() => schema.parse({ mode: "selector" })).not.toThrow();
    });

    it("accepts all optional fields", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        captureElementScreenshots: z.boolean().optional(),
        includeAccessibility: z.boolean().optional(),
        includeConsole: z.boolean().optional(),
        maxConsoleMessages: z.number().int().optional(),
        maxDepth: z.number().int().optional(),
        mode: z.enum(["full", "selector", "shadow", "accessibility", "tree"]),
        selector: z.string().optional(),
      });

      const result = schema.parse({
        captureElementScreenshots: true,
        includeAccessibility: false,
        includeConsole: true,
        maxConsoleMessages: 100,
        maxDepth: 5,
        mode: "selector",
        selector: "[data-testid='generate-button']",
      });

      expect(result.mode).toBe("selector");
      expect(result.selector).toBe("[data-testid='generate-button']");
    });
  });

  describe("config", () => {
    it("loads default config", () => {
      const config = loadConfig();
      expect(config.dataDir).toBeDefined();
      expect(config.downloadsDir).toBeDefined();
    });
  });
});
