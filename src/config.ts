import { z } from "zod";
import { Result, ok, err } from "neverthrow";
import { AppError, createConfigError } from "./app/errors.js";
import { loadEnvironmentVariables } from "./env.js";

export type RetryConfig = {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor: number;
};

export type Config = {
  readonly concurrency: number;
  readonly failFast: boolean;
  readonly retry: RetryConfig;
  readonly idempotencyTtlMs: number;
  readonly bulkFailFast: boolean;
  readonly logLevel: string;
};

const booleanString = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value === "true" || value === "1" || value === "yes");

const numberFromString = (schema = z.number().int().nonnegative()) =>
  z
    .string()
    .trim()
    .transform((value) => Number(value))
    .pipe(schema);

const configSchema = z.object({
  CONCURRENCY: numberFromString(z.number().int().positive()),
  FAIL_FAST: booleanString,
  RETRY_MAX_ATTEMPTS: numberFromString(z.number().int().min(1)),
  RETRY_BASE_DELAY_MS: numberFromString(z.number().int().min(0)),
  RETRY_MAX_DELAY_MS: numberFromString(z.number().int().min(0)),
  RETRY_FACTOR: numberFromString(z.number().min(1)),
  IDEMPOTENCY_TTL_MS: numberFromString(z.number().int().min(0)),
  BULK_FAIL_FAST: booleanString,
  LOG_LEVEL: z.string().trim().min(1)
});

export const loadConfig = (): Result<Config, AppError> =>
  loadEnvironmentVariables().andThen((candidate) => {
    const parsed = configSchema.safeParse(candidate);

    return parsed.success
      ? ok({
          concurrency: parsed.data.CONCURRENCY,
          failFast: parsed.data.FAIL_FAST,
          retry: {
            maxAttempts: parsed.data.RETRY_MAX_ATTEMPTS,
            baseDelayMs: parsed.data.RETRY_BASE_DELAY_MS,
            maxDelayMs: parsed.data.RETRY_MAX_DELAY_MS,
            factor: parsed.data.RETRY_FACTOR
          },
          idempotencyTtlMs: parsed.data.IDEMPOTENCY_TTL_MS,
          bulkFailFast: parsed.data.BULK_FAIL_FAST,
          logLevel: parsed.data.LOG_LEVEL
        })
      : err(
          createConfigError({
            code: "CONFIG_INVALID",
            message: "Configuration validation failed",
            details: { issues: parsed.error.issues }
          })
        );
  });
