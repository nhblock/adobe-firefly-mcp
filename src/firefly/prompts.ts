export interface PromptParts {
  contentClass?: string;
  negativePrompt?: string;
  prompt: string;
  style?: string;
}

export function composePrompt(parts: PromptParts): string {
  const lines = [parts.prompt.trim()];

  if (parts.style !== undefined && parts.style.trim().length > 0) {
    lines.push(`Style: ${parts.style.trim()}`);
  }

  if (parts.contentClass !== undefined && parts.contentClass.trim().length > 0) {
    lines.push(`Content type: ${parts.contentClass.trim()}`);
  }

  if (parts.negativePrompt !== undefined && parts.negativePrompt.trim().length > 0) {
    lines.push(`Avoid: ${parts.negativePrompt.trim()}`);
  }

  return lines.join("\n");
}

export function shortPromptLabel(prompt: string): string {
  return prompt.trim().split(/\s+/u).slice(0, 8).join(" ") || "firefly";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
