import { z } from "zod";
import { Result, ok, err } from "neverthrow";
import { RawUser, User } from "./models.js";
import { AppError, createValidationError } from "../app/errors.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rawUserSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  name: z.string().trim().min(1, "name is required"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => emailRegex.test(value), {
      message: "invalid email format"
    }),
  age: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value), { message: "age must be an integer" })
    .refine((value) => value >= 0 && value <= 130, {
      message: "age must be between 0 and 130"
    }),
  updatedAt: z
    .string()
    .trim()
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), {
      message: "updatedAt must be a valid ISO8601 timestamp"
    })
});

const mapValidationError = (issues: z.ZodIssue[]): AppError =>
  createValidationError({
    code: "VALIDATION_FAILED",
    message: "User validation failed",
    details: {
      issues: issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    }
  });

export const validateRawUser = (raw: RawUser): Result<User, AppError> => {
  const result = rawUserSchema.safeParse({
    id: raw.id ?? "",
    name: raw.name ?? "",
    email: raw.email ?? "",
    age: raw.age ?? "",
    updatedAt: raw.updatedAt ?? ""
  });

  return result.success
    ? ok({
        id: result.data.id,
        name: result.data.name,
        email: result.data.email,
        age: result.data.age,
        updatedAt: result.data.updatedAt
      })
    : err(mapValidationError(result.error.issues));
};
