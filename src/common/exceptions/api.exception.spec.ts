import { HttpStatus } from "@nestjs/common";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  NotFoundApiException,
  TooManyRequestsApiException,
  UnauthorizedApiException,
  ValidationApiException,
} from "./api.exception";
import { ErrorCode } from "./error-codes";

describe("exception classes: default code (unchanged behavior for existing callers)", () => {
  it("UnauthorizedApiException defaults to UNAUTHORIZED", () => {
    const err = new UnauthorizedApiException();
    expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(err.getResponse()).toEqual({
      error: "Unauthorized",
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it("ForbiddenApiException defaults to FORBIDDEN", () => {
    const err = new ForbiddenApiException();
    expect(err.getResponse()).toEqual({
      error: "Forbidden",
      code: ErrorCode.FORBIDDEN,
    });
  });

  it("NotFoundApiException defaults to NOT_FOUND", () => {
    const err = new NotFoundApiException();
    expect(err.getResponse()).toEqual({
      error: "Not found",
      code: ErrorCode.NOT_FOUND,
    });
  });

  it("ConflictApiException defaults to CONFLICT", () => {
    const err = new ConflictApiException("Conflict");
    expect(err.getResponse()).toEqual({
      error: "Conflict",
      code: ErrorCode.CONFLICT,
    });
  });

  it("BadRequestApiException defaults to BAD_REQUEST", () => {
    const err = new BadRequestApiException("Bad request");
    expect(err.getResponse()).toEqual({
      error: "Bad request",
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it("ValidationApiException always uses VALIDATION_ERROR (single-purpose, no override)", () => {
    const err = new ValidationApiException({ fieldErrors: {}, formErrors: [] });
    expect(err.getResponse()).toEqual({
      error: { fieldErrors: {}, formErrors: [] },
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it("TooManyRequestsApiException always uses RATE_LIMITED (single-purpose, no override)", () => {
    const err = new TooManyRequestsApiException(30);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.retryAfter).toBe(30);
    expect((err.getResponse() as { code: string }).code).toBe(
      ErrorCode.RATE_LIMITED,
    );
  });
});

describe("exception classes: per-instance code override", () => {
  it("UnauthorizedApiException accepts a specific code", () => {
    const err = new UnauthorizedApiException(
      "Invalid email or password",
      ErrorCode.INVALID_CREDENTIALS,
    );
    expect(err.getResponse()).toEqual({
      error: "Invalid email or password",
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it("ForbiddenApiException accepts a specific code", () => {
    const err = new ForbiddenApiException(
      "Only draft or rejected jobs can be edited",
      ErrorCode.JOB_NOT_EDITABLE,
    );
    expect(err.getResponse()).toEqual({
      error: "Only draft or rejected jobs can be edited",
      code: ErrorCode.JOB_NOT_EDITABLE,
    });
  });

  it("NotFoundApiException accepts a specific code", () => {
    const err = new NotFoundApiException(
      "Job not found",
      ErrorCode.JOB_NOT_FOUND,
    );
    expect(err.getResponse()).toEqual({
      error: "Job not found",
      code: ErrorCode.JOB_NOT_FOUND,
    });
  });

  it("ConflictApiException accepts a specific code", () => {
    const err = new ConflictApiException(
      "Already applied",
      ErrorCode.ALREADY_APPLIED,
    );
    expect(err.getResponse()).toEqual({
      error: "Already applied",
      code: ErrorCode.ALREADY_APPLIED,
    });
  });
});
