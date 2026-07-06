import { describe, expect, it, vi } from "vitest";

import { retry } from "../src/utils/retry.js";

describe("retry", () => {
  it("returns the first successful attempt", async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<number>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(42);

    await expect(retry(operation, { attempts: 3, delayMs: 1 })).resolves.toBe(42);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenNthCalledWith(1, 1);
    expect(operation).toHaveBeenNthCalledWith(2, 2);
  });

  it("stops when shouldRetry returns false", async () => {
    const error = new Error("permanent");
    const operation = vi.fn<(attempt: number) => Promise<never>>(() =>
      Promise.reject(error),
    );

    await expect(
      retry(operation, {
        attempts: 3,
        delayMs: 1,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("permanent");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
