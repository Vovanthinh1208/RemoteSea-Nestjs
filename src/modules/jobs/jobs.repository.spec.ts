import { JobsRepository } from "./jobs.repository";
import type { PrismaService } from "@/core/database/prisma.service";

// The only repository spec in this module — justified because the
// expiresAt-per-plan computation (the actual bug this fixes) lives entirely
// inside approveJob, with no service-level branch to observe it through.

const DAY_MS = 24 * 60 * 60 * 1000;

const makeRepository = (planType: string | null) => {
  const prisma = {
    job: {
      findUnique: jest.fn((args: { select?: unknown }) =>
        args.select && "planType" in (args.select as object)
          ? Promise.resolve(planType === null ? null : { planType })
          : Promise.resolve({
              status: "ACTIVE",
              publishedAt: new Date(),
              expiresAt: null,
            }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    repository: new JobsRepository(prisma as unknown as PrismaService),
    prisma,
  };
};

describe("JobsRepository.approveJob", () => {
  it("sets expiresAt 30 days out for STANDARD", async () => {
    const { repository, prisma } = makeRepository("STANDARD");
    const before = Date.now();

    await repository.approveJob("job-1");

    const data = (
      prisma.job.updateMany.mock.calls[0][0] as { data: { expiresAt: Date } }
    ).data;
    expect(data.expiresAt).not.toBeNull();
    const deltaDays = (data.expiresAt.getTime() - before) / DAY_MS;
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);
  });

  it("sets expiresAt 60 days out for FEATURED", async () => {
    const { repository, prisma } = makeRepository("FEATURED");
    const before = Date.now();

    await repository.approveJob("job-1");

    const data = (
      prisma.job.updateMany.mock.calls[0][0] as { data: { expiresAt: Date } }
    ).data;
    const deltaDays = (data.expiresAt.getTime() - before) / DAY_MS;
    expect(deltaDays).toBeGreaterThan(59.9);
    expect(deltaDays).toBeLessThan(60.1);
  });

  it("never expires HANDS_ON — matches the 'Unlimited listing' promise at checkout", async () => {
    const { repository, prisma } = makeRepository("HANDS_ON");

    await repository.approveJob("job-1");

    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: null }),
      }),
    );
  });

  it("returns null without writing anything when the job doesn't exist", async () => {
    const { repository, prisma } = makeRepository(null);

    const result = await repository.approveJob("job-1");

    expect(result).toBeNull();
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it("returns null when the CAS write loses (job already left PENDING_REVIEW)", async () => {
    const { repository, prisma } = makeRepository("STANDARD");
    prisma.job.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.approveJob("job-1");

    expect(result).toBeNull();
  });
});
