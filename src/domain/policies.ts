import { ResultAsync, okAsync } from "neverthrow";
import type { UserRepository } from "../infra/repo.js";
import { User } from "./models.js";
import {
  AppError,
  createPolicyError,
  isAppError,
  wrapUnknown
} from "../app/errors.js";

const DEFAULT_DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "trashmail.com",
  "10minutemail.com",
  "tempmail.com"
]);

export type PolicyOutcomeAccept = {
  readonly type: "accept";
  readonly user: User;
};

export type PolicyOutcomeSkip = {
  readonly type: "skip";
  readonly user: User;
  readonly error: AppError;
};

export type PolicyOutcome = PolicyOutcomeAccept | PolicyOutcomeSkip;

export type PolicyDependencies = {
  readonly repo: Pick<UserRepository, "findById" | "findByEmail">;
  readonly isDisposableDomain?: (domain: string) => boolean;
};

const isDisposable = (domain: string, custom?: (domain: string) => boolean): boolean =>
  custom ? custom(domain) : DEFAULT_DISPOSABLE_DOMAINS.has(domain.toLowerCase());

const toSkip = (user: User, error: AppError): PolicyOutcomeSkip => ({
  type: "skip",
  user,
  error
});

export const evaluatePolicies = (
  user: User,
  deps: PolicyDependencies
): ResultAsync<PolicyOutcome, AppError> => {
  const domain = user.email.split("@")[1] ?? "";

  const disposableOutcome = isDisposable(domain, deps.isDisposableDomain)
    ? okAsync<PolicyOutcome, AppError>(
        toSkip(
          user,
          createPolicyError({
            code: "POLICY_DISPOSABLE_EMAIL",
            message: "Disposable email domain is not allowed",
            details: { domain }
          })
        )
      )
    : null;

  const resolveByEmail = (): ResultAsync<PolicyOutcome, AppError> =>
    deps.repo.findByEmail(user.email).andThen((matched) =>
      matched && matched.name.toLowerCase() === user.name.toLowerCase()
        ? okAsync(
            toSkip(
              matched,
              createPolicyError({
                code: "POLICY_DUPLICATE",
                message: "Duplicate user detected by email and name",
                details: { id: matched.id, email: matched.email }
              })
            )
          )
        : okAsync<PolicyOutcome, AppError>({ type: "accept", user })
    );

  const resolveById = (): ResultAsync<PolicyOutcome, AppError> =>
    deps.repo.findById(user.id).andThen((matched) =>
      matched
        ? matched.updatedAt.getTime() >= user.updatedAt.getTime()
          ? okAsync(
              toSkip(
                user,
                createPolicyError({
                  code: "POLICY_STALE_UPDATE",
                  message: "Incoming record is older than the stored version",
                  details: {
                    storedAt: matched.updatedAt.toISOString(),
                    incomingAt: user.updatedAt.toISOString()
                  }
                })
              )
            )
          : okAsync<PolicyOutcome, AppError>({ type: "accept", user })
        : resolveByEmail()
    );

  return disposableOutcome ?? resolveById();
};
