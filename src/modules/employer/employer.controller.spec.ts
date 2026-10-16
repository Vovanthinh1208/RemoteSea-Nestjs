import { EmployerController } from "./employer.controller";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { TooManyRequestsApiException } from "@/common/exceptions/api.exception";

describe("PB67 regenerate request cooldown", () => {
  it("S3-PB67-TC04 prevents different company members regenerating the same CV within 30 seconds", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-16T08:00:00Z"));
    try {
      const regenerateApplicationCvAnalysis = jest.fn();
      const controller = new EmployerController(
        { regenerateApplicationCvAnalysis } as never,
        new RateLimitService(),
      );
      const application = { id: "app-1" } as never;
      controller.regenerateApplicationCvAnalysis(
        { id: "member-1" } as never,
        application,
      );
      jest.advanceTimersByTime(29_999);
      expect(() =>
        controller.regenerateApplicationCvAnalysis(
          { id: "member-2" } as never,
          application,
        ),
      ).toThrow(TooManyRequestsApiException);
      expect(regenerateApplicationCvAnalysis).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      controller.regenerateApplicationCvAnalysis(
        { id: "member-2" } as never,
        application,
      );
      expect(regenerateApplicationCvAnalysis).toHaveBeenCalledTimes(2);
      controller.regenerateApplicationCvAnalysis(
        { id: "member-1" } as never,
        { id: "app-2" } as never,
      );
      expect(regenerateApplicationCvAnalysis).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
