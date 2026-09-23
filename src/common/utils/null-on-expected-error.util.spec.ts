import { nullOnExpectedError } from "./null-on-expected-error.util";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

describe("nullOnExpectedError", () => {
  it("swallows an ApiException to null", () => {
    const error = new NotFoundApiException(
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    expect(nullOnExpectedError(error)).toBeNull();
  });

  it("rethrows anything that isn't an ApiException", () => {
    const error = new Error("db down");
    expect(() => nullOnExpectedError(error)).toThrow("db down");
  });
});
