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
