import { AlertsService } from "./alerts.service";
import { createAlertSchema } from "./dto/create-alert.dto";
import { updateAlertSchema } from "./dto/update-alert.dto";

describe("Sprint4 alert validation and SMTP recovery", () => {
  it("rejects blank names, nonpositive salary and invalid category IDs", () => {
    for (const input of [
      { name: "  " },
      { name: "React", salaryMin: 0 },
      { name: "React", salaryMin: -1 },
      { name: "React", categoryIds: ["bad"] },
    ]) {
      expect(createAlertSchema.safeParse(input).success).toBe(false);
    }
    expect(
      updateAlertSchema.parse({ keywords: null, level: null, categoryIds: [] }),
    ).toEqual({ keywords: null, level: null, categoryIds: [] });
  });
  it("releases only its own failed claim and retries the same window on the next run", async () => {
    const alert = {
      id: "a",
      userId: "u",
      user: { email: "test@example.test" },
      frequency: "DAILY",
      lastSentAt: null,
      categories: [],
    };
    const repository = {
      findActiveAlerts: jest.fn().mockResolvedValue([alert]),
      instantMatchAlertsEnabled: jest.fn().mockResolvedValue(true),
      findMatchingJobs: jest.fn().mockResolvedValue([{ id: "j" }]),
      claimForSend: jest.fn().mockResolvedValue(true),
      releaseFailedSend: jest.fn().mockResolvedValue(undefined),
    };
    const email = {
      sendJobAlertEmail: jest
        .fn()
        .mockRejectedValueOnce(new Error("SMTP unavailable"))
        .mockResolvedValueOnce(undefined),
    };
    const service = new AlertsService(repository as never, email as never);
    await expect(service.dispatchCron()).resolves.toEqual({
      processed: 1,
      sent: 0,
    });
    expect(repository.releaseFailedSend).toHaveBeenCalledWith(
      "a",
      expect.any(Date),
      null,
    );
    await expect(service.dispatchCron()).resolves.toEqual({
      processed: 1,
      sent: 1,
    });
    expect(email.sendJobAlertEmail).toHaveBeenCalledTimes(2);
    expect(repository.releaseFailedSend).toHaveBeenCalledTimes(1);
  });
  it("does not send an email when another worker wins the claim", async () => {
    const repository = {
      findActiveAlerts: jest.fn().mockResolvedValue([
        {
          id: "a",
          userId: "u",
          user: { email: "test@example.test" },
          frequency: "DAILY",
          lastSentAt: null,
          categories: [],
        },
      ]),
      instantMatchAlertsEnabled: jest.fn().mockResolvedValue(true),
      findMatchingJobs: jest.fn().mockResolvedValue([{ id: "j" }]),
      claimForSend: jest.fn().mockResolvedValue(false),
    };
    const email = { sendJobAlertEmail: jest.fn() };
    const service = new AlertsService(repository as never, email as never);
    await expect(service.dispatchCron()).resolves.toEqual({
      processed: 1,
      sent: 0,
    });
    expect(email.sendJobAlertEmail).not.toHaveBeenCalled();
  });
});
