import { SalaryRange } from "./salary-range";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

describe("SalaryRange.create", () => {
  it("accepts max >= min", () => {
    const range = SalaryRange.create(1000, 2000);
    expect(range.min).toBe(1000);
    expect(range.max).toBe(2000);
  });

  it("accepts max === min", () => {
    expect(() => SalaryRange.create(1000, 1000)).not.toThrow();
  });

  it("rejects max < min", () => {
    expect(() => SalaryRange.create(2000, 1000)).toThrow(
      BadRequestApiException,
    );
  });

  it("throws with the SALARY_RANGE_INVALID error code", () => {
    try {
      SalaryRange.create(2000, 1000);
      throw new Error("expected create to throw");
    } catch (err) {
      expect((err as BadRequestApiException).getResponse()).toMatchObject({
        code: ErrorCode.SALARY_RANGE_INVALID,
      });
    }
  });
});

describe("SalaryRange.merge", () => {
  const existing = { salaryMin: 1000, salaryMax: 2000 };

  it("validates the effective range when only one field is patched", () => {
    expect(() => SalaryRange.merge(existing, { salaryMax: 500 })).toThrow(
      BadRequestApiException,
    );
    expect(() => SalaryRange.merge(existing, { salaryMin: 2500 })).toThrow(
      BadRequestApiException,
    );
  });

  it("allows a valid partial patch", () => {
    const range = SalaryRange.merge(existing, { salaryMax: 3000 });
    expect(range).toEqual({ min: 1000, max: 3000 });
  });

  it("returns null when either side is unset (nothing to validate)", () => {
    expect(
      SalaryRange.merge({ salaryMin: null, salaryMax: 2000 }, {}),
    ).toBeNull();
    expect(
      SalaryRange.merge({ salaryMin: 1000, salaryMax: null }, {}),
    ).toBeNull();
  });
});
