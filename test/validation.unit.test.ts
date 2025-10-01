import { describe, expect, it } from "vitest";
import { validateRawUser } from "../src/domain/validation.js";
import { RawUser } from "../src/domain/models.js";

const baseUser: RawUser = {
  id: "user-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  age: "36",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

describe("validateRawUser", () => {
  it("validates a correct user", () => {
    const result = validateRawUser(baseUser);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "user-1",
      age: 36,
      email: "ada@example.com"
    });
  });

  it("fails for invalid email", () => {
    const result = validateRawUser({ ...baseUser, email: "invalid" });

    expect(result.isErr()).toBe(true);
    result.mapErr((error) => expect(error.code).toBe("VALIDATION_FAILED"));
  });

  it("rejects ages outside 0-130", () => {
    const result = validateRawUser({ ...baseUser, age: "150" });

    expect(result.isErr()).toBe(true);
    result.mapErr((error) => expect(error.message).toContain("failed"));
  });
});
