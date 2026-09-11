import { describe, expect, it } from "vitest";

import {
  allowsEvaluationRetry,
  assertTransition,
  canTransition,
  isEditable,
} from "@/domain/attempt-state-machine";

describe("attempt state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "EVALUATING")).toBe(true);
    expect(canTransition("EVALUATING", "COMPLETED")).toBe(true);
  });

  it("allows failure and retry", () => {
    expect(canTransition("EVALUATING", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "EVALUATING")).toBe(true);
    expect(allowsEvaluationRetry("FAILED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("COMPLETED", "SUBMITTED")).toBe(false);
    expect(canTransition("COMPLETED", "DRAFT")).toBe(false);
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransition("SUBMITTED", "SUBMITTED")).toBe(false);
    expect(() => assertTransition("COMPLETED", "SUBMITTED")).toThrowError(/Cannot move/);
  });

  it("only allows editing a draft", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("SUBMITTED")).toBe(false);
    expect(isEditable("COMPLETED")).toBe(false);
  });
});
