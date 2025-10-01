import { describe, expect, it, vi } from "vitest";
import { okAsync, errAsync } from "neverthrow";
import { createRetryExecutor } from "../src/infra/retry.js";
import { createLogger } from "../src/infra/logger.js";
import { createRepoError } from "../src/app/errors.js";

describe("retry executor", () => {
  it("retries until success", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const logger = createLogger("silent");
    const retry = createRetryExecutor(
      {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 50,
        factor: 2
      },
      logger
    );

    let attempts = 0;

    const resultPromise = retry(() => {
      attempts += 1;
      return attempts === 1
        ? errAsync(
            createRepoError({
              code: "REPO_WRITE_FAILED",
              message: "boom"
            })
          )
        : okAsync("ok");
    }, { operationName: "test" });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(attempts).toBe(2);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("ok");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("propagates final error after max attempts", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const logger = createLogger("silent");
    const retry = createRetryExecutor(
      {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 2,
        factor: 2
      },
      logger
    );

    const resultPromise = retry(() =>
      errAsync(
        createRepoError({
          code: "REPO_WRITE_FAILED",
          message: "still failing"
        })
      )
    );

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.isErr()).toBe(true);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
