import { randomUUID } from "node:crypto";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import type { CsvSource } from "../utils/csv.js";
import { readCsv } from "../utils/csv.js";
import { validateRawUser } from "../domain/validation.js";
import { evaluatePolicies } from "../domain/policies.js";
import { buildReport } from "./report.js";
import { Config } from "../config.js";
import { AppLogger, childLogger } from "../infra/logger.js";
import type { UserRepository, BulkUpsertFailure } from "../infra/repo.js";
import type { RateLimiter } from "../infra/rateLimit.js";
import type { RetryExecutor } from "../infra/retry.js";
import { AppError, isAppError, wrapUnknown } from "./errors.js";
import { RawUser, User } from "../domain/models.js";

export type PipelineDeps = {
  readonly config: Config;
  readonly repo: UserRepository;
  readonly logger: AppLogger;
  readonly rateLimiter: RateLimiter;
  readonly retry: RetryExecutor;
};

export type PipelineInput = {
  readonly source: CsvSource;
  readonly idempotencyKey?: string;
  readonly failFast?: boolean;
  readonly spanId?: string;
};

export type PipelineStats = {
  readonly total: number;
  readonly validated: number;
  readonly persisted: number;
  readonly skipped: number;
  readonly failed: number;
};

export type PipelineErrorRecord = {
  readonly stage: "validation" | "persistence";
  readonly error: AppError;
  readonly context: Record<string, unknown>;
};

export type PipelineOutput = {
  readonly report: string;
  readonly stats: PipelineStats;
  readonly errors: PipelineErrorRecord[];
  readonly skipped: Array<{ user: User; error: AppError }>;
  readonly successes: User[];
};

type PipelineAccumulator = {
  readonly total: number;
  readonly validUsers: User[];
  readonly validationErrors: PipelineErrorRecord[];
  readonly skipped: Array<{ user: User; error: AppError }>;
};

type AccumulatorContext = {
  readonly iterator: AsyncIterator<RawUser>;
  readonly failFast: boolean;
  readonly logger: AppLogger;
  readonly spanId: string;
  readonly repo: UserRepository;
};

const toErrorRecord = (
  stage: PipelineErrorRecord["stage"],
  error: AppError,
  context: Record<string, unknown>
): PipelineErrorRecord => ({ stage, error, context });

const mapPersistenceFailure = (failure: BulkUpsertFailure): PipelineErrorRecord =>
  toErrorRecord("persistence", failure.error, { id: failure.user.id });

const tap = <T>(action: () => void, value: T): T => {
  action();
  return value;
};

const handleRecord = (
  raw: RawUser,
  acc: PipelineAccumulator,
  context: AccumulatorContext
): ResultAsync<PipelineAccumulator, AppError> => {
  const total = acc.total + 1;
  const validation = validateRawUser(raw);

  const requeue = (next: PipelineAccumulator): ResultAsync<PipelineAccumulator, AppError> =>
    accumulateRecords(next, context);

  const decisionHandlers = (base: PipelineAccumulator) => ({
    accept: (decision: PolicyOutcome & { type: "accept" }) =>
      requeue({
        ...base,
        total,
        validUsers: [...base.validUsers, decision.user]
      }),
    skip: (decision: PolicyOutcome & { type: "skip" }) =>
      tap(
        () =>
          context.logger.info(
            {
              spanId: context.spanId,
              stage: "policy",
              code: decision.error.code,
              userId: decision.user.id
            },
            "User skipped by policy"
          ),
        requeue({
          ...base,
          total,
          skipped: [...base.skipped, { user: decision.user, error: decision.error }]
        })
      )
  });

  const validationHandlers = {
    success: (user: User) =>
      evaluatePolicies(user, { repo: context.repo }).andThen((decision) =>
        decisionHandlers(acc)[decision.type](decision as never)
      ),
    failure: (validationError: AppError) =>
      tap(
        () =>
          context.logger.warn(
            { spanId: context.spanId, stage: "validation", code: validationError.code },
            "Record failed validation"
          ),
        context.failFast
          ? errAsync(validationError)
          : requeue({
              ...acc,
              total,
              validationErrors: [
                ...acc.validationErrors,
                toErrorRecord("validation", validationError, { raw })
              ]
            })
      )
  };

  return validation.match(validationHandlers.success, validationHandlers.failure);
};

const accumulateRecords = (
  acc: PipelineAccumulator,
  context: AccumulatorContext
): ResultAsync<PipelineAccumulator, AppError> =>
  ResultAsync.fromPromise(
    context.iterator.next(),
    (error) => (isAppError(error) ? error : wrapUnknown(error))
  ).andThen(({ value, done }) =>
    done
      ? okAsync(acc)
      : handleRecord(value as RawUser, acc, context)
  );

export const runPipeline = (
  input: PipelineInput,
  deps: PipelineDeps
): ResultAsync<PipelineOutput, AppError> => {
  const spanId = input.spanId ?? randomUUID();
  const logger = childLogger(deps.logger, { spanId, component: "pipeline" });
  const failFast = input.failFast ?? deps.config.failFast;

  logger.info({ spanId }, "Pipeline start");

  return readCsv(input.source).andThen((records) => {
    const iterator = records[Symbol.asyncIterator]();
    const initial: PipelineAccumulator = {
      total: 0,
      validUsers: [],
      validationErrors: [],
      skipped: []
    };

    const context: AccumulatorContext = {
      iterator,
      failFast,
      logger,
      spanId,
      repo: deps.repo
    };

    return accumulateRecords(initial, context)
      .map((accumulator) =>
        tap(
          () =>
            logger.info(
              {
                spanId,
                total: accumulator.total,
                valid: accumulator.validUsers.length,
                skipped: accumulator.skipped.length
              },
              "Validation and policy phase completed"
            ),
          accumulator
        )
      )
      .andThen((accumulator) =>
        deps.repo
          .bulkUpsert(accumulator.validUsers, {
            idempotencyKey: input.idempotencyKey,
            rateLimiter: deps.rateLimiter,
            retry: deps.retry,
            failFast: deps.config.bulkFailFast
          })
          .map((bulk) => ({ accumulator, bulk }))
      )
      .map(({ accumulator, bulk }) => {
        const persistenceErrors = bulk.failures.map(mapPersistenceFailure);
        const errors = [...accumulator.validationErrors, ...persistenceErrors];

        const stats: PipelineStats = {
          total: accumulator.total,
          validated: accumulator.total - accumulator.validationErrors.length,
          persisted: bulk.successes.length,
          skipped: accumulator.skipped.length,
          failed: errors.length
        };

        const report = buildReport({
          total: accumulator.total,
          persisted: bulk.successes,
          skipped: accumulator.skipped,
          failures: errors.map((failure) => ({
            stage: failure.stage,
            error: failure.error
          }))
        });

        tap(
          () => logger.info({ spanId, stats, errors: errors.length }, "Pipeline completed"),
          null
        );

        return {
          report,
          stats,
          errors,
          skipped: accumulator.skipped,
          successes: bulk.successes
        } satisfies PipelineOutput;
      });
  });
};
