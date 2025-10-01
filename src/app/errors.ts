import { err, ok, Result } from "neverthrow";

export type AppErrorType =
  | "ParseError"
  | "ValidationError"
  | "PolicyError"
  | "RepoError"
  | "ConfigError"
  | "UnknownError";

type ErrorCode =
  | "CSV_READ_ERROR"
  | "CSV_PARSE_ERROR"
  | "VALIDATION_FAILED"
  | "POLICY_DISPOSABLE_EMAIL"
  | "POLICY_DUPLICATE"
  | "POLICY_STALE_UPDATE"
  | "REPO_NOT_FOUND"
  | "REPO_CONFLICT"
  | "REPO_WRITE_FAILED"
  | "CONFIG_INVALID"
  | "CONFIG_MISSING"
  | "UNKNOWN";

export type AppError = {
  readonly type: AppErrorType;
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;
};

type ErrorFactoryArgs = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;
};

type ErrorFactory = (args: ErrorFactoryArgs) => AppError;

const createFactory = (type: AppErrorType): ErrorFactory =>
  ({ code, message, cause, details }) => ({ type, code, message, cause, details });

export const createParseError = createFactory("ParseError");
export const createValidationError = createFactory("ValidationError");
export const createPolicyError = createFactory("PolicyError");
export const createRepoError = createFactory("RepoError");
export const createConfigError = createFactory("ConfigError");
export const createUnknownError = createFactory("UnknownError");

export const wrapUnknown = (error: unknown): AppError =>
  createUnknownError({
    code: "UNKNOWN",
    message: "An unexpected error occurred",
    cause: error instanceof Error ? { name: error.name, message: error.message } : error
  });

export const isAppError = (value: unknown): value is AppError =>
  typeof value === "object" && value !== null && "type" in value && "code" in value;

export const resultFromThrowable = <T>(
  fn: () => T,
  mapError: (error: unknown) => AppError
): Result<T, AppError> => Result.fromThrowable(fn, mapError)();
