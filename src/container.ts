import { Result, err, ok } from "neverthrow";
import { loadConfig } from "./config.js";
import { createLogger, AppLogger } from "./infra/logger.js";
import { createRateLimiter, RateLimiter } from "./infra/rateLimit.js";
import { createRetryExecutor, RetryExecutor } from "./infra/retry.js";
import { createMemoryUserRepository, MemoryUserRepository } from "./infra/repo.memory.js";
import { AppError } from "./app/errors.js";
import { Config } from "./config.js";

export type AppContainer = {
  readonly config: Config;
  readonly logger: AppLogger;
  readonly rateLimiter: RateLimiter;
  readonly retry: RetryExecutor;
  readonly repo: MemoryUserRepository;
};

export const createContainer = (): Result<AppContainer, AppError> =>
  loadConfig().map((config) => {
    const logger = createLogger(config.logLevel);
    const rateLimiter = createRateLimiter(config.concurrency);
    const retry = createRetryExecutor(config.retry, logger);
    const repo = createMemoryUserRepository({
      idempotencyTtlMs: config.idempotencyTtlMs,
      logger
    });

    return { config, logger, rateLimiter, retry, repo } satisfies AppContainer;
  });
