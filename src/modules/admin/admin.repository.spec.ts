import { AdminRepository } from "./admin.repository";
import type { PrismaService } from "@/core/database/prisma.service";

// The only repository spec in this module — justified for the same reason as
// JobsRepository.approveJob's: the PENDING_REVIEW-only paidAt ordering (the
// actual fix this covers) lives entirely inside findJobs, with no
// service-level branch to observe it through.

const makeRepository = () => {
  const prisma = {
    job: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return {
    repository: new AdminRepository(prisma as unknown as PrismaService),
    prisma,
  };
};

describe("AdminRepository.findJobs", () => {
  it("orders the PENDING_REVIEW moderation queue by paidAt, not createdAt", async () => {
    const { repository, prisma } = makeRepository();

    await repository.findJobs({ status: "PENDING_REVIEW" }, 0, 20);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { paidAt: "asc" } }),
    );
  });

  it("keeps ordering every other status by createdAt", async () => {
    const { repository, prisma } = makeRepository();

    await repository.findJobs({ status: "ACTIVE" }, 0, 20);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
  });
});
