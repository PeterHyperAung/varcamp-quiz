/**
 * Base error type for expected, user-facing failures.
 *
 * Application and presentation layers translate these into messages; anything
 * that is *not* a `DomainError` is treated as an unexpected bug and must not
 * leak its message to the client.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    code: string,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "The requested resource was not found.") {
    super("not_found", message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "You are not authorized to perform this action.") {
    super("unauthorized", message);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super("validation_failed", message, fieldErrors);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("conflict", message);
  }
}