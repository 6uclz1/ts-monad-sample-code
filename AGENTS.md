# Repository Guidelines

## Project Structure & Module Organization
- Source lives under `src/`, grouped by domain (`domain/`), infrastructure (`infra/`), application (`app/`), and utilities (`utils/`).
- Configuration and DI are handled in `src/config.ts` and `src/container.ts`; entrypoint is `src/index.ts`.
- Tests reside in `test/`, mirroring module boundaries (e.g., `pipeline.int.test.ts`).
- Environment typing is centralised in `src/types/env.d.ts`; docs and workflows sit at the repo root.

## Build, Test, and Development Commands
- `pnpm install` — install dependencies (required before any build/test run).
- `pnpm build` — compile TypeScript to `dist/` using `tsc`.
- `pnpm test` — execute the Vitest suite headlessly.
- `pnpm start -- --source samples/users.csv` — run the CSV ingestion pipeline via the CLI.

## Coding Style & Naming Conventions
- TypeScript strict mode enforced; no `any`, `if`, `for`, or `try` constructs in production code—prefer neverthrow combinators and expression-based branching.
- Use type aliases (`type`) over interfaces; prefer `camelCase` for variables/functions, `PascalCase` for types.
- Logging via Pino should include `spanId` to maintain traceability.

## Testing Guidelines
- Vitest is the testing framework; tests live in `test/` with `.unit.test.ts`, `.int.test.ts` suffixes.
- Ensure new code paths have deterministic tests; use neverthrow’s `match`/`map` for assertions instead of direct conditionals.
- Run `pnpm test` before submitting changes; add integration coverage when touching pipeline orchestration.

## Commit & Pull Request Guidelines
- Commit messages follow imperative mood (e.g., `Add policy handler map`). Group related changes logically.
- Pull requests should include: summary of changes, rationale, testing evidence (`pnpm test` output), and mention of configuration updates (`.env`, CI) if applicable.
- Link relevant issues; include screenshots/log excerpts when modifying CLI output or logging formats.

## Security & Configuration Tips
- Validate `.env` additions via `src/env.ts` and `src/config.ts`; add defaults to `.env.example`.
- Never commit real credentials; rely on type-safe environment bindings and keep `.env` out of version control.
