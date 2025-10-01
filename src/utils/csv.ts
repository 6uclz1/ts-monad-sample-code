import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { ResultAsync } from "neverthrow";
import { RawUser } from "../domain/models.js";
import { AppError, createParseError, isAppError, wrapUnknown } from "../app/errors.js";

export type CsvSource = Readable | string;

type ParserState = {
  readonly values: string[];
  readonly current: string;
  readonly inQuotes: boolean;
  readonly skipNext: boolean;
};

const appendValue = (state: ParserState): ParserState => ({
  values: [...state.values, state.current.trim()],
  current: "",
  inQuotes: state.inQuotes,
  skipNext: false
});

const parseCsvLine = (line: string): string[] => {
  const initial: ParserState = { values: [], current: "", inQuotes: false, skipNext: false };

  const finalState = Array.from(line).reduce<ParserState>((state, char, index, array) =>
    state.skipNext
      ? { ...state, skipNext: false }
      : char === "\""
        ? state.inQuotes && array[index + 1] === "\""
          ? {
              ...state,
              current: `${state.current}\"`,
              skipNext: true
            }
          : {
              ...state,
              inQuotes: !state.inQuotes
            }
        : char === "," && !state.inQuotes
          ? appendValue(state)
          : {
              ...state,
              current: `${state.current}${char}`
            },
  initial);

  const values = appendValue(finalState).values;
  return values;
};

const openStream = (source: CsvSource): Promise<Readable> =>
  new Promise((resolve, reject) =>
    typeof source !== "string"
      ? resolve(source)
      : source === "-"
        ? resolve(process.stdin)
        : (() => {
            const stream = createReadStream(source, { encoding: "utf-8" });

            const handleError = (error: unknown) => {
              stream.removeListener("open", handleOpen);
              reject(
                createParseError({
                  code: "CSV_READ_ERROR",
                  message: "Failed to open CSV source",
                  cause: error,
                  details: { source }
                })
              );
            };

            const handleOpen = () => {
              stream.removeListener("error", handleError);
              resolve(stream);
            };

            stream.once("error", handleError);
            stream.once("open", handleOpen);
          })()
  );

const buildIterator = (stream: Readable): AsyncGenerator<RawUser> => {
  typeof (stream as Readable & { setEncoding?: (encoding: string) => void }).setEncoding === "function"
    ? (stream as Readable & { setEncoding?: (encoding: string) => void }).setEncoding("utf-8")
    : undefined;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  const iterator = rl[Symbol.asyncIterator]();

  const nextRecord = (): Promise<IteratorResult<RawUser>> =>
    iterator.next().then(({ value, done }) =>
      done
        ? (rl.close(), { done: true, value: undefined as never })
        : processLine((value ?? "").trim())
    );

  const processLine = (line: string): Promise<IteratorResult<RawUser>> =>
    line.length === 0
      ? nextRecord()
      : headers === null
        ? (() => {
            headers = parseCsvLine(line.replace(/^\uFEFF/, ""));
            return nextRecord();
          })()
        : (() => {
            const values = parseCsvLine(line);
            return values.length !== headers.length
              ? Promise.reject(
                  createParseError({
                    code: "CSV_PARSE_ERROR",
                    message: "Row length does not match header length",
                    details: { headers: headers.length, values: values.length, line }
                  })
                )
              : Promise.resolve({
                  done: false,
                  value: headers.reduce<RawUser>((acc, header, index) => {
                    const key = header.trim();
                    return key.length > 0 ? { ...acc, [key]: values[index] } : acc;
                  }, {})
                });
          })();

  return {
    next: nextRecord,
    [Symbol.asyncIterator]() {
      return this;
    }
  };
};

export const readCsv = (source: CsvSource): ResultAsync<AsyncGenerator<RawUser>, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      const stream = await openStream(source);
      return buildIterator(stream);
    })(),
    (error) => (isAppError(error) ? error : wrapUnknown(error))
  );
