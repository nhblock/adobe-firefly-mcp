export interface RetryOptions {
  attempts: number;
  delayMs: number;
  factor?: number;
  onRetry?: (error: unknown, attempt: number) => void;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const factor = options.factor ?? 1;
  let delayMs = options.delayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < options.attempts && (options.shouldRetry?.(error) ?? true);

      if (!canRetry) {
        throw error;
      }

      options.onRetry?.(error, attempt);
      await sleep(delayMs);
      delayMs *= factor;
    }
  }

  throw lastError;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
