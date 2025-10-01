import { ResultAsync } from "neverthrow";
import { AppError } from "../app/errors.js";
import { User } from "../domain/models.js";
import type { RetryExecutor } from "./retry.js";
import type { RateLimiter } from "./rateLimit.js";

export type UpsertOptions = {
  readonly idempotencyKey?: string;
};

export type BulkUpsertOptions = UpsertOptions & {
  readonly rateLimiter: RateLimiter;
  readonly retry: RetryExecutor;
  readonly failFast: boolean;
};

export type BulkUpsertFailure = {
  readonly user: User;
  readonly error: AppError;
};

export type BulkUpsertResult = {
  readonly successes: User[];
  readonly failures: BulkUpsertFailure[];
};

export type UserRepository = {
  readonly findById: (id: string) => ResultAsync<User | null, AppError>;
  readonly findByEmail: (email: string) => ResultAsync<User | null, AppError>;
  readonly upsert: (user: User, options?: UpsertOptions) => ResultAsync<User, AppError>;
  readonly bulkUpsert: (users: User[], options: BulkUpsertOptions) => ResultAsync<BulkUpsertResult, AppError>;
};
