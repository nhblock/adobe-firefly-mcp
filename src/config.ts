import path from "node:path";
import process from "node:process";

export const SERVER_NAME = "adobe-firefly-mcp";
export const SERVER_VERSION = "0.1.0";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface FireflyUrls {
  base: string;
  expand: string;
  removeBackground: string;
  textToImage: string;
  variations: string;
}

export interface SelectorOverrides {
  downloadButton?: string;
  generateButton?: string;
  promptInput?: string;
  uploadButton?: string;
}

export interface AppConfig {
  dataDir: string;
  downloadsDir: string;
  generationTimeoutMs: number;
  headless: boolean;
  launchSlowMoMs: number;
  logLevel: LogLevel;
  maxDownloads: number;
  navigationTimeoutMs: number;
  operationTimeoutMs: number;
  profileDir: string;
  selectors: SelectorOverrides;
  urls: FireflyUrls;
}

const DEFAULT_OPERATION_TIMEOUT_MS = 180_000;
const DEFAULT_GENERATION_TIMEOUT_MS = 300_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_DOWNLOADS = 4;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = resolveMaybeRelative(
    readString(env, "FIREFLY_MCP_DATA_DIR") ?? process.cwd(),
    process.cwd(),
  );

  const downloadsDir = resolveMaybeRelative(
    readString(env, "FIREFLY_DOWNLOADS_DIR") ?? path.join(dataDir, "downloads"),
    dataDir,
  );
  const profileDir = resolveMaybeRelative(
    readString(env, "FIREFLY_PROFILE_DIR") ?? path.join(dataDir, "profile"),
    dataDir,
  );

  const baseUrl = trimTrailingSlash(
    readString(env, "FIREFLY_BASE_URL") ?? "https://firefly.adobe.com",
  );

  return {
    dataDir,
    downloadsDir,
    generationTimeoutMs: readInteger(
      env,
      "FIREFLY_GENERATION_TIMEOUT_MS",
      DEFAULT_GENERATION_TIMEOUT_MS,
    ),
    headless: readBoolean(env, "FIREFLY_HEADLESS", false),
    launchSlowMoMs: readInteger(env, "FIREFLY_SLOW_MO_MS", 0),
    logLevel: readLogLevel(env, "FIREFLY_LOG_LEVEL", "info"),
    maxDownloads: readInteger(env, "FIREFLY_MAX_DOWNLOADS", DEFAULT_MAX_DOWNLOADS),
    navigationTimeoutMs: readInteger(
      env,
      "FIREFLY_NAVIGATION_TIMEOUT_MS",
      DEFAULT_NAVIGATION_TIMEOUT_MS,
    ),
    operationTimeoutMs: readInteger(
      env,
      "FIREFLY_OPERATION_TIMEOUT_MS",
      DEFAULT_OPERATION_TIMEOUT_MS,
    ),
    profileDir,
    selectors: {
      downloadButton: readString(env, "FIREFLY_SELECTOR_DOWNLOAD_BUTTON"),
      generateButton: readString(env, "FIREFLY_SELECTOR_GENERATE_BUTTON"),
      promptInput: readString(env, "FIREFLY_SELECTOR_PROMPT_INPUT"),
      uploadButton: readString(env, "FIREFLY_SELECTOR_UPLOAD_BUTTON"),
    },
    urls: {
      base: baseUrl,
      expand:
        readString(env, "FIREFLY_EXPAND_URL") ?? `${baseUrl}/tools/generative-expand`,
      removeBackground:
        readString(env, "FIREFLY_REMOVE_BACKGROUND_URL") ??
        `${baseUrl}/tools/remove-background`,
      textToImage:
        readString(env, "FIREFLY_TEXT_TO_IMAGE_URL") ?? `${baseUrl}/generate/images`,
      variations: readString(env, "FIREFLY_VARIATIONS_URL") ?? baseUrl,
    },
  };
}

function readString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readBoolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = readString(env, name);
  if (value === undefined) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  return fallback;
}

function readInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = readString(env, name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readLogLevel(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: LogLevel,
): LogLevel {
  const value = readString(env, name);
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "silent"
  ) {
    return value;
  }

  return fallback;
}

function resolveMaybeRelative(value: string, baseDir: string): string {
  return path.resolve(path.isAbsolute(value) ? value : path.join(baseDir, value));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
