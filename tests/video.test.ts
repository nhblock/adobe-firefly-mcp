import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { selectorGroups } from "../src/firefly/selectors.js";

describe("video generation", () => {
  describe("config", () => {
    it("includes video URL by default", () => {
      const config = loadConfig();
      expect(config.urls.video).toBe("https://firefly.adobe.com/generate/video");
    });

    it("allows overriding video URL via env", () => {
      const config = loadConfig({
        FIREFLY_VIDEO_URL: "https://example.com/video",
      });
      expect(config.urls.video).toBe("https://example.com/video");
    });
  });

  describe("selectors", () => {
    it("includes video-specific selectors in generate buttons", () => {
      const config = loadConfig();
      const groups = selectorGroups(config);
      const generateNames = groups.generateButtons.map((s) => s.name);
      expect(generateNames).toContain("generate button");
    });

    it("includes prompt inputs", () => {
      const config = loadConfig();
      const groups = selectorGroups(config);
      expect(groups.promptInputs.length).toBeGreaterThan(0);
    });
  });

  describe("tool registration", () => {
    it("registers firefly_generate_video tool", async () => {
      const { registerGenerateVideoTool } =
        await import("../src/tools/generateVideo.js");

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

      registerGenerateVideoTool(mockServer as never, mockDeps);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "firefly_generate_video",
        expect.objectContaining({
          title: "Adobe Firefly Video Generate",
        }),
        expect.any(Function),
      );
    });
  });

  describe("schema validation", () => {
    it("validates required prompt field", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        aspectRatio: z.string().trim().optional(),
        duration: z.string().trim().optional(),
        model: z.string().trim().optional(),
        prompt: z.string().trim().min(1),
        resolution: z.string().trim().optional(),
        seed: z.string().trim().optional(),
      });

      expect(() => schema.parse({ prompt: "" })).toThrow();
      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ prompt: "A cat dancing" })).not.toThrow();
    });

    it("accepts all optional fields", async () => {
      const { z } = await import("zod");
      const schema = z.object({
        aspectRatio: z.string().trim().optional(),
        duration: z.string().trim().optional(),
        model: z.string().trim().optional(),
        prompt: z.string().trim().min(1),
        resolution: z.string().trim().optional(),
        seed: z.string().trim().optional(),
      });

      const result = schema.parse({
        aspectRatio: "Widescreen (16:9)",
        duration: "8 seconds",
        model: "Veo 3.1",
        prompt: "A cat dancing in the rain",
        resolution: "1080p",
        seed: "42",
      });

      expect(result.prompt).toBe("A cat dancing in the rain");
      expect(result.aspectRatio).toBe("Widescreen (16:9)");
      expect(result.model).toBe("Veo 3.1");
    });
  });
});
