type ProcessEnvShape = {
  CONCURRENCY?: string;
  FAIL_FAST?: string;
  RETRY_MAX_ATTEMPTS?: string;
  RETRY_BASE_DELAY_MS?: string;
  RETRY_MAX_DELAY_MS?: string;
  RETRY_FACTOR?: string;
  IDEMPOTENCY_TTL_MS?: string;
  BULK_FAIL_FAST?: string;
  LOG_LEVEL?: string;
};

declare global {
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    type ProcessEnv = ProcessEnvShape;
  }
}

export {};
