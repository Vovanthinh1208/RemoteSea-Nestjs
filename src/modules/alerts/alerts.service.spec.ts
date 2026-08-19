import { AlertsService } from "./alerts.service";
import type { AlertsRepository } from "./alerts.repository";
import type { EmailService } from "@/common/services/email.service";

// Ownership is enforced upstream by AlertOwnershipGuard — these just confirm the
// service delegates straight to the repository once that's already been done.

describe("AlertsService.update", () => {
  it("delegates to the repository with the alert id and isActive flag", async () => {
    const updateActive = jest
      .fn()
      .mockResolvedValue({ id: "alert-1", isActive: false });
    const service = new AlertsService(
      { updateActive } as unknown as AlertsRepository,
      {} as EmailService,
    );

    await service.update("alert-1", { isActive: false });
    expect(updateActive).toHaveBeenCalledWith("alert-1", false);
  });
});

describe("AlertsService.remove", () => {
  it("deletes via the repository and reports success", async () => {
    const deleteAlert = jest.fn().mockResolvedValue(undefined);
    const service = new AlertsService(
      { delete: deleteAlert } as unknown as AlertsRepository,
      {} as EmailService,
    );

    await expect(service.remove("alert-1")).resolves.toEqual({ success: true });
    expect(deleteAlert).toHaveBeenCalledWith("alert-1");
  });
});

describe("AlertsService.dispatchCron", () => {
  it("skips a run that starts while a previous one on this instance is still in progress", async () => {
    let resolveFindActive!: (alerts: []) => void;
    const findActiveAlerts = jest.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveFindActive = resolve;
        }),
    );
    const service = new AlertsService(
      { findActiveAlerts } as unknown as AlertsRepository,
      {} as EmailService,
    );

    // Starts, synchronously marks itself in-progress, then awaits findActiveAlerts.
    const first = service.dispatchCron();
    // Starts while the flag is still set — should short-circuit without
    // touching the repository at all.
    const secondResult = await service.dispatchCron();

    expect(secondResult).toEqual({ processed: 0, sent: 0 });
    expect(findActiveAlerts).toHaveBeenCalledTimes(1);

    resolveFindActive([]);
    await expect(first).resolves.toEqual({ processed: 0, sent: 0 });
  });

  it("allows a new run once the previous one has finished", async () => {
    const findActiveAlerts = jest.fn().mockResolvedValue([]);
    const service = new AlertsService(
      { findActiveAlerts } as unknown as AlertsRepository,
      {} as EmailService,
    );

    await service.dispatchCron();
    await service.dispatchCron();

    expect(findActiveAlerts).toHaveBeenCalledTimes(2);
  });
});

describe("AlertsService.dispatchCron — weeklyDigest gating", () => {
  const weeklyAlert = {
    id: "alert-1",
    frequency: "WEEKLY",
    lastSentAt: null,
    userId: "user-1",
    user: { email: "jane@example.com" },
    categories: [],
  };

  it("skips a WEEKLY alert when weeklyDigest is disabled, without matching jobs or claiming it", async () => {
    const findActiveAlerts = jest.fn().mockResolvedValue([weeklyAlert]);
    const weeklyDigestEnabled = jest.fn().mockResolvedValue(false);
    const findMatchingJobs = jest.fn();
    const claimForSend = jest.fn();
    const service = new AlertsService(
      {
        findActiveAlerts,
        weeklyDigestEnabled,
        findMatchingJobs,
        claimForSend,
      } as unknown as AlertsRepository,
      {} as EmailService,
    );

    const result = await service.dispatchCron();

    expect(weeklyDigestEnabled).toHaveBeenCalledWith("user-1");
    expect(findMatchingJobs).not.toHaveBeenCalled();
    expect(claimForSend).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0 });
  });

  it("sends a WEEKLY alert as usual when weeklyDigest is enabled", async () => {
    const findActiveAlerts = jest.fn().mockResolvedValue([weeklyAlert]);
    const weeklyDigestEnabled = jest.fn().mockResolvedValue(true);
    const findMatchingJobs = jest.fn().mockResolvedValue([{ id: "job-1" }]);
    const claimForSend = jest.fn().mockResolvedValue(true);
    const sendJobAlertEmail = jest.fn().mockResolvedValue(undefined);
    const service = new AlertsService(
      {
        findActiveAlerts,
        weeklyDigestEnabled,
        findMatchingJobs,
        claimForSend,
      } as unknown as AlertsRepository,
      { sendJobAlertEmail } as unknown as EmailService,
    );

    const result = await service.dispatchCron();

    expect(sendJobAlertEmail).toHaveBeenCalledWith("jane@example.com", [
      { id: "job-1" },
    ]);
    expect(result).toEqual({ processed: 1, sent: 1 });
  });

  it("never consults weeklyDigest for a non-WEEKLY alert", async () => {
    const findActiveAlerts = jest
      .fn()
      .mockResolvedValue([{ ...weeklyAlert, frequency: "IMMEDIATE" }]);
    const weeklyDigestEnabled = jest.fn();
    const findMatchingJobs = jest.fn().mockResolvedValue([]);
    const service = new AlertsService(
      {
        findActiveAlerts,
        weeklyDigestEnabled,
        findMatchingJobs,
      } as unknown as AlertsRepository,
      {} as EmailService,
    );

    await service.dispatchCron();

    expect(weeklyDigestEnabled).not.toHaveBeenCalled();
  });
});
