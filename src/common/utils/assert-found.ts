import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

export function assertFound<T>(
  value: T | null | undefined,
  message = "Not found",
  code: ErrorCode = ErrorCode.NOT_FOUND,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundApiException(message, code);
  }
}
