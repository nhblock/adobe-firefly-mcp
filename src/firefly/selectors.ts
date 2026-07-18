import type { Locator, Page } from "playwright";

import type { AppConfig } from "../config.js";

type LocatorRoot = Page | Locator;
type AriaRole = Parameters<Page["getByRole"]>[0];

export type SelectorCandidate =
  | {
      kind: "css";
      name: string;
      selector: string;
    }
  | {
      kind: "testId";
      name: string;
      testId: string;
    }
  | {
      exact?: boolean;
      kind: "label" | "placeholder" | "text";
      name: string;
      text: RegExp | string;
    }
  | {
      kind: "role";
      name: string;
      role: AriaRole;
      text: RegExp | string;
    };

export interface SelectorGroups {
  authMarkers: SelectorCandidate[];
  dismissButtons: SelectorCandidate[];
  downloadButtons: SelectorCandidate[];
  generateButtons: SelectorCandidate[];
  promptInputs: SelectorCandidate[];
  uploadButtons: SelectorCandidate[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function selectorGroups(_config: AppConfig): SelectorGroups {
  return {
    authMarkers: selectors.shared.auth,
    dismissButtons: selectors.shared.dismiss,
    downloadButtons: selectors.shared.download,
    generateButtons: [...selectors.image.generate, ...selectors.video.generate],
    promptInputs: [...selectors.image.prompt, ...selectors.video.prompt],
    uploadButtons: selectors.shared.upload,
  };
}

export function locatorFor(root: LocatorRoot, candidate: SelectorCandidate): Locator {
  switch (candidate.kind) {
    case "css":
      return root.locator(candidate.selector);
    case "label":
      return root.getByLabel(candidate.text, { exact: candidate.exact });
    case "placeholder":
      return root.getByPlaceholder(candidate.text, { exact: candidate.exact });
    case "role":
      return root.getByRole(candidate.role, { name: candidate.text });
    case "testId":
      return root.getByTestId(candidate.testId);
    case "text":
      return root.getByText(candidate.text, { exact: candidate.exact });
  }
}

export const selectors = {
  image: {
    aspectRatio: [
      {
        kind: "role" as const,
        name: "aspect ratio button",
        role: "button" as AriaRole,
        text: /aspect ratio|widescreen|square|portrait|landscape/i,
      },
      {
        kind: "css" as const,
        name: "aspect ratio testid",
        selector: '[data-testid*="aspect-ratio" i]',
      },
      {
        kind: "css" as const,
        name: "aspect ratio aria",
        selector: '[aria-label*="aspect" i]',
      },
    ],
    contentClass: [
      {
        kind: "role" as const,
        name: "content class button",
        role: "button" as AriaRole,
        text: /photo|art|graphic|3d|painting/i,
      },
    ],
    generate: [
      {
        kind: "testId" as const,
        name: "generate button test id",
        testId: "generate-button",
      },
      {
        kind: "css" as const,
        name: "generate button data-testid",
        selector: '[data-testid="generate-button"]',
      },
      {
        kind: "role" as const,
        name: "generate button",
        role: "button" as AriaRole,
        text: /generate|create|submit|remove background|expand|apply/i,
      },
      {
        kind: "css" as const,
        name: "data generate",
        selector: '[data-testid*="generate" i]',
      },
      {
        kind: "css" as const,
        name: "aria generate",
        selector: '[aria-label*="generate" i]',
      },
      {
        kind: "css" as const,
        name: "button generate",
        selector: 'button:has-text("Generate")',
      },
      {
        kind: "css" as const,
        name: "button create",
        selector: 'button:has-text("Create")',
      },
    ],
    prompt: [
      {
        kind: "role" as const,
        name: "prompt textbox",
        role: "textbox" as AriaRole,
        text: /prompt|describe|generate/i,
      },
      {
        kind: "placeholder" as const,
        name: "prompt placeholder",
        text: /prompt|describe|imagine|create/i,
      },
      { kind: "label" as const, name: "prompt label", text: /prompt|describe/i },
      { kind: "css" as const, name: "textarea", selector: "textarea" },
      {
        kind: "css" as const,
        name: "contenteditable",
        selector: '[contenteditable="true"]',
      },
      { kind: "css" as const, name: "textbox role", selector: '[role="textbox"]' },
    ],
    style: [
      {
        kind: "role" as const,
        name: "style button",
        role: "button" as AriaRole,
        text: /style|filter|effect/i,
      },
    ],
  },
  shared: {
    auth: [
      // Only match full-screen sign-in pages, NOT header buttons
      {
        kind: "text" as const,
        name: "Adobe sign-in text",
        text: /sign in to adobe|continue to sign in/i,
      },
      {
        kind: "text" as const,
        name: "account text",
        text: /create an account|adobe account/i,
      },
      // Header sign-in button is NOT an auth indicator - it's always there
      // Removed: role "sign-in button" and "sign-in link"
    ],
    close: [
      {
        kind: "role" as const,
        name: "close button",
        role: "button" as AriaRole,
        text: /close|dismiss|got it/i,
      },
      { kind: "css" as const, name: "aria close", selector: '[aria-label*="close" i]' },
    ],
    dismiss: [
      {
        kind: "role" as const,
        name: "accept cookies",
        role: "button" as AriaRole,
        text: /accept|agree/i,
      },
      {
        kind: "role" as const,
        name: "not now",
        role: "button" as AriaRole,
        text: /not now|maybe later|skip/i,
      },
      {
        kind: "role" as const,
        name: "close dialog",
        role: "button" as AriaRole,
        text: /close|dismiss|got it/i,
      },
      { kind: "css" as const, name: "aria close", selector: '[aria-label*="close" i]' },
    ],
    download: [
      {
        kind: "role" as const,
        name: "download button",
        role: "button" as AriaRole,
        text: /download|save/i,
      },
      {
        kind: "role" as const,
        name: "download link",
        role: "link" as AriaRole,
        text: /download|save/i,
      },
      { kind: "css" as const, name: "download anchor", selector: "a[download]" },
      {
        kind: "css" as const,
        name: "aria download",
        selector: '[aria-label*="download" i]',
      },
      {
        kind: "css" as const,
        name: "data download",
        selector: '[data-testid*="download" i]',
      },
      {
        kind: "css" as const,
        name: "text download",
        selector: ':is(button, a):has-text("Download")',
      },
    ],
    loading: [
      {
        kind: "css" as const,
        name: "spinner",
        selector: '[role="progressbar"], [class*="spinner"], [class*="loading"]',
      },
      {
        kind: "css" as const,
        name: "loading overlay",
        selector:
          '[class*="overlay"][class*="loading"], [class*="loading"][class*="overlay"]',
      },
    ],
    upload: [
      {
        kind: "role" as const,
        name: "upload button",
        role: "button" as AriaRole,
        text: /upload|choose|select|browse/i,
      },
      {
        kind: "role" as const,
        name: "upload link",
        role: "link" as AriaRole,
        text: /upload|choose|select|browse/i,
      },
      {
        kind: "css" as const,
        name: "data upload",
        selector: '[data-testid*="upload" i]',
      },
      {
        kind: "css" as const,
        name: "aria upload",
        selector: '[aria-label*="upload" i]',
      },
      {
        kind: "css" as const,
        name: "text upload",
        selector: ':is(button, a):has-text("Upload")',
      },
      { kind: "css" as const, name: "file input", selector: 'input[type="file"]' },
    ],
  },
  video: {
    cancel: [
      {
        kind: "role" as const,
        name: "cancel button",
        role: "button" as AriaRole,
        text: /cancel|stop/i,
      },
      {
        kind: "css" as const,
        name: "cancel testid",
        selector: '[data-testid*="cancel" i]',
      },
    ],
    download: [
      {
        kind: "css" as const,
        name: "media timeline download testid",
        selector: '[data-testid="firefly-media-timeline-download-button"]',
      },
      {
        kind: "css" as const,
        name: "download video aria",
        selector: '[aria-label="Download Video"]',
      },
      {
        kind: "css" as const,
        name: "sp-action-button download",
        selector: 'sp-action-button[aria-label*="Download"]',
      },
      {
        kind: "css" as const,
        name: "download video container",
        selector: ".download-video-container",
      },
      {
        kind: "role" as const,
        name: "download button",
        role: "button" as AriaRole,
        text: /download|save/i,
      },
      {
        kind: "css" as const,
        name: "aria download",
        selector: '[aria-label*="download" i]',
      },
    ],
    duration: [
      {
        kind: "css" as const,
        name: "duration picker",
        selector: '[data-testid="firefly-picker-duration"]',
      },
      {
        kind: "role" as const,
        name: "duration button",
        role: "button" as AriaRole,
        text: /duration|seconds/i,
      },
    ],
    fps: [
      {
        kind: "css" as const,
        name: "fps picker",
        selector: '[data-testid="firefly-picker-fps"]',
      },
      {
        kind: "role" as const,
        name: "fps button",
        role: "button" as AriaRole,
        text: /fps|frames per second/i,
      },
    ],
    generate: [
      {
        kind: "css" as const,
        name: "video generate testid",
        selector: '[data-testid="video-generation-generate-button"]',
      },
      {
        kind: "role" as const,
        name: "generate button",
        role: "button" as AriaRole,
        text: /generate/i,
      },
      {
        kind: "css" as const,
        name: "aria generate",
        selector: '[aria-label="Generate"]',
      },
    ],
    model: [
      {
        kind: "css" as const,
        name: "model picker",
        selector: '[data-testid="firefly-picker-model"]',
      },
      {
        kind: "role" as const,
        name: "model button",
        role: "button" as AriaRole,
        text: /model|veo/i,
      },
    ],
    progress: [
      {
        kind: "css" as const,
        name: "progress spinner",
        selector: '[role="progressbar"]',
      },
      {
        kind: "css" as const,
        name: "generation card",
        selector: '[data-testid*="generation"][data-testid*="card"]',
      },
      {
        kind: "css" as const,
        name: "loading indicator",
        selector: '[class*="loading"], [class*="spinner"]',
      },
    ],
    prompt: [
      {
        kind: "css" as const,
        name: "video prompt textarea",
        selector: 'textarea[aria-label="Prompt"]',
      },
      {
        kind: "css" as const,
        name: "video prompt placeholder",
        selector: 'textarea[placeholder*="Describe"]',
      },
      {
        kind: "role" as const,
        name: "prompt textbox",
        role: "textbox" as AriaRole,
        text: /prompt|describe|generate/i,
      },
      {
        kind: "placeholder" as const,
        name: "prompt placeholder",
        text: /prompt|describe|imagine|create/i,
      },
    ],
    resolution: [
      {
        kind: "css" as const,
        name: "resolution picker",
        selector: '[data-testid="firefly-picker-resolution"]',
      },
      {
        kind: "role" as const,
        name: "resolution button",
        role: "button" as AriaRole,
        text: /resolution|720p|1080p/i,
      },
    ],
    seed: [
      {
        kind: "css" as const,
        name: "seed input",
        selector: 'input[aria-label="Seed"]',
      },
      { kind: "label" as const, name: "seed label", text: /seed/i },
    ],
    aspectRatio: [
      {
        kind: "css" as const,
        name: "aspect ratio picker",
        selector: '[data-testid="firefly-picker-aspect-ratio"]',
      },
      {
        kind: "role" as const,
        name: "aspect ratio button",
        role: "button" as AriaRole,
        text: /aspect ratio|widescreen|square/i,
      },
    ],
  },
};

export function optionalCss(
  name: string,
  selector: string | undefined,
): SelectorCandidate[] {
  return selector === undefined ? [] : [{ kind: "css", name, selector }];
}
