# TypeScript Neverthrow Data Pipeline

This project demonstrates a production-minded CSV ingestion pipeline built with TypeScript and neverthrow. It combines declarative pipeline composition, strict validation, retry/rate control, idempotent persistence, and structured logging.

```mermaid
flowchart LR
    csv[CSV IO<br/>(csv.ts)] --> validation[Validation<br/>(zod)]
    validation --> policies[Policy Gate<br/>(policies.ts)]
    policies --> control[Rate & Retry<br/>(rateLimit.ts / retry.ts)]
    control --> repo[Persistence & Reporting<br/>(repo.*, report.ts)]
    subgraph Observability
        logger[Tracing & Logs<br/>(logger.ts)]
    end
    csv -. spanId .-> logger
    validation -. spanId .-> logger
    policies -. spanId .-> logger
    control -. spanId .-> logger
    repo -. spanId .-> logger
```

## Features

- Streaming CSV reader that converts each row into a `RawUser` without exhausting memory.
- Zod-based normalisation with precise neverthrow error mapping.
- Policy layer that enforces duplicate suppression, stale update protection, and disposable domain filtering.
- Memory repository with idempotency cache, p-limit based bulk persistence, and retry orchestration.
- Structured logging with span IDs and deterministic retry traces.
- Reports summarising cadence, error buckets, and domain distributions.
- Vitest suite covering validation, retry jitter, repository idempotency, and end-to-end ingestion.

## Project Structure

- `src/app/`: pipeline orchestration, reporting, error taxonomy.
- `src/domain/`: pure domain types, validation schemas, policy evaluation.
- `src/infra/`: adapters for logging, rate limiting, retry logic, and repository implementation.
- `src/utils/`: shared helpers such as CSV parsing and Result utilities.
- `test/`: Vitest suites (`*.unit.test.ts`, `*.int.test.ts`) mirroring the module boundaries.
- `src/types/env.d.ts`: type augmentation for environment variables.

## Getting Started

```bash
pnpm install
pnpm test
pnpm start -- --source samples/users.csv --idempotency batch-20240501
```

By default the CLI reads from stdin. Use `--source -` to pipe data: `cat users.csv | pnpm start -- --source -`.

## Build & Development Commands

- `pnpm build` — compile TypeScript output to `dist/` via `tsc`.
- `pnpm test` — run all Vitest suites in watchless mode.
- `pnpm start -- --source <path|- >` — execute the ingestion pipeline.

## Configuration

Environment variables are validated via `zod` in `src/config.ts`. Use `.env` (see `.env.example`) to tune runtime characteristics:

- `CONCURRENCY`: maximum parallel persistence operations (default `4`).
- `FAIL_FAST`: stop on first validation/policy failure (`true`/`false`).
- `RETRY_*`: control exponential backoff (`MAX_ATTEMPTS`, `BASE_DELAY_MS`, `MAX_DELAY_MS`, `FACTOR`).
- `IDEMPOTENCY_TTL_MS`: retention for idempotency cache entries.
- `BULK_FAIL_FAST`: stop bulk upsert on first repository failure.
- `LOG_LEVEL`: pino log level (`info`, `debug`, `silent`, ...).

The configuration layer rejects malformed settings early with a `ConfigError` so failures are explicit before work begins.

## Coding Style & Conventions

- TypeScript strict mode is enforced; prefer neverthrow `Result`/`ResultAsync` combinators to represent branching and error flows.
- Control flow uses expression-based handlers—avoid `if`, `for`, and `try`; rely on pattern maps (`match`, handler records).
- Define structures with `type` aliases; use `camelCase` for functions/variables and `PascalCase` for types.
- Logging via Pino should include `spanId` for trace continuity.

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

## Contributing

- Follow imperative commit messages (e.g., `Add policy handler map`) and group related changes logically.
- Describe changes, rationale, and test evidence (`pnpm test`) in pull requests; mention configuration or CI updates explicitly.
- Link relevant issues and include screenshots or log snippets when altering CLI output or logging formats.
- Extend `.env.example` and `src/env.ts` / `src/config.ts` when introducing new environment variables.

## Extensibility

- Swap `MemoryUserRepository` for a real datastore adapter (e.g., Postgres) by implementing `UserRepository`.
- Extend policy evaluation to pull allow/deny lists from configuration or feature flags.
- Emit metrics (Prometheus/OpenTelemetry) inside retry hooks and policy gates.
- Replace CSV source with S3/HTTP by implementing a new `CsvSource` wrapper returning a `Readable` stream.

## Maintenance Checklist

1. Tail logs (`LOG_LEVEL=debug`) for retry behaviour during load tests.
2. Monitor idempotency TTL to balance cache size vs. replay horizons.
3. Keep disposable domain lists up to date for policy relevancy.
