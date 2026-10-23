import { AlertsRepository } from "./alerts.repository";
import type { PrismaService } from "@/core/database/prisma.service";

describe("AlertsRepository.findActiveAlerts", () => {
  it("does not select alerts for paused users", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AlertsRepository({
      jobAlert: { findMany },
    } as unknown as PrismaService);

    await repository.findActiveAlerts();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, user: { isPaused: false } },
      }),
    );
  });
});
