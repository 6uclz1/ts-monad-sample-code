import { Result } from "neverthrow";

export type PartitionedResults<T, E> = {
  readonly successes: T[];
  readonly failures: E[];
};

export const partitionResults = <T, E>(results: Array<Result<T, E>>): PartitionedResults<T, E> =>
  results.reduce<PartitionedResults<T, E>>(
    (acc, current) =>
      current.isOk()
        ? { successes: [...acc.successes, current.value], failures: acc.failures }
        : { successes: acc.successes, failures: [...acc.failures, current.error] },
    { successes: [], failures: [] }
  );

export const mapAsyncIterable = <T, R>(
  iterable: AsyncIterable<T>,
  mapper: (value: T, index: number) => Promise<R> | R
): AsyncGenerator<R> => {
  const iterator = iterable[Symbol.asyncIterator]();
  let index = 0;

  const next = async (): Promise<IteratorResult<R>> => {
    const result = await iterator.next();
    return result.done
      ? { done: true, value: undefined as never }
      : Promise.resolve(mapper(result.value, index)).then((mapped) => {
          index += 1;
          return { done: false, value: mapped } as IteratorResult<R>;
        });
  };

  return {
    next,
    [Symbol.asyncIterator]() {
      return this;
    }
  };
};
