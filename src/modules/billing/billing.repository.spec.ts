import { BillingRepository } from "./billing.repository";
import type { PrismaService } from "@/core/database/prisma.service";

// The only repository spec in this module — justified because the
// isFeatured-on-payment decision (the actual bug this fixes) lives entirely
// inside this method, with no service-level branch to observe it through.

const makeRepository = (planType: string | null) => {
  const prisma = {
    job: {
      findUnique: jest.fn((args: { select?: unknown; include?: unknown }) =>
        args.include
          ? Promise.resolve({ id: "job-1" })
          : Promise.resolve(planType === null ? null : { planType }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    repository: new BillingRepository(prisma as unknown as PrismaService),
    prisma,
  };
};

describe("BillingRepository.markJobPaidAndSubmitted", () => {
  it("turns on isFeatured for FEATURED", async () => {
    const { repository, prisma } = makeRepository("FEATURED");

    await repository.markJobPaidAndSubmitted("job-1");

    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isFeatured: true }),
      }),
    );
  });

  it("turns on isFeatured for HANDS_ON", async () => {
    const { repository, prisma } = makeRepository("HANDS_ON");

    await repository.markJobPaidAndSubmitted("job-1");

    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isFeatured: true }),
      }),
    );
  });

  it("leaves isFeatured off for STANDARD", async () => {
    const { repository, prisma } = makeRepository("STANDARD");

    await repository.markJobPaidAndSubmitted("job-1");

    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isFeatured: false }),
      }),
    );
  });

  it("returns null without writing anything when the job doesn't exist", async () => {
    const { repository, prisma } = makeRepository(null);

    const result = await repository.markJobPaidAndSubmitted("job-1");

    expect(result).toBeNull();
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it("returns null when the CAS write loses (already paid — replayed webhook)", async () => {
    const { repository, prisma } = makeRepository("FEATURED");
    prisma.job.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.markJobPaidAndSubmitted("job-1");

    expect(result).toBeNull();
  });
});
