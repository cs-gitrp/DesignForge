export type DomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "EMPTY_SUBMISSION"
  | "DUPLICATE_SUBMISSION"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "EVALUATION_FAILED";

/** Errors the UI is expected to render as a message, not as a crash. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} not found`);
