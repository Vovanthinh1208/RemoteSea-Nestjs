import { EmployerRepository } from "./employer.repository";
import type { PrismaService } from "@/core/database/prisma.service";

// The only repository spec in this module — justified for the same reason as
// JobsRepository.approveJob's: setVerified doubling as "un-suspend" (the
// actual fix this covers) lives entirely inside this one call, with no
// service-level branch to observe it through.

const makeRepository = () => {
  const prisma = {
    employerProfile: { update: jest.fn().mockResolvedValue({}) },
  };
  return {
    repository: new EmployerRepository(prisma as unknown as PrismaService),
    prisma,
  };
};

describe("EmployerRepository.setVerified", () => {
  it("clears suspendedAt when re-verifying — the only admin action that can lift a suspension", async () => {
    const { repository, prisma } = makeRepository();

    await repository.setVerified("employer-1", true);

    expect(prisma.employerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ suspendedAt: null }),
      }),
    );
  });

  it("does not touch suspendedAt when un-verifying (that's suspend()'s own job)", async () => {
    const { repository, prisma } = makeRepository();

    await repository.setVerified("employer-1", false);

    const data = (
      prisma.employerProfile.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data).not.toHaveProperty("suspendedAt");
  });
});
