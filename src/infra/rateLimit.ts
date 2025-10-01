import pLimit from "p-limit";

export type RateLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

export const createRateLimiter = (concurrency: number): RateLimiter => {
  const safeConcurrency = Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 1;
  const limiter = pLimit(safeConcurrency);
  return async <T>(fn: () => Promise<T>): Promise<T> => limiter(fn);
};
