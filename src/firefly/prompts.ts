export function shortPromptLabel(prompt: string): string {
  return prompt.trim().split(/\s+/u).slice(0, 8).join(" ") || "firefly";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
