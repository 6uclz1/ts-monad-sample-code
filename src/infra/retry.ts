import { setTimeout as sleep } from "node:timers/promises";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import type { Logger } from "pino";
import { AppError, isAppError, wrapUnknown } from "../app/errors.js";

export type RetryOptions = {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor: number;
};

export type RetryContext = {
  readonly operationName?: string;
  readonly spanId?: string;
};

export type RetryExecutor = <T>(
  operation: (attempt: number) => ResultAsync<T, AppError>,
  context?: RetryContext
) => ResultAsync<T, AppError>;

const computeDelay = (attempt: number, options: RetryOptions): number => {
  const exponential = options.baseDelayMs * Math.pow(options.factor, Math.max(0, attempt - 1));
  const capped = Math.min(options.maxDelayMs, exponential);
  return Math.random() * capped;
};

export const createRetryExecutor = (options: RetryOptions, logger: Logger): RetryExecutor =>
  <T>(operation: (attempt: number) => ResultAsync<T, AppError>, context?: RetryContext) => {
    const awaitDelay = (currentAttempt: number): ResultAsync<null, AppError> =>
      ResultAsync.fromPromise(
        sleep(computeDelay(currentAttempt, options)),
        (timerError) => (isAppError(timerError) ? timerError : wrapUnknown(timerError))
      ).map(() => null);

    const succeed = (attempt: number, value: T): ResultAsync<T, AppError> => {
      attempt > 1
        ? logger.info(
            {
              spanId: context?.spanId,
              operation: context?.operationName,
              attempt
            },
            "Retry succeeded"
          )
        : undefined;
      return okAsync(value);
    };

    const execute = (attempt: number, lastError: AppError | null): ResultAsync<T, AppError> =>
      attempt > options.maxAttempts
        ? errAsync(lastError ?? wrapUnknown(new Error("Retry exceeded attempts")))
        : operation(attempt)
            .andThen((value) => succeed(attempt, value))
            .orElse((error) => fail(attempt, error));

    const fail = (attempt: number, error: AppError): ResultAsync<T, AppError> => {
      logger.warn(
        {
          spanId: context?.spanId,
          operation: context?.operationName,
          attempt,
          code: error.code,
          type: error.type
        },
        "Retry attempt failed"
      );

      return attempt >= options.maxAttempts
        ? errAsync(error)
        : awaitDelay(attempt).andThen(() => execute(attempt + 1, error));
    };

    return execute(1, null);
  };
