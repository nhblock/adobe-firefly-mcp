import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveUserPath(value: string, baseDir = process.cwd()): string {
  const expanded =
    value === "~" || value.startsWith(`~${path.sep}`)
      ? path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", value.slice(1))
      : value;

  return path.resolve(
    path.isAbsolute(expanded) ? expanded : path.join(baseDir, expanded),
  );
}

export function sanitizeFilenamePart(value: string, fallback = "firefly"): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w .-]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized.length > 0 ? sanitized : fallback;
}

export async function uniqueFilePath(
  dir: string,
  basename: string,
  extension: string,
): Promise<string> {
  await ensureDirectory(dir);

  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const safeBase = sanitizeFilenamePart(basename);
  let candidate = path.join(dir, `${safeBase}${normalizedExtension}`);
  let index = 1;

  while (await pathExists(candidate)) {
    candidate = path.join(dir, `${safeBase}-${index}${normalizedExtension}`);
    index += 1;
  }

  return candidate;
}

export function timestampedBasename(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = crypto.randomBytes(3).toString("hex");
  return `${sanitizeFilenamePart(prefix)}-${timestamp}-${nonce}`;
}
