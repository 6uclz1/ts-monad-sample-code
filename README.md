# TypeScript Neverthrow Data Pipeline

This project demonstrates a production-minded CSV ingestion pipeline built with TypeScript and neverthrow. It combines declarative pipeline composition, strict validation, retry/rate control, idempotent persistence, and structured logging.

```
+----------+      +-------------+      +-------------+      +---------------+      +-----------+
|  CSV IO  | ---> | Validation  | ---> | Policy Gate | ---> | Rate + Retry  | ---> |  Repo +   |
| (csv.ts) |      | (zod)       |      | (policies)  |      | (retry.ts)    |      | Reporting |
+----------+      +-------------+      +-------------+      +---------------+      +-----------+
                                                   \___________________________________________/
                                                              audit logs via pino (logger.ts)
```

## Features

- Streaming CSV reader that converts each row into a `RawUser` without exhausting memory.
- Zod-based normalisation with precise neverthrow error mapping.
- Policy layer that enforces duplicate suppression, stale update protection, and disposable domain filtering.
- Memory repository with idempotency cache, p-limit based bulk persistence, and retry orchestration.
- Structured logging with span IDs and deterministic retry traces.
- Reports summarising cadence, error buckets, and domain distributions.
- Vitest suite covering validation, retry jitter, repository idempotency, and end-to-end ingestion.

## Getting Started

```bash
pnpm install
pnpm test
pnpm start -- --source samples/users.csv --idempotency batch-20240501
```

By default the CLI reads from stdin. Use `--source -` to pipe data: `cat users.csv | pnpm start -- --source -`.

## Configuration

Environment variables are validated via `zod` in `src/config.ts`. Use `.env` (see `.env.example`) to tune runtime characteristics:

- `CONCURRENCY`: maximum parallel persistence operations (default `4`).
- `FAIL_FAST`: stop on first validation/policy failure (`true`/`false`).
- `RETRY_*`: control exponential backoff (`MAX_ATTEMPTS`, `BASE_DELAY_MS`, `MAX_DELAY_MS`, `FACTOR`).
- `IDEMPOTENCY_TTL_MS`: retention for idempotency cache entries.
- `BULK_FAIL_FAST`: stop bulk upsert on first repository failure.
- `LOG_LEVEL`: pino log level (`info`, `debug`, `silent`, ...).

The configuration layer rejects malformed settings early with a `ConfigError` so failures are explicit before work begins.

## Operational Notes

- **Observability**: every pipeline run emits a span-scoped log stream detailing validation failures, policy skips, retries, and persistence results.
- **SLO & Failure Posture**: exit code `0` for full success, `2` when non-fatal errors are aggregated, and `1` for fatal errors. This maps to alerting thresholds in orchestration systems.
- **Replays**: supply the same `--idempotency` key to guarantee repeated batches do not create duplicates, enabling safe reprocessing after downstream failures.
- **Rate/Retries**: `p-limit` plus jittered exponential backoff shields downstream stores. Adjust concurrency and retry windows to match store SLAs.

## Testing

Run the full suite with `pnpm test`. Coverage includes:

- Validation boundary cases and email formatting.
- Retry logic (backoff & termination).
- Repository idempotency semantics.
- Pipeline integration from CSV through report generation.

## Extensibility

- Swap `MemoryUserRepository` for a real datastore adapter (e.g., Postgres) by implementing `UserRepository`.
- Extend policy evaluation to pull allow/deny lists from configuration or feature flags.
- Emit metrics (Prometheus/OpenTelemetry) inside retry hooks and policy gates.
- Replace CSV source with S3/HTTP by implementing a new `CsvSource` wrapper returning a `Readable` stream.

## Maintenance Checklist

1. Tail logs (`LOG_LEVEL=debug`) for retry behaviour during load tests.
2. Monitor idempotency TTL to balance cache size vs. replay horizons.
3. Keep disposable domain lists up to date for policy relevancy.
