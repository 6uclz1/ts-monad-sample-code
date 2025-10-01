import dotenv from "dotenv";
import { z } from "zod";
import { Result, ok, err } from "neverthrow";
import { AppError, createConfigError } from "./app/errors.js";

dotenv.config();

const rawEnvironmentSchema = z.object({
  CONCURRENCY: z.string().optional(),
  FAIL_FAST: z.string().optional(),
  RETRY_MAX_ATTEMPTS: z.string().optional(),
  RETRY_BASE_DELAY_MS: z.string().optional(),
  RETRY_MAX_DELAY_MS: z.string().optional(),
  RETRY_FACTOR: z.string().optional(),
  IDEMPOTENCY_TTL_MS: z.string().optional(),
  BULK_FAIL_FAST: z.string().optional(),
  LOG_LEVEL: z.string().optional()
});

export type RawEnvironment = z.infer<typeof rawEnvironmentSchema>;

export type EnvironmentVariables = {
  readonly CONCURRENCY: string;
  readonly FAIL_FAST: string;
  readonly RETRY_MAX_ATTEMPTS: string;
  readonly RETRY_BASE_DELAY_MS: string;
  readonly RETRY_MAX_DELAY_MS: string;
  readonly RETRY_FACTOR: string;
  readonly IDEMPOTENCY_TTL_MS: string;
  readonly BULK_FAIL_FAST: string;
  readonly LOG_LEVEL: string;
};

const DEFAULT_ENVIRONMENT: EnvironmentVariables = {
  CONCURRENCY: "4",
  FAIL_FAST: "false",
  RETRY_MAX_ATTEMPTS: "3",
  RETRY_BASE_DELAY_MS: "100",
  RETRY_MAX_DELAY_MS: "3000",
  RETRY_FACTOR: "2",
  IDEMPOTENCY_TTL_MS: "600000",
  BULK_FAIL_FAST: "true",
  LOG_LEVEL: "info"
};

export const loadEnvironmentVariables = (): Result<EnvironmentVariables, AppError> => {
  const parsed = rawEnvironmentSchema.safeParse(process.env);

  return parsed.success
    ? ok({
        CONCURRENCY: parsed.data.CONCURRENCY ?? DEFAULT_ENVIRONMENT.CONCURRENCY,
        FAIL_FAST: parsed.data.FAIL_FAST ?? DEFAULT_ENVIRONMENT.FAIL_FAST,
        RETRY_MAX_ATTEMPTS: parsed.data.RETRY_MAX_ATTEMPTS ?? DEFAULT_ENVIRONMENT.RETRY_MAX_ATTEMPTS,
        RETRY_BASE_DELAY_MS: parsed.data.RETRY_BASE_DELAY_MS ?? DEFAULT_ENVIRONMENT.RETRY_BASE_DELAY_MS,
        RETRY_MAX_DELAY_MS: parsed.data.RETRY_MAX_DELAY_MS ?? DEFAULT_ENVIRONMENT.RETRY_MAX_DELAY_MS,
        RETRY_FACTOR: parsed.data.RETRY_FACTOR ?? DEFAULT_ENVIRONMENT.RETRY_FACTOR,
        IDEMPOTENCY_TTL_MS: parsed.data.IDEMPOTENCY_TTL_MS ?? DEFAULT_ENVIRONMENT.IDEMPOTENCY_TTL_MS,
        BULK_FAIL_FAST: parsed.data.BULK_FAIL_FAST ?? DEFAULT_ENVIRONMENT.BULK_FAIL_FAST,
        LOG_LEVEL: parsed.data.LOG_LEVEL ?? DEFAULT_ENVIRONMENT.LOG_LEVEL
      })
    : err(
        createConfigError({
          code: "CONFIG_INVALID",
          message: "Failed to read environment variables",
          details: { issues: parsed.error.issues }
        })
      );
};
