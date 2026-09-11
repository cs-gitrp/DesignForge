import { DomainError } from "./errors";
import type { AttemptStatus } from "./types";

/**
 * DRAFT -> SUBMITTED -> EVALUATING -> COMPLETED
 *                            \-> FAILED -> EVALUATING (retry evaluation)
 * COMPLETED is terminal: improving means creating a new attempt.
 */
const TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  DRAFT: ["DRAFT", "SUBMITTED"],
  SUBMITTED: ["EVALUATING"],
  EVALUATING: ["COMPLETED", "FAILED"],
  FAILED: ["EVALUATING"],
  COMPLETED: [],
};

export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AttemptStatus, to: AttemptStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError("INVALID_TRANSITION", `Cannot move an attempt from ${from} to ${to}`);
  }
}

export const isEditable = (status: AttemptStatus): boolean => status === "DRAFT";

export const allowsEvaluationRetry = (status: AttemptStatus): boolean => status === "FAILED";
