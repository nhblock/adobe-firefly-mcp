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

export function selectorGroups(config: AppConfig): SelectorGroups {
  return {
    authMarkers: [
      { kind: "role", name: "sign-in button", role: "button", text: /sign in|log in/i },
      { kind: "role", name: "sign-in link", role: "link", text: /sign in|log in/i },
      {
        kind: "text",
        name: "Adobe sign-in text",
        text: /sign in to adobe|continue to sign in|log in/i,
      },
      { kind: "text", name: "account text", text: /create an account|adobe account/i },
    ],
    dismissButtons: [
      { kind: "role", name: "accept cookies", role: "button", text: /accept|agree/i },
      {
        kind: "role",
        name: "not now",
        role: "button",
        text: /not now|maybe later|skip/i,
      },
      {
        kind: "role",
        name: "close dialog",
        role: "button",
        text: /close|dismiss|got it/i,
      },
      { kind: "css", name: "aria close", selector: '[aria-label*="close" i]' },
    ],
    downloadButtons: [
      ...optionalCss("download override", config.selectors.downloadButton),
      { kind: "role", name: "download button", role: "button", text: /download|save/i },
      { kind: "role", name: "download link", role: "link", text: /download|save/i },
      { kind: "css", name: "download anchor", selector: "a[download]" },
      { kind: "css", name: "aria download", selector: '[aria-label*="download" i]' },
      { kind: "css", name: "data download", selector: '[data-testid*="download" i]' },
      {
        kind: "css",
        name: "text download",
        selector: ':is(button, a):has-text("Download")',
      },
    ],
    generateButtons: [
      { kind: "testId", name: "generate button test id", testId: "generate-button" },
      {
        kind: "css",
        name: "generate button data-testid",
        selector: '[data-testid="generate-button"]',
      },
      ...optionalCss("generate override", config.selectors.generateButton),
      {
        kind: "role",
        name: "generate button",
        role: "button",
        text: /generate|create|submit|remove background|expand|apply/i,
      },
      { kind: "css", name: "data generate", selector: '[data-testid*="generate" i]' },
      { kind: "css", name: "aria generate", selector: '[aria-label*="generate" i]' },
      { kind: "css", name: "button generate", selector: 'button:has-text("Generate")' },
      { kind: "css", name: "button create", selector: 'button:has-text("Create")' },
    ],
    promptInputs: [
      ...optionalCss("prompt override", config.selectors.promptInput),
      {
        kind: "role",
        name: "prompt textbox",
        role: "textbox",
        text: /prompt|describe|generate/i,
      },
      {
        kind: "placeholder",
        name: "prompt placeholder",
        text: /prompt|describe|imagine|create/i,
      },
      { kind: "label", name: "prompt label", text: /prompt|describe/i },
      { kind: "css", name: "textarea", selector: "textarea" },
      { kind: "css", name: "contenteditable", selector: '[contenteditable="true"]' },
      { kind: "css", name: "textbox role", selector: '[role="textbox"]' },
    ],
    uploadButtons: [
      ...optionalCss("upload override", config.selectors.uploadButton),
      {
        kind: "role",
        name: "upload button",
        role: "button",
        text: /upload|choose|select|browse/i,
      },
      {
        kind: "role",
        name: "upload link",
        role: "link",
        text: /upload|choose|select|browse/i,
      },
      { kind: "css", name: "data upload", selector: '[data-testid*="upload" i]' },
      { kind: "css", name: "aria upload", selector: '[aria-label*="upload" i]' },
      {
        kind: "css",
        name: "text upload",
        selector: ':is(button, a):has-text("Upload")',
      },
    ],
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

function optionalCss(name: string, selector: string | undefined): SelectorCandidate[] {
  return selector === undefined ? [] : [{ kind: "css", name, selector }];
}
