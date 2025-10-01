import { AppError } from "./errors.js";
import { User } from "../domain/models.js";

export type ReportInput = {
  readonly total: number;
  readonly persisted: User[];
  readonly skipped: Array<{ user: User; error: AppError }>;
  readonly failures: Array<{ stage: string; error: AppError }>;
};

const averageAge = (users: User[]): number =>
  users.length === 0
    ? 0
    : (() => {
        const total = users.reduce((acc, user) => acc + user.age, 0);
        return Math.round((total / users.length) * 10) / 10;
      })();

const topDomains = (users: User[], limit = 5): Array<{ domain: string; count: number }> =>
  Array.from(
    users.reduce((acc, user) => {
      const [, domain = "unknown"] = user.email.split("@");
      const nextCount = (acc.get(domain) ?? 0) + 1;
      acc.set(domain, nextCount);
      return acc;
    }, new Map<string, number>()).entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));

export const buildReport = (input: ReportInput): string => {
  const succeeded = input.persisted.length;
  const skipped = input.skipped.length;
  const failed = input.failures.length;
  const domains = topDomains(input.persisted);

  const domainLines = domains.length > 0
    ? domains.map((entry) => `  - ${entry.domain}: ${entry.count}`)
    : ["  (no persisted users)"];

  const failureLines = input.failures.length > 0
    ? [
        "",
        "Failures overview:",
        ...input.failures.map(
          (failure) => `  - [${failure.stage}] ${failure.error.code}: ${failure.error.message}`
        )
      ]
    : [];

  const skippedLines = input.skipped.length > 0
    ? [
        "",
        "Policy skips overview:",
        ...input.skipped.map(
          (skip) =>
            `  - ${skip.user.id} (${skip.user.email}): ${skip.error.code} - ${skip.error.message}`
        )
      ]
    : [];

  return [
    "Import Summary",
    "--------------",
    `Total records processed: ${input.total}`,
    `Persisted successfully: ${succeeded}`,
    `Skipped by policy: ${skipped}`,
    `Failed validations/persists: ${failed}`,
    "",
    `Average age of persisted users: ${averageAge(input.persisted)}`,
    "",
    "Domain distribution (top 5):",
    ...domainLines,
    ...failureLines,
    ...skippedLines
  ].join("\n");
};
