import { stdin } from "node:process";
import { createContainer, AppContainer } from "./container.js";
import { runPipeline } from "./app/pipeline.js";
import { AppError, createParseError } from "./app/errors.js";
import { err, ok, Result } from "neverthrow";

const withEffect = <T>(action: () => void, value: T): T => {
  action();
  return value;
};

type CliOptions = {
  readonly source: string | NodeJS.ReadableStream;
  readonly idempotencyKey?: string;
  readonly failFast?: boolean;
};

type PipelineSuccess = Awaited<ReturnType<typeof runPipeline>> extends Result<infer V, AppError>
  ? V
  : never;

type ArgContext = {
  readonly argv: string[];
  readonly index: number;
  readonly state: CliOptions;
};

type ContinueResult = {
  readonly kind: "continue";
  readonly nextIndex: number;
  readonly state: CliOptions;
};

type DoneResult = {
  readonly kind: "done";
  readonly state: CliOptions;
};

type HandlerResult = ContinueResult | DoneResult;

type ArgHandler = (context: ArgContext) => Result<HandlerResult, AppError>;

const doneSymbol = Symbol("done");

const missingValueError = (flag: string): AppError =>
  createParseError({
    code: "CSV_READ_ERROR",
    message: `Missing value for ${flag}`
  });

const unknownFlagError = (flag: string): AppError =>
  createParseError({
    code: "CSV_READ_ERROR",
    message: `Unknown CLI argument: ${flag}`
  });

const takeNextArgument = (flag: string, context: ArgContext): Result<string, AppError> =>
  Result.fromNullable(() => missingValueError(flag), context.argv.at(context.index + 1));

const continueWith = (state: CliOptions, nextIndex: number): Result<HandlerResult, AppError> =>
  ok({ kind: "continue", state, nextIndex });

const handlers = new Map<string | symbol, ArgHandler>([
  [
    doneSymbol,
    ({ state }) => ok({ kind: "done", state })
  ],
  [
    "--source",
    (context) =>
      takeNextArgument("--source", context).andThen((value) =>
        continueWith({ ...context.state, source: value }, context.index + 2)
      )
  ],
  [
    "-s",
    (context) =>
      takeNextArgument("-s", context).andThen((value) =>
        continueWith({ ...context.state, source: value }, context.index + 2)
      )
  ],
  [
    "--idempotency",
    (context) =>
      takeNextArgument("--idempotency", context).andThen((value) =>
        continueWith({ ...context.state, idempotencyKey: value }, context.index + 2)
      )
  ],
  [
    "-i",
    (context) =>
      takeNextArgument("-i", context).andThen((value) =>
        continueWith({ ...context.state, idempotencyKey: value }, context.index + 2)
      )
  ],
  [
    "--fail-fast",
    (context) => continueWith({ ...context.state, failFast: true }, context.index + 1)
  ]
]);

const handlerResultMap = (
  context: ArgContext
): Record<HandlerResult["kind"], (result: HandlerResult) => Result<CliOptions, AppError>> => ({
  continue: (result) => walk({
    argv: context.argv,
    index: result.nextIndex,
    state: result.state
  }),
  done: (result) => ok(result.state)
});

const walk = (context: ArgContext): Result<CliOptions, AppError> => {
  const arg = context.argv.at(context.index);
  const handlerKey = (arg ?? doneSymbol) as string | symbol;
  const handler = handlers.get(handlerKey);

  return Result.fromNullable(
    () => unknownFlagError(arg ?? ""),
    handler
  )
    .andThen((fn) => fn(context))
    .andThen((result) => handlerResultMap(context)[result.kind](result));
};

const parseArgs = (argv: string[]): Result<CliOptions, AppError> =>
  walk({ argv, index: 0, state: { source: stdin } });

type ExitKind = "success" | "partial";

const exitKinds = ["success", "partial"] as const satisfies readonly ExitKind[];

const exitHandlers = (container: AppContainer, output: PipelineSuccess) => ({
  success: () =>
    withEffect(
      () => container.logger.info({ persisted: output.stats.persisted }, "Pipeline succeeded"),
      Promise.resolve(0)
    ),
  partial: () =>
    withEffect(
      () =>
        container.logger.warn(
          { errors: output.errors.length, skipped: output.skipped.length },
          "Pipeline completed with partial failures"
        ),
      Promise.resolve(2)
    )
});

const classifyExit = (errorsCount: number): ExitKind => exitKinds[Math.min(1, Math.max(0, Number(errorsCount > 0)))] as ExitKind;

const executePipeline = (options: CliOptions): Promise<number> =>
  createContainer().match(
    (container) =>
      runPipeline(
        {
          source: options.source,
          idempotencyKey: options.idempotencyKey,
          failFast: options.failFast
        },
        {
          config: container.config,
          repo: container.repo,
          logger: container.logger,
          rateLimiter: container.rateLimiter,
          retry: container.retry
        }
      ).match(
        (output) => {
          console.log(output.report);
          const kind = classifyExit(output.errors.length);
          return exitHandlers(container, output)[kind]();
        },
        (error) => {
          container.logger.error({ code: error.code, type: error.type }, "Pipeline failed");
          console.error(error.message);
          return Promise.resolve(1);
        }
      ),
    (error) => {
      console.error(error.message);
      return Promise.resolve(1);
    }
  );

const main = (): Promise<number> =>
  parseArgs(process.argv.slice(2)).match(
    (options) => executePipeline(options),
    (error) => {
      console.error(error.message);
      return Promise.resolve(1);
    }
  );

void main().then((code) =>
  code === 0 ? process.exit(0) : (process.exitCode = code)
);
