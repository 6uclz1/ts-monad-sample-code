import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/app/pipeline.js";
import { createLogger } from "../src/infra/logger.js";
import { createMemoryUserRepository } from "../src/infra/repo.memory.js";
import { createRateLimiter } from "../src/infra/rateLimit.js";
import { createRetryExecutor } from "../src/infra/retry.js";
import { Config } from "../src/config.js";

const baseConfig: Config = {
  concurrency: 2,
  failFast: false,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 5,
    factor: 2
  },
  idempotencyTtlMs: 60_000,
  bulkFailFast: false,
  logLevel: "silent"
};

const createDeps = () => {
  const logger = createLogger("silent");
  const repo = createMemoryUserRepository({ idempotencyTtlMs: baseConfig.idempotencyTtlMs, logger });
  const rateLimiter = createRateLimiter(baseConfig.concurrency);
  const retry = createRetryExecutor(baseConfig.retry, logger);

  return {
    config: baseConfig,
    logger,
    repo,
    rateLimiter,
    retry
  } as const;
};

describe("pipeline integration", () => {
  it("processes CSV input and persists users", async () => {
    const csv = Readable.from([
      [
        "id,name,email,age,updatedAt",
        "1,Ada Lovelace,ada@example.com,36,2024-01-01T00:00:00.000Z",
        "2,Alan Turing,alan@example.com,41,2024-01-02T00:00:00.000Z"
      ].join("\n") + "\n"
    ]);

    const deps = createDeps();

    const result = await runPipeline(
      {
        source: csv,
        idempotencyKey: "batch-1"
      },
      deps
    );

    expect(result.isOk()).toBe(true);
    result.map((output) => {
      expect(output.stats.persisted).toBe(2);
      expect(output.errors).toHaveLength(0);
      expect(output.skipped).toHaveLength(0);
      expect(output.report).toContain("Persisted successfully: 2");
    });
  });

  it("fails fast on validation error when configured", async () => {
    const csv = Readable.from([
      [
        "id,name,email,age,updatedAt",
        "1,Ada Lovelace,not-an-email,36,2024-01-01T00:00:00.000Z"
      ].join("\n") + "\n"
    ]);

    const deps = createDeps();

    const result = await runPipeline(
      {
        source: csv,
        idempotencyKey: "batch-2",
        failFast: true
      },
      deps
    );

    expect(result.isErr()).toBe(true);
  });
});
