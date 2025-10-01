import { describe, expect, it } from "vitest";
import { createLogger } from "../src/infra/logger.js";
import { createMemoryUserRepository } from "../src/infra/repo.memory.js";
import { createRateLimiter } from "../src/infra/rateLimit.js";
import { createRetryExecutor } from "../src/infra/retry.js";

const user = {
  id: "user-123",
  name: "Grace Hopper",
  email: "grace@example.com",
  age: 50,
  updatedAt: new Date("2024-01-01T00:00:00.000Z")
};

describe("memory repository idempotency", () => {
  it("prevents duplicate writes for the same idempotency key", async () => {
    const logger = createLogger("silent");
    const repo = createMemoryUserRepository({ idempotencyTtlMs: 60_000, logger });
    const rateLimiter = createRateLimiter(2);
    const retry = createRetryExecutor(
      {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        factor: 2
      },
      logger
    );

    const first = await repo.bulkUpsert([user], {
      idempotencyKey: "batch-1",
      rateLimiter,
      retry,
      failFast: false
    });

    expect(first.isOk()).toBe(true);
    expect(first._unsafeUnwrap().successes).toHaveLength(1);

    const second = await repo.bulkUpsert([user], {
      idempotencyKey: "batch-1",
      rateLimiter,
      retry,
      failFast: false
    });

    expect(second.isOk()).toBe(true);
    expect(second._unsafeUnwrap().successes).toHaveLength(1);

    const stored = await repo.findById("user-123");
    expect(stored.isOk()).toBe(true);
    expect(stored._unsafeUnwrap()).not.toBeNull();
  });
});
