import { ResultAsync, okAsync } from "neverthrow";
import { AppError, createRepoError, isAppError, wrapUnknown } from "../app/errors.js";
import { User } from "../domain/models.js";
import type { AppLogger } from "./logger.js";
import type { BulkUpsertOptions, BulkUpsertResult, BulkUpsertFailure, UpsertOptions, UserRepository } from "./repo.js";

type IdempotencyEntry = {
  readonly expiresAt: number;
  readonly userIds: Set<string>;
};

export type MemoryUserRepositoryOptions = {
  readonly idempotencyTtlMs: number;
  readonly logger: AppLogger;
};

const cloneUser = (user: User): User => ({
  ...user,
  updatedAt: new Date(user.updatedAt.getTime())
});

export class MemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();

  private readonly byEmail = new Map<string, string>();

  private readonly idempotency = new Map<string, IdempotencyEntry>();

  private readonly idempotencyTtlMs: number;

  private readonly logger: AppLogger;

  public constructor(options: MemoryUserRepositoryOptions) {
    this.idempotencyTtlMs = options.idempotencyTtlMs;
    this.logger = options.logger;
  }

  public findById(id: string): ResultAsync<User | null, AppError> {
    const user = this.byId.get(id);
    return okAsync(user ? cloneUser(user) : null);
  }

  public findByEmail(email: string): ResultAsync<User | null, AppError> {
    const key = email.toLowerCase();
    const id = this.byEmail.get(key);
    const user = id ? this.byId.get(id) ?? null : null;
    return okAsync(user ? cloneUser(user) : null);
  }

  public upsert(user: User, options?: UpsertOptions): ResultAsync<User, AppError> {
    return ResultAsync.fromPromise(
      (async () => {
        const idempotencyKey = options?.idempotencyKey;
        const now = Date.now();
        const entry = idempotencyKey ? this.idempotency.get(idempotencyKey) : undefined;
        const replayEligible = entry?.expiresAt ? entry.expiresAt > now && entry.userIds.has(user.id) : false;
        const cached = replayEligible ? this.byId.get(user.id) ?? null : null;

        const persistFresh = (): User => {
          const stored: User = cloneUser({
            ...user,
            email: user.email.toLowerCase()
          });

          this.byId.set(stored.id, stored);
          this.byEmail.set(stored.email, stored.id);
          idempotencyKey ? this.persistIdempotency(idempotencyKey, stored.id, now) : undefined;
          return cloneUser(stored);
        };

        cached
          ? this.logger.debug(
              { idempotencyKey, userId: user.id },
              "Idempotent replay detected; returning cached user"
            )
          : undefined;

        return cached ? cloneUser(cached) : persistFresh();
      })(),
      (error) =>
        createRepoError({
          code: "REPO_WRITE_FAILED",
          message: "Failed to persist user",
          cause: error,
          details: { id: user.id }
        })
    );
  }

  public bulkUpsert(users: User[], options: BulkUpsertOptions): ResultAsync<BulkUpsertResult, AppError> {
    const limiter = options.rateLimiter;

    const sequential = (
      remaining: readonly User[],
      acc: readonly User[]
    ): ResultAsync<readonly User[], AppError> =>
      remaining.length === 0
        ? okAsync([...acc])
        : options
            .retry(() => this.upsert(remaining[0] as User, options), {
              operationName: "repo.upsert"
            })
            .andThen((stored) => sequential(remaining.slice(1), [...acc, stored]));

    const sequentialResult = sequential(users, []).map((successes) => ({
      successes: [...successes],
      failures: []
    } satisfies BulkUpsertResult));

    const concurrentResult = ResultAsync.fromPromise(
      Promise.all(
        users.map((user) =>
          limiter(async () => ({
            user,
            result: await options.retry(() => this.upsert(user, options), {
              operationName: "repo.upsert"
            })
          }))
        )
      ),
      (error) => (isAppError(error) ? error : wrapUnknown(error))
    ).map((settled) => {
      const aggregated = settled.reduce<{
        successes: User[];
        failures: BulkUpsertFailure[];
      }>(
        (acc, item) =>
          item.result.isOk()
            ? {
                successes: [...acc.successes, item.result.value],
                failures: acc.failures
              }
            : {
                successes: acc.successes,
                failures: [...acc.failures, { user: item.user, error: item.result.error }]
              },
        { successes: [], failures: [] }
      );

      return { successes: aggregated.successes, failures: aggregated.failures } satisfies BulkUpsertResult;
    });

    return options.failFast ? sequentialResult : concurrentResult;
  }

  private persistIdempotency(key: string, userId: string, now: number): void {
    const existing = this.idempotency.get(key);
    const expiresAt = now + this.idempotencyTtlMs;
    const active = existing?.expiresAt ? existing.expiresAt > now : false;
    active ? existing?.userIds.add(userId) : this.idempotency.set(key, { expiresAt, userIds: new Set([userId]) });
  }
}

export const createMemoryUserRepository = (
  options: MemoryUserRepositoryOptions
): MemoryUserRepository => new MemoryUserRepository(options);
