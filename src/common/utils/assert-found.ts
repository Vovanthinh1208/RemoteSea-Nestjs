import { NotFoundApiException } from "@/common/exceptions/api.exception";

export function assertFound<T>(
  value: T | null | undefined,
  message = "Not found",
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundApiException(message);
  }
}
